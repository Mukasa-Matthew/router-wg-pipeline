const { RouterOSAPI } = require('node-routeros');

/**
 * Test MikroTik API connection
 */
async function testConnection(ip, user, pass, port = 8728) {
  try {
    const conn = new RouterOSAPI({ host: ip, user, password: pass, port });
    await conn.connect();
    conn.close();
    return true;
  } catch {
    return false;
  }
}

const MIKROTIK_TIMEOUT_MS = 45000;

function withTimeout(promise, ms = MIKROTIK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MikroTik operation timed out')), ms)
    ),
  ]);
}

/**
 * Connect to MikroTik - ALWAYS use wg_ip (WireGuard tunnel IP) for data isolation
 * Routers must have tunnel up to be managed
 */
async function connect(router) {
  const ip = router.wg_ip || router.lan_ip;
  if (!ip) throw new Error('Router has no connection IP (wg_ip required)');
  const conn = new RouterOSAPI({
    host: ip,
    user: router.username,
    password: router.password,
    port: router.api_port || 8728,
    timeout: Math.ceil(MIKROTIK_TIMEOUT_MS / 1000),
  });
  await withTimeout(conn.connect());
  return conn;
}

/**
 * Connect by explicit IP (for initial add flow or when IP is known)
 */
async function connectByIp(ip, username, password, port = 8728) {
  const conn = new RouterOSAPI({ host: ip, user: username, password, port });
  await conn.connect();
  return conn;
}

/**
 * Add WireGuard interface on MikroTik
 */
async function addWireGuardInterface(router, privateKey, wgIp) {
  const conn = await connect(router);

  try {
    await conn.write('/interface/wireguard/add', [
      '=name=wg-vps',
      '=listen-port=13231',
      `=private-key=${privateKey}`,
    ]);

    await conn.write('/ip/address/add', [
      `=address=${wgIp}/24`,
      '=interface=wg-vps',
    ]);
  } finally {
    conn.close();
  }
}

/**
 * Add VPS as WireGuard peer on MikroTik
 */
async function addWireGuardPeer(router) {
  const conn = await connect(router);

  try {
    await conn.write('/interface/wireguard/peers/add', [
      '=interface=wg-vps',
      `=public-key=${process.env.WG_PUBLIC_KEY}`,
      `=endpoint-address=${process.env.VPS_IP}`,
      `=endpoint-port=${process.env.WG_PORT}`,
      '=allowed-address=10.10.0.0/24',
      '=persistent-keepalive=25',
    ]);
  } finally {
    conn.close();
  }
}

/**
 * Get router stats (CPU, RAM, uptime)
 */
async function getRouterStats(router) {
  const conn = await connect(router);
  try {
    const [resources] = await conn.write('/system/resource/print');
    const [identity] = await conn.write('/system/identity/print');
    return { resources, identity };
  } finally {
    conn.close();
  }
}

/**
 * Get active hotspot users
 */
async function getActiveHotspotUsers(router) {
  const conn = await connect(router);
  try {
    const users = await withTimeout(conn.write('/ip/hotspot/active/print'));
    return users;
  } finally {
    conn.close();
  }
}

/**
 * Delete hotspot user from MikroTik by username
 */
async function deleteHotspotUser(router, username) {
  const conn = await connect(router);
  try {
    const users = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
    if (!users || users.length === 0) {
      return { success: true, note: 'Not found on MikroTik' };
    }
    const mikrotikId = users[0]['.id'];
    await conn.write('/ip/hotspot/user/remove', [`=.id=${mikrotikId}`]);
    return { success: true };
  } finally {
    conn.close();
  }
}

/**
 * Reboot router
 */
async function rebootRouter(router) {
  const conn = await connect(router);
  try {
    await conn.write('/system/reboot');
  } finally {
    conn.close();
  }
}

/**
 * Convert validity string to MikroTik limit-uptime format.
 * e.g. "1d" -> "1d", "6h" -> "6h", "1w" -> "7d"
 */
function validityToUptime(validity) {
  if (!validity || typeof validity !== 'string') return null;
  validity = validity.trim().toLowerCase();
  if (!validity) return null;
  if (validity.endsWith('d')) return validity;
  if (validity.endsWith('h')) return validity;
  if (validity.endsWith('m')) return validity;
  if (validity.endsWith('w')) {
    const m = validity.match(/^(\d+)w$/);
    if (m) {
      const weeks = parseInt(m[1], 10);
      return `${weeks * 7}d`;
    }
  }
  return validity;
}

/**
 * Generate random string for voucher usernames
 */
