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
  });
  await conn.connect();
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
    const users = await conn.write('/ip/hotspot/active/print');
    return users;
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
 */
async function createHotspotProfile(router, profileData) {
  const conn = await connect(router);
  try {
    const params = [
      `=name=${profileData.profile_name}`,
      `=shared-users=${profileData.shared_users || 1}`,
      '=keepalive-timeout=none',
    ];
    if (profileData.session_timeout || profileData.validity) {
      params.push(
        `=session-timeout=${profileData.session_timeout || profileData.validity}`
      );
      params.push('=add-mac-cookie=yes');
    }
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
 * Uses limit-uptime so time counts cumulatively across disconnect/reconnect
 * (unlike session-timeout which resets each session)
 * @param {Object} router - Router record
 * @param {string} profile - Profile name
 * @param {number} count - Number of vouchers
 * @param {string} prefix - Username prefix
 * @param {string} [limitUptime] - Validity e.g. "24h", "7d" - enforces cumulative time limit
 */
async function generateVouchersOnMikrotik(router, profile, count, prefix = 'v', limitUptime = null) {
  const conn = await connect(router);
  const vouchers = [];

  try {
    for (let i = 0; i < count; i++) {
      const username = `${prefix}${generateRandom(6)}`;
      const params = [
        `=name=${username}`,
        `=password=${username}`,
        `=profile=${profile}`,
      ];
      if (limitUptime) {
        params.push(`=limit-uptime=${limitUptime}`);
      }
      await conn.write('/ip/hotspot/user/add', params);
      vouchers.push({ username, password: username, profile });
    }
    return vouchers;
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
};
