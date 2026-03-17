const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const billingService = require('../services/billingService');
const mikrotikService = require('../services/mikrotikService');

const router = express.Router();

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
        const users = await Promise.race([
          mikrotikService.getActiveHotspotUsers(r),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Active users timed out')), 20000)
          ),
        ]);
        const normalized = Array.isArray(users)
          ? users.map((u) => ({
              username: u.user || u.name || u.username || null,
              ip: u.address || null,
              mac: u['mac-address'] || u.mac || null,
              uptime: u.uptime || null,
              session_time_left: u['session-time-left'] || null,
              device_name: u['host-name'] || u['device-name'] || null,
            }))
          : [];

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
