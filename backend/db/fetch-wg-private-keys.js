/**
 * Fill wg_private_key in routers-recovery.json by querying each MikroTik over the tunnel (from VPS).
 *
 *   cd /var/www/html/routerhub/backend
 *   # Edit routers-recovery.json: correct wg_public_key per site, real API username/password per router
 *   node db/fetch-wg-private-keys.js db/routers-recovery.json
 *   # Writes db/routers-recovery.filled.json — then:
 *   node db/recover-router-tunnel.js db/routers-recovery.filled.json
 *
 * Requires: API reachable on 10.10.0.x:8728 from this host, user with rights to read WireGuard.
 */
const fs = require('fs');
const path = require('path');
const { fetchWireGuardPrivateKey, shouldFetchPrivateKey } = require('./wgKeyFetch');

async function main() {
  const inPath = path.resolve(process.argv[2] || path.join(__dirname, 'routers-recovery.json'));
  const outPath =
    process.argv[3] || path.join(path.dirname(inPath), 'routers-recovery.filled.json');

  if (!fs.existsSync(inPath)) {
    console.error('Not found:', inPath);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  if (!Array.isArray(raw.routers)) {
    console.error('JSON needs "routers" array');
    process.exit(1);
  }

  for (const r of raw.routers) {
    const name = r.name || r.wg_ip;
    if (!shouldFetchPrivateKey(r, r.wg_private_key)) {
      console.log(`Skip (already has key): ${name}`);
      continue;
    }
    console.log(`Fetch: ${name} @ ${r.wg_ip}:${r.api_port || 8728}`);
    r.wg_private_key = await fetchWireGuardPrivateKey(
      r.wg_ip,
      r.username,
      r.password,
      r.api_port || 8728,
      r.wg_public_key
    );
    console.log(`  OK`);
  }

  fs.writeFileSync(outPath, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`\nWrote: ${outPath}`);
  console.log(`Next: node db/recover-router-tunnel.js ${outPath}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
