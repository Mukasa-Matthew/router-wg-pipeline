const { EventEmitter } = require('events');
const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const routerController = require('../services/routerController');
const mikrotikService = require('../services/mikrotikService');
const wireguardService = require('../services/wireguardService');
const mikhmonService = require('../services/mikhmonService');

const router = express.Router();
router.use(requireAuth);

const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100);

/**
 * GET /api/routers/add-progress/:jobId - SSE endpoint for add router progress
 */
router.get('/add-progress/:jobId', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const jobId = req.params.jobId;

  const listener = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (data.done) res.end();
    } catch (e) {
      progressEmitter.off(jobId, listener);
    }
  };

  progressEmitter.on(jobId, listener);

  req.on('close', () => {
    progressEmitter.off(jobId, listener);
    if (!res.writableEnded) res.end();
  });
});

/**
 * POST /api/routers - Add new router (returns jobId for SSE progress)
 */
router.post('/', async (req, res) => {
  const useSSE = req.query.sse === 'true' || req.headers['x-use-sse'] === 'true';

  if (useSSE) {
    const jobId = Date.now().toString();
    res.json({ jobId });

    const emit = (step, message, status, extra = {}) => {
      progressEmitter.emit(jobId, { step, message, status, ...extra });
    };

    setImmediate(async () => {
      try {
        const onStep = (data) => {
          if (data.done) {
            progressEmitter.emit(jobId, data);
          } else {
            progressEmitter.emit(jobId, { step: data.step, message: data.message, status: data.status });
          }
        };

        await routerController.addRouter(req.body, onStep);
      } catch (err) {
        progressEmitter.emit(jobId, {
          step: 0,
          message: err.message,
          status: 'error',
          done: true,
          success: false,
        });
      }
    });
    return;
  }

  try {
    const result = await routerController.addRouter(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/routers - List all routers (with optional dashboard enrichment)
 */
router.get('/', async (req, res) => {
  try {
    if (req.query.dashboard === 'true') {
      const [rows] = await db.query(`
        SELECT
          r.id, r.name, r.location, r.status, r.wg_ip,
          r.last_seen, r.client_name, r.monthly_price,
          (SELECT COUNT(*) FROM vouchers WHERE router_id = r.id) as total_vouchers,
          (SELECT COUNT(*) FROM vouchers WHERE router_id = r.id AND exported = 0) as pending_export,
          (SELECT COALESCE(SUM(amount), 0) FROM revenue WHERE router_id = r.id AND DATE(created_at) = CURDATE()) as today_revenue,
          rs.cpu_load, rs.uptime
        FROM routers r
        LEFT JOIN router_stats rs ON rs.router_id = r.id
        ORDER BY r.name
      `);
      return res.json(rows);
    }
    const [rows] = await db.query(
      'SELECT id, name, location, lan_ip, initial_ip, api_port, wg_ip, webfig_port, winbox_port, status, last_seen, created_at, billing_owner_id, billing_router_id, billing_hotspot_key FROM routers ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch routers' });
  }
});

/**
 * GET /api/routers/:id/connect-commands - MikroTik commands for connecting router
 */
router.get('/:id/connect-commands', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, location, wg_ip, webfig_port, winbox_port, wg_private_key, wg_public_key, status FROM routers WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const r = rows[0];
    if (!r.wg_ip) return res.status(400).json({ error: 'Router has no wg_ip assigned' });

    const vpsKey = process.env.WG_PUBLIC_KEY || '';
    const vpsIp = process.env.VPS_IP || '';
    const wgPort = process.env.WG_PORT || '51820';
    const wgSubnet = process.env.WG_SUBNET || '10.10.0';

    // Step 0: Remove existing wg-vps if present (for clean retry). Run each line; ignore errors if interface doesn't exist.
    const step0 = `/interface wireguard peers remove [ find interface=wg-vps ]
/interface wireguard remove [ find name=wg-vps ]`;
    const step1 = `/interface wireguard add name=wg-vps listen-port=13231 private-key="${r.wg_private_key}" disabled=no`;
    const step2 = `/interface wireguard peers add interface=wg-vps public-key="${vpsKey}" endpoint-address=${vpsIp} endpoint-port=${wgPort} allowed-address=${wgSubnet}.0/24 persistent-keepalive=25`;
    const step3 = `/ip address add address=${r.wg_ip}/24 interface=wg-vps`;
    const step4 = `/ip route add dst-address=${wgSubnet}.0/24 gateway=wg-vps`;
    const step5 = `/ip firewall filter add action=accept chain=input in-interface=wg-vps place-before=0 comment="RouterHub WireGuard"`;
    const step6 = `/ip service set api disabled=no`;
    const step7 = `/interface wireguard peers print`;
    const all = [step0, step1, step2, step3, step4, step5, step6].join('\n');

    const tunnelStatuses = await wireguardService.getTunnelStatus();
    const peer = tunnelStatuses.find(
      (p) => p.allowedIps === r.wg_ip + '/32' || (p.allowedIps && p.allowedIps.includes(r.wg_ip))
    );
    let tunnel_status = 'offline';
    if (peer && peer.lastHandshake) {
      const minutesAgo = (Date.now() - peer.lastHandshake.getTime()) / 60000;
      tunnel_status = minutesAgo < 2 ? 'online' : 'offline';
    }

    const webfig_url = r.webfig_port && vpsIp ? `http://${vpsIp}:${r.webfig_port}` : null;
    const winbox_url = r.winbox_port && vpsIp ? `${vpsIp}:${r.winbox_port}` : null;

    res.json({
      router_id: r.id,
      router_name: r.name,
      location: r.location,
      wg_ip: r.wg_ip,
      tunnel_status,
      vps_ip: vpsIp,
      wg_port: wgPort,
      webfig_url,
      winbox_url,
      commands: {
        step0,
        step1,
        step2,
        step3,
        step4,
        step5,
        step6,
        step7,
        all,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/routers/:id/re-add-peer - Re-add WireGuard peer to VPS (if it wasn't added during router add)
 */
router.post('/:id/re-add-peer', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, wg_ip, wg_public_key FROM routers WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const r = rows[0];
    if (!r.wg_ip || !r.wg_public_key) return res.status(400).json({ error: 'Router has no WireGuard config' });

    await wireguardService.addPeerToVPS(r.wg_public_key, r.wg_ip);
    res.json({ success: true, message: 'Peer re-added to VPS. Run the connect commands on the MikroTik again.' });
  } catch (err) {
    console.error('Re-add peer error:', err);
    res.status(500).json({ error: err.message || 'Failed to re-add peer' });
  }
});

/**
 * GET /api/routers/:id/test-tunnel - Check if WireGuard tunnel is up
 */
router.get('/:id/test-tunnel', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT wg_ip, wg_public_key FROM routers WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const r = rows[0];
    if (!r.wg_ip) return res.status(400).json({ error: 'Router has no wg_ip' });

    const tunnelStatuses = await wireguardService.getTunnelStatus();
    const target = r.wg_ip + '/32';
    let peer = tunnelStatuses.find((p) => p.publicKey === r.wg_public_key);
    if (!peer) {
      peer = tunnelStatuses.find(
        (p) => p.allowedIps === target || (p.allowedIps && p.allowedIps.includes(r.wg_ip))
      );
    }

    let tunnel_up = false;
    let last_handshake = null;
    let minutes_ago = null;
    let bytes_sent = 0;
    let bytes_received = 0;

    let mikhmon_added = false;
    if (peer && peer.lastHandshake) {
      minutes_ago = Math.round((Date.now() - peer.lastHandshake.getTime()) / 60000);
      // Align with dashboard/WireGuard page: consider tunnel up if handshake < 3 minutes ago.
      tunnel_up = minutes_ago < 3;
      last_handshake = peer.lastHandshake.toISOString();
      bytes_sent = peer.bytesSent || 0;
      bytes_received = peer.bytesReceived || 0;
      if (tunnel_up) {
        await db.query('UPDATE routers SET lan_ip = ?, status = ?, last_seen = NOW() WHERE id = ?', [
          r.wg_ip,
          'online',
          req.params.id,
        ]);
        const [fullRows] = await db.query(
          'SELECT * FROM routers WHERE id = ?',
          [req.params.id]
        );
        if (fullRows.length > 0) {
          const fullRouter = fullRows[0];
          if (!mikhmonService.sessionExists(fullRouter)) {
            mikhmonService.addMikHmonSession(fullRouter);
            mikhmon_added = true;
            console.log(`[Router ${req.params.id}] MikHmon session created`);
          }
        }
      }
    }

    res.json({
      tunnel_up,
      last_handshake,
      minutes_ago,
      wg_ip: r.wg_ip,
      bytes_sent,
      bytes_received,
      mikhmon_added,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/routers/:id - Get single router details
 */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM routers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const r = rows[0];
    delete r.password;
    const vpsIp = process.env.VPS_IP || '';
    r.webfig_url = r.webfig_port && vpsIp ? `http://${vpsIp}:${r.webfig_port}` : null;
    r.winbox_url = r.winbox_port && vpsIp ? `${vpsIp}:${r.winbox_port}` : null;
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch router' });
  }
});

/**
 * PUT /api/routers/:id - Update router
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, location, lan_ip, api_port, username, password, client_name, monthly_price, notes, billing_owner_id, billing_router_id, billing_hotspot_key } =
      req.body;
    const updates = {
      name,
      location,
      lan_ip,
      api_port,
      username,
      password,
      client_name,
      monthly_price,
      notes,
      billing_owner_id: billing_owner_id === '' || billing_owner_id === null ? null : billing_owner_id,
      billing_router_id: billing_router_id === '' || billing_router_id === null ? null : billing_router_id,
      billing_hotspot_key: billing_hotspot_key === '' ? null : billing_hotspot_key,
    };
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(filtered).length === 0) return res.status(400).json({ error: 'No fields to update' });

    await db.query('UPDATE routers SET ? WHERE id = ?', [filtered, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update router' });
  }
});

/**
 * DELETE /api/routers/:id - Remove router + cleanup WireGuard
 */
router.delete('/:id', async (req, res) => {
  try {
    await routerController.deleteRouter(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete router' });
  }
});

/**
 * GET /api/routers/:id/stats - CPU, RAM, uptime (from cache or live)
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM routers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });

    const [cached] = await db.query('SELECT * FROM router_stats WHERE router_id = ?', [
      req.params.id,
    ]);
    if (cached.length > 0) {
      const c = cached[0];
      return res.json({
        resources: {
          'cpu-load': c.cpu_load,
          'total-memory': c.memory_total,
          'free-memory': (c.memory_total || 0) - (c.memory_used || 0),
          uptime: c.uptime,
        },
        identity: { name: rows[0].name },
        cached: true,
      });
    }

    const stats = await mikrotikService.getRouterStats(rows[0]);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/routers/:id/users - Active hotspot users
 */
router.get('/:id/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM routers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const users = await mikrotikService.getActiveHotspotUsers(rows[0]);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/routers/:id/reboot - Reboot router
 * Fire-and-forget: router disconnects on reboot, so we return success immediately.
 * Immediately set status to offline so dashboard shows it; status check will set online when it comes back.
 */
router.post('/:id/reboot', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM routers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    await db.query(
      "UPDATE routers SET status = 'offline', last_seen = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ success: true });
    mikrotikService.rebootRouter(rows[0]).catch((err) =>
      console.warn('[Reboot] Router may have rebooted:', err.message)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/routers/:id/mikhmon-url - MikHmon session URL
 */
router.get('/:id/mikhmon-url', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, wg_ip FROM routers WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const r = rows[0];
    if (!r.wg_ip) {
      return res.status(400).json({ error: 'WireGuard not configured' });
    }
    const url = mikhmonService.getMikHmonUrl(r.id, r.name);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validation helpers for profiles
const VALIDITY_REGEX = /^\d+(m|h|d|w)$/;
const RATE_LIMIT_REGEX = /^\d+M\/\d+M$/;

function validateProfileName(name) {
  if (!name || typeof name !== 'string') return 'Profile name is required';
  if (name.length > 50) return 'Profile name max 50 chars';
  const sanitized = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  if (sanitized !== name.replace(/\s+/g, '-')) return 'Profile name: letters, numbers, dashes only';
  return null;
}

function validateProfileBody(body, isUpdate = false) {
  if (!isUpdate) {
    const nameErr = validateProfileName(body.profile_name);
    if (nameErr) return nameErr;
  }
  if (body.validity !== undefined && !VALIDITY_REGEX.test(body.validity)) {
    return 'Validity must match 30m, 1h, 6h, 12h, 1d, 1w, 7d, 30d';
  }
  if (body.price !== undefined) {
    const p = parseInt(body.price, 10);
    if (isNaN(p) || p < 0) return 'Price must be >= 0 integer';
  }
  if (body.rate_limit && !RATE_LIMIT_REGEX.test(body.rate_limit)) {
    return 'Rate limit must match 5M/5M format';
  }
  return null;
}

/**
 * GET /api/routers/:id/profiles/sync - Sync profiles from MikroTik (must be before :profileId)
 */
router.get('/:id/profiles/sync', async (req, res) => {
  try {
    const routerId = req.params.id;
    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const router = routerRows[0];

    const mikrotikProfiles = await mikrotikService.getHotspotProfiles(router);
    let synced = 0;
    for (const p of mikrotikProfiles || []) {
      const profileName = p.name || p['profile-name'];
      if (!profileName) continue;
      try {
        const [result] = await db.query(
          `INSERT IGNORE INTO hotspot_profiles
           (router_id, profile_name, display_name, validity, validity_seconds, price)
           VALUES (?, ?, ?, '1d', 0, 0)`,
          [routerId, profileName, profileName]
        );
        if (result && result.affectedRows > 0) synced++;
      } catch (e) {
        // IGNORE duplicates
      }
    }
    const [profiles] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE router_id = ? AND is_active = 1',
      [routerId]
    );
    res.json({ synced, profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/routers/:id/profiles - List hotspot profiles
 */
router.get('/:id/profiles', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE router_id = ? AND is_active = 1 ORDER BY profile_name',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/routers/:id/profiles - Create hotspot profile
 */
router.post('/:id/profiles', async (req, res) => {
  try {
    const routerId = req.params.id;
    const body = req.body;
    const err = validateProfileBody(body);
    if (err) return res.status(400).json({ error: err });

    const profile_name = (body.profile_name || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const display_name = body.display_name || profile_name;
    const validity = body.validity || '1d';
    const price = Math.max(0, parseInt(body.price, 10) || 0);
    const shared_users = Math.max(1, parseInt(body.shared_users, 10) || 1);
    const rate_limit = body.rate_limit || null;
    const session_timeout = body.session_timeout || validity;
    const idle_timeout = body.idle_timeout || null;

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const router = routerRows[0];

    await mikrotikService.createHotspotProfile(router, {
      profile_name,
      shared_users,
      session_timeout,
      idle_timeout,
      rate_limit,
      validity,
    });

    const validitySeconds = parseValidityToSeconds(validity);
    const [result] = await db.query(
      `INSERT INTO hotspot_profiles
       (router_id, profile_name, display_name, validity, validity_seconds, price, shared_users, rate_limit, session_timeout, idle_timeout)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        routerId,
        profile_name,
        display_name,
        validity,
        validitySeconds,
        price,
        shared_users,
        rate_limit,
        session_timeout,
        idle_timeout,
      ]
    );
    const [profile] = await db.query('SELECT * FROM hotspot_profiles WHERE id = ?', [
      result.insertId,
    ]);
    res.json({ success: true, profile: profile[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/routers/:id/profiles/fix-all - Fix all profiles on MikroTik
 * Sets session-timeout=0s, keepalive-timeout=none, add-mac-cookie=yes
 */
router.post('/:id/profiles/fix-all', async (req, res) => {
  try {
    const routerId = req.params.id;
    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return res.status(404).json({ error: 'Router not found' });
    const router = routerRows[0];

    const [profileRows] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE router_id = ? AND is_active = 1',
      [routerId]
    );
    let fixed = 0;
    for (const p of profileRows) {
      try {
        await mikrotikService.fixProfileOnMikrotik(router, p.profile_name);
        fixed++;
      } catch (err) {
        console.warn(`[Router ${routerId}] Failed to fix profile ${p.profile_name}:`, err.message);
      }
    }
    res.json({ fixed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/routers/:id/profiles/:profileId - Update hotspot profile
 */
router.put('/:id/profiles/:profileId', async (req, res) => {
  try {
    const { id: routerId, profileId } = req.params;
    const body = req.body;
    const err = validateProfileBody(body, true);
    if (err) return res.status(400).json({ error: err });

    const [profileRows] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE id = ? AND router_id = ?',
      [profileId, routerId]
    );
    if (profileRows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const profile = profileRows[0];

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return res.status(404).json({ error: 'Router not found' });

    const updates = {};
    if (body.session_timeout) updates.session_timeout = body.session_timeout;
    if (body.idle_timeout !== undefined) updates.idle_timeout = body.idle_timeout;
    if (body.rate_limit !== undefined) updates.rate_limit = body.rate_limit;
    if (body.shared_users !== undefined) updates.shared_users = body.shared_users;
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.validity !== undefined) updates.validity = body.validity;
    if (body.price !== undefined) updates.price = Math.max(0, parseInt(body.price, 10) || 0);

    await mikrotikService.updateHotspotProfile(routerRows[0], profile.profile_name, {
      session_timeout: updates.session_timeout,
      idle_timeout: updates.idle_timeout,
      rate_limit: updates.rate_limit,
      shared_users: updates.shared_users,
    });

    if (Object.keys(updates).length > 0) {
      await db.query('UPDATE hotspot_profiles SET ? WHERE id = ? AND router_id = ?', [
        updates,
        profileId,
        routerId,
      ]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/routers/:id/profiles/:profileId - Delete hotspot profile
 */
router.delete('/:id/profiles/:profileId', async (req, res) => {
  try {
    const { id: routerId, profileId } = req.params;
    const force = req.query.force === 'true';

    const [profileRows] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE id = ? AND router_id = ?',
      [profileId, routerId]
    );
    if (profileRows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const profile = profileRows[0];

    const [[countRow]] = await db.query(
      'SELECT COUNT(*) as count FROM vouchers WHERE router_id = ? AND profile = ?',
      [routerId, profile.profile_name]
    );
    const count = countRow?.count || 0;
    if (count > 0 && !force) {
      return res.json({
        warning: true,
        message: `${count} vouchers use this profile. Delete anyway?`,
        count,
      });
    }

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return res.status(404).json({ error: 'Router not found' });

    await mikrotikService.deleteHotspotProfile(routerRows[0], profile.profile_name);
    await db.query('DELETE FROM hotspot_profiles WHERE id = ? AND router_id = ?', [
      profileId,
      routerId,
    ]);
    console.log(`[Router ${routerId}] Profile "${profile.profile_name}" deleted`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseValidityToSeconds(validity) {
  if (!validity) return 0;
  const m = validity.match(/^(\d+)(m|h|d|w)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const u = m[2];
  if (u === 'm') return n * 60;
  if (u === 'h') return n * 3600;
  if (u === 'd') return n * 86400;
  if (u === 'w') return n * 7 * 86400;
  return 0;
}

module.exports = router;
