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

function isUnknownReplyError(err) {
  const msg = (err && err.message) ? String(err.message) : String(err);
  return /UNKNOWNREPLY|unknown.?reply/i.test(msg);
}

function isTagOrReplyError(err) {
  const msg = (err && err.message) ? String(err.message) : String(err);
  return /UNKNOWNREPLY|UNREGISTEREDTAG|unknown.?reply|unregistered.?tag/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Per-router connection queue: only one MikroTik API operation at a time per router. */
const routerLocks = new Map();

async function withRouterLock(router, fn) {
  const key = router.wg_ip || router.lan_ip || `router-${router.id}`;
  const prev = routerLocks.get(key) || Promise.resolve();
  let release;
  const done = new Promise((r) => { release = r; });
  routerLocks.set(key, prev.then(() => done));
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

/**
 * Execute a MikroTik operation with retry on UNKNOWNREPLY/UNREGISTEREDTAG.
 * Closes any existing connection before retry. Max 2 retries, 1s delay.
 * Throws a clear error if all retries fail (avoids 502 from unhandled errors).
 */
async function withMikrotikRetry(router, operation) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let conn = null;
    try {
      conn = await connect(router);
      const result = await operation(conn);
      return result;
    } catch (err) {
      lastErr = err;
      if (conn) {
        try {
          conn.close();
        } catch (_) {}
        conn = null;
      }
      if (attempt < maxAttempts - 1 && isTagOrReplyError(err)) {
        await sleep(1000);
      } else {
        const msg = isTagOrReplyError(err)
          ? `MikroTik API error after ${maxAttempts} attempts (multiple connections may conflict). Try again.`
          : (lastErr && lastErr.message) || String(lastErr);
        throw new Error(msg);
      }
    } finally {
      if (conn) {
        try {
          conn.close();
        } catch (_) {}
      }
    }
  }
  throw lastErr;
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
  // Prevent unhandled 'error' events from crashing the process/socket.
  // node-routeros may emit 'error' asynchronously (e.g. UNKNOWNREPLY / socket issues).
  conn.on('error', () => {});
  await withTimeout(conn.connect());
  return conn;
}

/**
 * Connect by explicit IP (for initial add flow or when IP is known)
 */
async function connectByIp(ip, username, password, port = 8728) {
  const conn = new RouterOSAPI({ host: ip, user: username, password, port });
  conn.on('error', () => {});
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
 * Uses connection queue to avoid UNREGISTEREDTAG with concurrent operations.
 */
async function getRouterStats(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const [resources] = await conn.write('/system/resource/print');
      const [identity] = await conn.write('/system/identity/print');
      return { resources, identity };
    } finally {
      conn.close();
    }
  });
}

/**
 * Get active hotspot users
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function getActiveHotspotUsers(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const users = await withTimeout(conn.write('/ip/hotspot/active/print'));
      return users;
    } finally {
      conn.close();
    }
  });
}

/**
 * Get active hotspot users (slim fields only; faster).
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function getActiveHotspotUsersSlim(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const users = await withTimeout(
        conn.write('/ip/hotspot/active/print', [
          '=.proplist=user,address,mac-address,uptime,session-time-left',
        ])
      );
      return users;
    } finally {
      conn.close();
    }
  });
}

/**
 * Get DHCP leases (slim) for device name lookup by MAC.
 * Returns array with mac-address, host-name, comment, address.
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function getDhcpLeasesSlim(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const leases = await withTimeout(
        conn.write('/ip/dhcp-server/lease/print', [
          '=.proplist=mac-address,host-name,comment,address',
        ])
      );
      return leases;
    } finally {
      conn.close();
    }
  });
}

/**
 * Get hotspot users (slim) so we can map username -> limit-uptime.
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function getHotspotUsersSlim(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const users = await withTimeout(
        conn.write('/ip/hotspot/user/print', ['=.proplist=name,limit-uptime'])
      );
      return users;
    } finally {
      conn.close();
    }
  });
}

function parseRosDurationToSeconds(s) {
  if (!s || typeof s !== 'string') return null;
  const str = s.trim().toLowerCase();
  if (!str) return null;

  // RouterOS durations can include w/d/h/m/s or be like "1d02:03:04"
  // We'll handle w/d/h/m/s tokens and also hh:mm:ss.
  let total = 0;

  const tokenRe = /(\d+)\s*(w|d|h|m|s)/g;
  let m;
  while ((m = tokenRe.exec(str)) !== null) {
    const val = parseInt(m[1], 10);
    const unit = m[2];
    if (unit === 'w') total += val * 7 * 24 * 3600;
    if (unit === 'd') total += val * 24 * 3600;
    if (unit === 'h') total += val * 3600;
    if (unit === 'm') total += val * 60;
    if (unit === 's') total += val;
  }
  if (total > 0) return total;

  // hh:mm:ss (optionally prefixed by Nd)
  // Examples: "02:03:04" or "1d02:03:04"
  const daySplit = str.match(/^(\d+)d(\d{1,2}):(\d{2}):(\d{2})$/);
  if (daySplit) {
    const d = parseInt(daySplit[1], 10);
    const hh = parseInt(daySplit[2], 10);
    const mm = parseInt(daySplit[3], 10);
    const ss = parseInt(daySplit[4], 10);
    return d * 24 * 3600 + hh * 3600 + mm * 60 + ss;
  }
  const hms = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) {
    const hh = parseInt(hms[1], 10);
    const mm = parseInt(hms[2], 10);
    const ss = parseInt(hms[3], 10);
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

function formatSecondsToRosDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  let s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join('');
}

/**
 * Delete hotspot user from MikroTik by username
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function deleteHotspotUser(router, username) {
  return withRouterLock(router, async () => {
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
  });
}

async function rebootRouter(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      await conn.write('/system/reboot');
    } finally {
      conn.close();
    }
  });
}

/**
 * Enable WebFig (www) and Winbox services on MikroTik - bind to all interfaces (0.0.0.0)
 * Use when WebFig/Winbox work locally but not over WireGuard (services may be bound to LAN only).
 */
