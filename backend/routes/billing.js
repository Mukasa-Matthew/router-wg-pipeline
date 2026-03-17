const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const billingService = require('../services/billingService');
const mikrotikService = require('../services/mikrotikService');

const router = express.Router();

// Cache active users briefly to avoid hammering MikroTik from billing UI refreshes.
// Key: router_id -> { ts: number, payload: { users: [], error?: string } }
const ACTIVE_USERS_CACHE = new Map();
const ACTIVE_USERS_CACHE_TTL_MS = 15000;

// Cache DHCP leases briefly for device name lookup (MAC -> host-name/comment).
const DHCP_LEASES_CACHE = new Map(); // router_id -> { ts, map }
const DHCP_LEASES_CACHE_TTL_MS = 30000;

/**
 * Server-to-server auth: Billing backend calls with this header to get real-time router status.
 * Set BILLING_API_SECRET in RouterHub .env; billing app uses the same value in X-Billing-Api-Key.
 */
function requireBillingApiKey(req, res, next) {
  const secret = process.env.BILLING_API_SECRET;
  const key = req.headers['x-billing-api-key'];
  if (!secret || key !== secret) {
    return res.status(401).json({ error: 'Unauthorized', code: 'BILLING_API_KEY_REQUIRED' });
  }
  next();
}

/**
 * GET /api/billing/status-by-owner/:owner_id
 * For billing server only (API key required). Returns real-time router list for one hotspot owner.
 * Billing "My Routers" page: backend calls this with the logged-in owner's id, then renders the list.
 * No session auth; use header: X-Billing-Api-Key: <BILLING_API_SECRET>
 */