function generateRandom(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get hotspot profiles from MikroTik
 */
async function getHotspotProfiles(router) {
  const conn = await connect(router);
  try {
    const profiles = await conn.write('/ip/hotspot/user/profile/print');
    return Array.isArray(profiles) ? profiles : [];
  } finally {
    conn.close();
  }
}

/**
 * Create hotspot profile on MikroTik
 * Profiles have session-timeout=0s so they never control time.
 * All time control comes from limit-uptime on each voucher.
 */
async function createHotspotProfile(router, profileData) {
  const conn = await connect(router);
  try {
    const params = [
      `=name=${profileData.profile_name}`,
      `=shared-users=${profileData.shared_users || 1}`,
      '=session-timeout=0s',
      '=keepalive-timeout=none',
      '=add-mac-cookie=yes',
    ];
    if (profileData.idle_timeout) {
      params.push(`=idle-timeout=${profileData.idle_timeout}`);
    }
    if (profileData.rate_limit) {
      params.push(`=rate-limit=${profileData.rate_limit}`);
    }
    await conn.write('/ip/hotspot/user/profile/add', params);
    return { success: true };
  } finally {
    conn.close();
  }
}

/**
 * Update hotspot profile on MikroTik
 */
async function updateHotspotProfile(router, profileName, profileData) {
  const conn = await connect(router);
  try {
    const profiles = await conn.write('/ip/hotspot/user/profile/print', [
      `?name=${profileName}`,
    ]);
    if (!profiles || !profiles.length) {
      throw new Error(`Profile ${profileName} not found on MikroTik`);
    }
    const mikrotikId = profiles[0]['.id'] || profiles[0].id;
    const params = [`=.id=${mikrotikId}`];
    if (profileData.session_timeout)
      params.push(`=session-timeout=${profileData.session_timeout}`);
    if (profileData.idle_timeout)
      params.push(`=idle-timeout=${profileData.idle_timeout}`);
    if (profileData.rate_limit)
      params.push(`=rate-limit=${profileData.rate_limit}`);
    if (profileData.shared_users != null)
      params.push(`=shared-users=${profileData.shared_users}`);
    await conn.write('/ip/hotspot/user/profile/set', params);
    return { success: true };
  } finally {
    conn.close();
  }
}

/**
 * Delete hotspot profile from MikroTik
 */
async function deleteHotspotProfile(router, profileName) {
  const conn = await connect(router);
  try {
    const profiles = await conn.write('/ip/hotspot/user/profile/print', [
      `?name=${profileName}`,
    ]);
    if (!profiles || !profiles.length) {
      throw new Error(`Profile ${profileName} not found`);
    }
    const mikrotikId = profiles[0]['.id'] || profiles[0].id;
    await conn.write('/ip/hotspot/user/profile/remove', [`=.id=${mikrotikId}`]);
    return { success: true };
  } finally {
    conn.close();
  }
}

/**
 * Generate vouchers on MikroTik (hotspot users)
 * ALWAYS sets limit-uptime on each voucher - profiles have session-timeout=0s.
 */
async function generateVouchersOnMikrotik(router, profileName, count, prefix = 'v', validity) {
  const limitUptime = validityToUptime(validity);
  if (!limitUptime) {
    throw new Error(`Invalid validity "${validity}" - must be e.g. 1d, 6h, 1w, 30d`);
  }

  const conn = await connect(router);
  const vouchers = [];
  try {
    for (let i = 0; i < count; i++) {
      const username = `${prefix}${generateRandom(6)}`;
      const params = [
        `=name=${username}`,
        `=password=${username}`,
        `=profile=${profileName}`,
        `=comment=${profileName} Voucher`,
        `=limit-uptime=${limitUptime}`,
      ];
      await conn.write('/ip/hotspot/user/add', params);
      vouchers.push({ username, password: username, profile: profileName });
    }
    return vouchers;
  } finally {
    conn.close();
  }
}

/**
 * Fix profile time settings on MikroTik (session-timeout=0s, keepalive-timeout=none, add-mac-cookie=yes)
 */
async function fixProfileOnMikrotik(router, profileName) {
  const profiles = await getHotspotProfiles(router);
  const p = profiles.find((x) => (x.name || x['profile-name']) === profileName);
  if (!p) throw new Error(`Profile ${profileName} not found on MikroTik`);
  const mikrotikId = p['.id'] || p.id;

  const conn = await connect(router);
  try {
    await conn.write('/ip/hotspot/user/profile/set', [
      `=.id=${mikrotikId}`,
      '=session-timeout=0s',
      '=keepalive-timeout=none',
      '=add-mac-cookie=yes',
    ]);
    return true;
  } finally {
    conn.close();
  }
}

module.exports = {
  testConnection,
  connect,
  addWireGuardInterface,
  addWireGuardPeer,
  getRouterStats,
  getActiveHotspotUsers,
  rebootRouter,
  generateVouchersOnMikrotik,
  getHotspotProfiles,
  createHotspotProfile,
  updateHotspotProfile,
  deleteHotspotProfile,
  deleteHotspotUser,
  fixProfileOnMikrotik,
  validityToUptime,
};