async function enableWebfigAndWinbox(router) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const services = await conn.write('/ip/service/print');
      const arr = Array.isArray(services) ? services : [];
      for (const svc of arr) {
        const name = (svc.name || svc['service-name'] || '').toLowerCase();
        if (name === 'www' || name === 'winbox') {
          const id = svc['.id'] || svc.id;
          if (id) {
            await conn.write('/ip/service/set', [
              `=.id=${id}`,
              '=disabled=no',
              '=address=0.0.0.0/0',
            ]);
          }
        }
      }
      return { success: true };
    } finally {
      conn.close();
    }
  });
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
 * Uses connection queue to avoid UNREGISTEREDTAG when billing/dashboard call concurrently.
 */
async function getHotspotProfiles(router) {
  return withRouterLock(router, () =>
    withMikrotikRetry(router, async (conn) => {
      const profiles = await conn.write('/ip/hotspot/user/profile/print');
      return Array.isArray(profiles) ? profiles : [];
    })
  );
}

/**
 * Create hotspot profile on MikroTik
 * Profiles have session-timeout=0s so they never control time.
 * All time control comes from limit-uptime on each voucher.
 * Uses connection queue to avoid UNREGISTEREDTAG.
 */
async function createHotspotProfile(router, profileData) {
  return withRouterLock(router, async () => {
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
  });
}

/**
 * Update hotspot profile on MikroTik
 * Uses connection queue + retry to avoid UNKNOWNREPLY/UNREGISTEREDTAG from concurrent connections.
 */
async function updateHotspotProfile(router, profileName, profileData) {
  return withRouterLock(router, () =>
    withMikrotikRetry(router, async (conn) => {
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
  })
  );
}

/**
 * Delete hotspot profile from MikroTik
 * Uses connection queue + retry to avoid UNKNOWNREPLY/UNREGISTEREDTAG from concurrent connections.
 * If profile is not found on MikroTik, returns success anyway (allows cleaning orphaned DB records).
 */
async function deleteHotspotProfile(router, profileName) {
  return withRouterLock(router, () =>
    withMikrotikRetry(router, async (conn) => {
    const profiles = await conn.write('/ip/hotspot/user/profile/print', [
      `?name=${profileName}`,
    ]);
    if (!profiles || !profiles.length) {
      return { success: true, notFoundOnMikrotik: true };
    }
    const mikrotikId = profiles[0]['.id'] || profiles[0].id;
    await conn.write('/ip/hotspot/user/profile/remove', [`=.id=${mikrotikId}`]);
    return { success: true };
  })
  );
}

/**
 * Generate vouchers on MikroTik (hotspot users)
 * ALWAYS sets limit-uptime on each voucher - profiles have session-timeout=0s.
 * Uses connection queue + retry to handle UNREGISTEREDTAG (flaky MikroTik API).
 */
async function generateVouchersOnMikrotik(router, profileName, count, prefix = 'v', validity) {
  const limitUptime = validityToUptime(validity);
  if (!limitUptime) {
    throw new Error(`Invalid validity "${validity}" - must be e.g. 1d, 6h, 1w, 30d`);
  }

  return withRouterLock(router, () =>
    withMikrotikRetry(router, async (conn) => {
      const vouchers = [];
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
    })
  );
}

/**
 * Fix profile time settings on MikroTik (session-timeout=0s, keepalive-timeout=none, add-mac-cookie=yes)
 * Uses connection queue - does print+set in one connection to avoid deadlock.
 */
async function fixProfileOnMikrotik(router, profileName) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      const profiles = await conn.write('/ip/hotspot/user/profile/print');
      const arr = Array.isArray(profiles) ? profiles : [];
      const p = arr.find((x) => (x.name || x['profile-name']) === profileName);
      if (!p) throw new Error(`Profile ${profileName} not found on MikroTik`);
      const mikrotikId = p['.id'] || p.id;
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
  });
}

/**
 * Run an operation with a locked MikroTik connection. Use when you need custom API calls.
 * Ensures only one operation per router at a time (avoids UNREGISTEREDTAG).
 */
async function withLockedConnection(router, fn) {
  return withRouterLock(router, async () => {
    const conn = await connect(router);
    try {
      return await fn(conn);
    } finally {
      conn.close();
    }
  });
}

module.exports = {
  testConnection,
  connect,
  withLockedConnection,
  addWireGuardInterface,
  addWireGuardPeer,
  getRouterStats,
  getActiveHotspotUsers,
  getActiveHotspotUsersSlim,
  getDhcpLeasesSlim,
  getHotspotUsersSlim,
  parseRosDurationToSeconds,
  formatSecondsToRosDuration,
  rebootRouter,
  enableWebfigAndWinbox,
  generateVouchersOnMikrotik,
  getHotspotProfiles,
  createHotspotProfile,
  updateHotspotProfile,
  deleteHotspotProfile,
  deleteHotspotUser,
  fixProfileOnMikrotik,
  validityToUptime,
};
