const db = require('../config/database');
const mikrotikService = require('./mikrotikService');
const wireguardService = require('./wireguardService');
const mikhmonService = require('./mikhmonService');

/**
 * Add router - saves to DB, adds peer to VPS. Admin runs connect commands on MikroTik manually.
 * Flow: test connection -> generate keys -> assign wg_ip -> add to VPS -> save DB
 */
async function addRouter(routerData, onStep) {
  const emit = (step, message, status = 'pending') => {
    if (onStep) onStep({ step, message, status });
  };

  const initialIp = routerData.lan_ip;
  let publicKey = null;
  let wgIp = null;
  let routerId = null;

  const skipConnectionTest = routerData.skipConnectionTest === true;

  try {
    if (!skipConnectionTest) {
      emit(1, 'Testing MikroTik connection...', 'active');
      const connected = await mikrotikService.testConnection(
        initialIp,
        routerData.username,
        routerData.password,
        routerData.api_port || 8728
      );
      if (!connected) throw new Error('Cannot connect to MikroTik API');
      emit(1, 'MikroTik connected', 'done');
    } else {
      emit(1, 'Skipped (manual setup)', 'done');
    }

    emit(2, 'Generating WireGuard keys...', 'active');
    const { privateKey, publicKey: pk } = await wireguardService.generateKeypair();
    publicKey = pk;
    emit(2, 'WireGuard keys generated', 'done');

    emit(3, 'Assigning WireGuard IP...', 'active');
    wgIp = await wireguardService.getNextAvailableIP();
    emit(3, `Assigned IP: ${wgIp}`, 'done');

    emit(4, 'Adding peer to VPS WireGuard...', 'active');
    await wireguardService.addPeerToVPS(publicKey, wgIp);
    emit(4, 'VPS peer added', 'done');

    emit(5, 'Saving router to database...', 'active');
    const [result] = await db.query(
      'INSERT INTO routers SET ?',
      {
        name: routerData.name,
        location: routerData.location,
        lan_ip: initialIp,
        initial_ip: initialIp,
        api_port: routerData.api_port || 8728,
        username: routerData.username,
        password: routerData.password,
        wg_ip: wgIp,
        wg_public_key: publicKey,
        wg_private_key: privateKey,
        client_name: routerData.client_name,
        monthly_price: routerData.monthly_price,
        notes: routerData.notes,
        status: 'offline',
      }
    );
    routerId = result.insertId;

    await db.query('INSERT INTO wireguard_peers SET ?', {
      router_id: routerId,
      public_key: publicKey,
      private_key: privateKey,
      wg_ip: wgIp,
      status: 'disconnected',
    });

    console.log(`[Router ${routerId}] Added with wg_ip ${wgIp}`);
    if (onStep) onStep({ step: 5, message: 'Router saved. Run connect commands on MikroTik.', status: 'done', done: true, success: true, router_id: routerId });
    return { success: true, router_id: routerId };
  } catch (err) {
    if (publicKey) {
      try {
        await wireguardService.removePeerFromVPS(publicKey);
      } catch (e) {
        console.warn('Cleanup removePeer failed:', e.message);
      }
    }
    if (onStep) onStep({ step: 0, message: err.message, status: 'error', done: true, success: false });
    throw err;
  }
}

/**
 * Update router status (online/offline/tunnel_failed)
 */
async function updateRouterStatus(routerId, status) {
  await db.query(
    'UPDATE routers SET status = ?, last_seen = NOW() WHERE id = ?',
    [status, routerId]
  );
}

/**
 * Check all routers status - uses WireGuard handshake (fast)
 * When tunnel comes UP and router has no webfig_port, create WebFig proxy
 */
async function checkAllRoutersStatus() {
  const tunnelStatuses = await wireguardService.getTunnelStatus();
  const now = Date.now();

  const [routers] = await db.query('SELECT id, wg_ip, webfig_port, winbox_port FROM routers WHERE wg_ip IS NOT NULL');

  for (const r of routers) {
    const target = r.wg_ip + '/32';
    const peer = tunnelStatuses.find(
      (p) => p.allowedIps === target || (p.allowedIps && p.allowedIps.includes(r.wg_ip))
    );
    let status = 'offline';
    if (peer && peer.lastHandshake) {
      const minutesAgo = (now - peer.lastHandshake.getTime()) / 60000;
      status = minutesAgo < 3 ? 'online' : 'offline';
    }
    await db.query(
      'UPDATE routers SET status = ?, last_seen = NOW() WHERE id = ?',
      [status, r.id]
    );

    if (status === 'online' && !r.webfig_port) {
      try {
        const port = await wireguardService.getNextWebfigPort();
        await wireguardService.createWebfigProxy(r.wg_ip, port);
        await db.query('UPDATE routers SET webfig_port = ? WHERE id = ?', [port, r.id]);
        console.log(`[Router ${r.id}] WebFig proxy created on port ${port}`);
      } catch (err) {
        console.warn(`[Router ${r.id}] WebFig proxy creation failed:`, err.message);
      }
    }

    if (status === 'online' && !r.winbox_port) {
      try {
        const { winbox_port } = await wireguardService.createWinboxProxy(r.wg_ip, r.id);
        await db.query('UPDATE routers SET winbox_port = ? WHERE id = ?', [winbox_port, r.id]);
        console.log(`[Router ${r.id}] Winbox proxy created on port ${winbox_port}`);
      } catch (err) {
        console.warn(`[Router ${r.id}] Winbox proxy creation failed:`, err.message);
      }
    }
  }
}

/**
 * Delete router (cleanup MikHmon, WireGuard peer, WebFig proxy)
 */
async function deleteRouter(routerId) {
  console.log(`[Router ${routerId}] Deleting router and cleaning up`);

  const [routerRows] = await db.query('SELECT name, webfig_port, winbox_port FROM routers WHERE id = ?', [routerId]);
  if (routerRows.length > 0) {
    mikhmonService.removeMikHmonSession(routerId, routerRows[0].name);
    console.log(`[Router ${routerId}] MikHmon session removed`);

    if (routerRows[0].webfig_port) {
      try {
        await wireguardService.removeWebfigProxy(routerRows[0].webfig_port);
        console.log(`[Router ${routerId}] WebFig proxy removed (port ${routerRows[0].webfig_port})`);
      } catch (err) {
        console.warn(`[Router ${routerId}] WebFig proxy removal failed:`, err.message);
      }
    }
    if (routerRows[0].winbox_port) {
      try {
        await wireguardService.removeWinboxProxy(routerId);
        console.log(`[Router ${routerId}] Winbox proxy removed`);
      } catch (err) {
        console.warn(`[Router ${routerId}] Winbox proxy removal failed:`, err.message);
      }
    }
  }

  const [peers] = await db.query('SELECT public_key FROM wireguard_peers WHERE router_id = ?', [
    routerId,
  ]);
  if (peers.length > 0) {
    await wireguardService.removePeerFromVPS(peers[0].public_key);
  }
  await db.query('DELETE FROM wireguard_peers WHERE router_id = ?', [routerId]);
  await db.query('DELETE FROM vouchers WHERE router_id = ?', [routerId]);
  await db.query('DELETE FROM revenue WHERE router_id = ?', [routerId]);
  await db.query('DELETE FROM router_stats WHERE router_id = ?', [routerId]);
  await db.query('DELETE FROM routers WHERE id = ?', [routerId]);
  return { success: true };
}

module.exports = {
  addRouter,
  updateRouterStatus,
  checkAllRoutersStatus,
  deleteRouter,
};