router.get('/status-by-owner/:owner_id', requireBillingApiKey, async (req, res) => {
  try {
    const ownerId = parseInt(req.params.owner_id, 10);
    if (!ownerId) return res.status(400).json({ error: 'Invalid owner_id' });

    const [rows] = await db.query(
      `SELECT
        r.id AS router_id,
        r.billing_router_id,
        r.name,
        r.location,
        r.status,
        r.wg_ip,
        r.last_seen,
        rs.cpu_load,
        rs.memory_used,
        rs.memory_total,
        rs.uptime,
        rs.updated_at AS stats_updated_at
       FROM routers r
       LEFT JOIN router_stats rs ON rs.router_id = r.id
       WHERE r.billing_owner_id = ?
       ORDER BY r.name`,
      [ownerId]
    );

    const list = rows.map((row) => ({
      router_id: row.router_id,
      billing_router_id: row.billing_router_id,
      name: row.name,
      location: row.location || null,
      status: row.status,
      wg_ip: row.wg_ip,
      last_seen: row.last_seen,
      cpu_load: row.cpu_load ?? null,
      memory_used: row.memory_used ?? null,
      memory_total: row.memory_total ?? null,
      uptime: row.uptime || null,
      stats_updated_at: row.stats_updated_at || null,
    }));

    res.json({ owner_id: ownerId, routers: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch router status' });
  }
});

/**
 * GET /api/billing/active-users-by-owner/:owner_id
 * For billing server only (API key required). Returns active hotspot users grouped by router.
 *
 * Notes:
 * - RouterHub is the source of truth; billing must not connect to MikroTik.
 * - owner_id must match RouterHub routers.billing_owner_id.
 */
router.get('/active-users-by-owner/:owner_id', requireBillingApiKey, async (req, res) => {
  try {
    const ownerId = parseInt(req.params.owner_id, 10);
    if (!ownerId) return res.status(400).json({ error: 'Invalid owner_id' });

    const [routers] = await db.query(
      'SELECT id, name, location, status, lan_ip, wg_ip, api_port, username, password FROM routers WHERE billing_owner_id = ? ORDER BY name',
      [ownerId]
    );

    const result = [];
    for (const r of routers) {
      try {
        // If RouterHub already considers the tunnel/router offline, don't attempt RouterOS API calls.
        // This keeps the billing UI responsive when routers are down or flapping.
        if (r.status !== 'online') {
          result.push({
            router_id: r.id,
            name: r.name,
            location: r.location || null,
            status: r.status,
            wg_ip: r.wg_ip,
            active_users_count: 0,
            users: [],
            error: 'Router offline',
          });
          continue;
        }

        const cached = ACTIVE_USERS_CACHE.get(r.id);
        if (cached && Date.now() - cached.ts < ACTIVE_USERS_CACHE_TTL_MS) {
          result.push({
            router_id: r.id,
            name: r.name,
            location: r.location || null,
            status: r.status,
            wg_ip: r.wg_ip,
            active_users_count: cached.payload.users.length,
            users: cached.payload.users,
            ...(cached.payload.error ? { error: cached.payload.error } : {}),
            cached: true,
          });
          continue;
        }

        const users = await Promise.race([
          mikrotikService.getActiveHotspotUsersSlim(r),
          new Promise((_, reject) =>
            // Keep response fast for UI. If the RouterOS API hangs/bugs out, fail quickly.
            setTimeout(() => reject(new Error('Active users timed out')), 12000)
          ),
        ]);

        // If there are no active users, avoid additional RouterOS calls (DHCP leases / hotspot users).
        // This significantly reduces load and avoids some RouterOS API edge-cases (e.g. node-routeros UNKNOWNREPLY).
        const hasActive = Array.isArray(users) && users.length > 0;

        // Build device-name map from DHCP leases (MAC -> host-name/comment) only when needed.
        let leaseMap = new Map();
        if (hasActive) {
          const leaseCached = DHCP_LEASES_CACHE.get(r.id);
          if (leaseCached && Date.now() - leaseCached.ts < DHCP_LEASES_CACHE_TTL_MS) {
            leaseMap = leaseCached.map;
          } else {
            try {
              const leases = await Promise.race([
                mikrotikService.getDhcpLeasesSlim(r),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('DHCP leases timed out')), 8000)
                ),
              ]);
              const m = new Map();
              if (Array.isArray(leases)) {
                for (const l of leases) {
                  const mac = (l['mac-address'] || '').toLowerCase();
                  if (!mac) continue;
                  const name = l['host-name'] || l.comment || null;
                  if (name) m.set(mac, name);
                }
              }
              DHCP_LEASES_CACHE.set(r.id, { ts: Date.now(), map: m });
              leaseMap = m;
            } catch {
              leaseMap = new Map();
            }
          }
        }

        // Build username -> limit-uptime map only when needed.
        let limitMap = new Map();
        if (hasActive) {
          try {
            const hotspotUsers = await Promise.race([
              mikrotikService.getHotspotUsersSlim(r),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Hotspot user limits timed out')), 8000)
              ),
            ]);
            if (Array.isArray(hotspotUsers)) {
              for (const hu of hotspotUsers) {
                const name = hu.name || hu.user || null;
                const limit = hu['limit-uptime'] || null;
                if (name) limitMap.set(String(name), limit);
              }
            }
          } catch {
            // ignore
          }
        }

        const normalized = Array.isArray(users)
          ? users.map((u) => {
              const username = u.user || u.name || u.username || null;
              const mac = u['mac-address'] || u.mac || null;
              const macKey = mac ? String(mac).toLowerCase() : '';
              const deviceName = macKey && leaseMap ? leaseMap.get(macKey) || null : null;

              const sessionTimeLeft = u['session-time-left'] || null;
              let bundleTimeLeft = sessionTimeLeft;
              if (!bundleTimeLeft && username) {
                const limit = limitMap.get(String(username)) || null;
                const limitSec = mikrotikService.parseRosDurationToSeconds(limit);
                const upSec = mikrotikService.parseRosDurationToSeconds(u.uptime);
                if (limitSec != null && upSec != null) {
                  bundleTimeLeft = mikrotikService.formatSecondsToRosDuration(limitSec - upSec);
                }
              }

              return {
                username,
                ip: u.address || null,
                mac,
                uptime: u.uptime || null,
                session_time_left: sessionTimeLeft,
                bundle_time_left: bundleTimeLeft,
                device_name: deviceName,
              };
            })
          : [];

        ACTIVE_USERS_CACHE.set(r.id, { ts: Date.now(), payload: { users: normalized } });
        result.push({
          router_id: r.id,
          name: r.name,
          location: r.location || null,
          status: r.status,
          wg_ip: r.wg_ip,
          active_users_count: normalized.length,
          users: normalized,
        });
      } catch (e) {
        ACTIVE_USERS_CACHE.set(r.id, { ts: Date.now(), payload: { users: [], error: e.message } });
        result.push({
          router_id: r.id,
          name: r.name,
          location: r.location || null,
          status: r.status,
          wg_ip: r.wg_ip,
          active_users_count: 0,
          users: [],
          error: e.message,
        });
      }
    }

    res.json({ owner_id: ownerId, routers: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});

// All routes below require RouterHub session (super admin)
router.use(requireAuth);

/**
 * GET /api/billing/owners - List billing hotspot owners (for dropdown when adding router).
 * If BILLING_API_URL + BILLING_JWT are set, proxies to billing; otherwise returns [].
 */
router.get('/owners', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 500);
    const { data, total } = await billingService.getHotspotOwners(page, limit);
    res.json({ data, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch billing owners' });
  }
});

/**
 * GET /api/billing/export - All routers with billing linkage (for billing app or sync script).
 * Returns: id, name, status, wg_ip, last_seen, billing_owner_id, billing_router_id, billing_hotspot_key.
 */
router.get('/export', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name, location, status, wg_ip, last_seen,
             billing_owner_id, billing_router_id, billing_hotspot_key
      FROM routers
      ORDER BY billing_owner_id, id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export routers' });
  }
});

module.exports = router;
