/**
 * Read WireGuard private key from a MikroTik over RouterOS API (matches VPS peer by public key).
 */
const { RouterOSAPI } = require('node-routeros');

const TIMEOUT_MS = Math.min(
  Math.max(parseInt(process.env.WG_KEY_FETCH_TIMEOUT_MS || '45000', 10) || 45000, 5000),
  300000
);

function normKey(k) {
  return String(k || '').trim();
}

/**
 * @returns {Promise<string>}
 */
async function fetchWireGuardPrivateKey(host, user, pass, port, expectedPublicKey) {
  const conn = new RouterOSAPI({
    host,
    user,
    password: pass,
    port: port || 8728,
    timeout: Math.ceil(TIMEOUT_MS / 1000),
  });
  conn.on('error', () => {});
  await Promise.race([
    conn.connect(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API connect timeout')), TIMEOUT_MS)
    ),
  ]);
  try {
    const rows = await Promise.race([
      conn.write('/interface/wireguard/print', ['=.proplist=name,private-key,public-key']),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API print timeout')), TIMEOUT_MS)
      ),
    ]);
    const arr = Array.isArray(rows) ? rows : [];
    const exp = normKey(expectedPublicKey);
    for (const row of arr) {
      const pub = normKey(row['public-key']);
      if (pub && pub === exp) {
        const priv = normKey(row['private-key']);
        if (!priv) {
          throw new Error(
            'Matched interface but private-key is empty (try Winbox: Interfaces → WireGuard → copy key)'
          );
        }
        return priv;
      }
    }
    if (arr.length === 1 && exp) {
      const only = arr[0];
      const pub = normKey(only['public-key']);
      if (pub === exp || !only['public-key']) {
        const priv = normKey(only['private-key']);
        if (priv) return priv;
      }
    }
    const names = arr.map((r) => r.name || '?').join(', ');
    throw new Error(
      `No WireGuard row with this public-key. Interfaces: ${names || 'none'}. Check wg_public_key in JSON.`
    );
  } finally {
    try {
      conn.close();
    } catch (_) {}
  }
}

function needsPrivateKeyFetch(v) {
  const s = normKey(v);
  if (!s) return true;
  if (/paste|PASTE|YOUR_API|your_api|FROM_MIKROTIK|PULL_VIA_API|pull_via_api/i.test(s)) return true;
  if (s.length < 40) return true;
  return false;
}

/** True if this router row should load wg_private_key from MikroTik API (--fetch-keys). */
function shouldFetchPrivateKey(router, wgPrivateKeyValue) {
  if (router && router.fetch_private_key === true) {
    const s = normKey(wgPrivateKeyValue);
    if (s.length >= 40 && !/paste|PASTE|YOUR_API|FROM_MIKROTIK|PULL_VIA_API|pull_via_api/i.test(s)) {
      return false;
    }
    return true;
  }
  return needsPrivateKeyFetch(wgPrivateKeyValue);
}

module.exports = {
  fetchWireGuardPrivateKey,
  needsPrivateKeyFetch,
  shouldFetchPrivateKey,
  normKey,
};
