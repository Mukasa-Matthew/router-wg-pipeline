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

/** Normalize validity to MikroTik format (e.g. 24h, 7d) for limit-uptime */
function normalizeValidityForMikrotik(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d+(m|h|d|w)$/i.test(s)) return s;
  const map = {
    '6-Hours': '6h',
    '6-hours': '6h',
    '12-Hours': '12h',
    '12-hours': '12h',
    '24-Hours': '24h',
    '24-hours': '24h',
    '1-Day': '1d',
    '1-day': '1d',
    '1-Week': '7d',
    '1-week': '7d',
    '1-Month': '30d',
    '1-month': '30d',
  };
  return map[s] || null;
}

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

function billingFail(res, status, code, error) {
  return res.status(status).json({ success: false, error, code });
}

/**
 * V2 auth for NEW billing endpoints only (keeps existing endpoints unchanged).
 * Uses the new standardized error format/codes.
 */
function requireBillingApiKeyV2(req, res, next) {
  const secret = process.env.BILLING_API_SECRET;
  const key = req.headers['x-billing-api-key'];
  if (!secret || key !== secret) {
    return billingFail(res, 401, 'INVALID_SECRET', 'Unauthorized');
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

/**
 * POST /api/billing/generate-vouchers
 * For billing server only (API key required). Generates vouchers on a specific RouterHub router.
 *
 * Body:
 * - owner_id: number (billing hotspot_owner_id)
 * - routerhub_router_id: number|string (RouterHub routers.id)
 * - profile: string (hotspot profile name)
 * - count: number
 * - prefix?: string
 * - uptime_limit?: string (e.g. 1d, 6h) - optional override
 *
 * Response:
 * - { owner_id, router_id, vouchers: [{ username, password, profile, uptime_limit }] }
 */
router.post('/generate-vouchers', requireBillingApiKey, async (req, res) => {
  try {
    const ownerId = parseInt(req.body?.owner_id, 10);
    const routerId = parseInt(req.body?.routerhub_router_id, 10);
    // Support both "profile" (legacy) and "profile_name" (billing-side)
    const profile =
      typeof req.body?.profile_name === 'string'
        ? req.body.profile_name.trim()
        : typeof req.body?.profile === 'string'
          ? req.body.profile.trim()
          : '';
    const prefix = typeof req.body?.prefix === 'string' && req.body.prefix.trim() ? req.body.prefix.trim() : 'v';
    const countNum = parseInt(req.body?.count, 10);
    const uptimeLimitInput =
      typeof req.body?.uptime_limit === 'string' && req.body.uptime_limit.trim()
        ? req.body.uptime_limit.trim()
        : null;

    if (!ownerId || !routerId || !profile || !countNum) {
      return res.status(400).json({ success: false, error: 'owner_id, routerhub_router_id, profile_name, count required', code: 'MIKROTIK_ERROR' });
    }
    if (countNum < 1 || countNum > 1000) {
      return res.status(400).json({ success: false, error: 'count must be between 1 and 1000', code: 'MIKROTIK_ERROR' });
    }

    const [routerRows] = await db.query(
      'SELECT * FROM routers WHERE id = ? AND billing_owner_id = ?',
      [routerId, ownerId]
    );
    if (routerRows.length === 0) {
      // Keep old behavior but add standardized code for billing callers
      return res.status(404).json({ success: false, error: 'Router not found', code: 'ROUTER_NOT_FOUND' });
    }
    const r = routerRows[0];
    if (!r.wg_ip) {
      return res.status(400).json({ success: false, error: 'Router has no wg_ip. Tunnel must be up.', code: 'ROUTER_OFFLINE' });
    }
    if (r.status !== 'online') {
      return res.status(400).json({ success: false, error: 'Router offline', code: 'ROUTER_OFFLINE' });
    }

    // Determine validity/limit-uptime:
    // - Prefer request uptime_limit override
    // - Else try hotspot_profiles.validity
    // - Else fall back to profile string (common when profile names are like 1d/6h)
    let validity = uptimeLimitInput;
    if (!validity) {
      const [profileRows] = await db.query(
        'SELECT validity FROM hotspot_profiles WHERE router_id = ? AND profile_name = ? LIMIT 1',
        [routerId, profile]
      );
      validity = profileRows?.[0]?.validity || null;
    }
    if (!validity) validity = profile;

    const normalizedValidity = normalizeValidityForMikrotik(validity) || validity;
    if (!normalizedValidity || !mikrotikService.validityToUptime(normalizedValidity)) {
      return res.status(400).json({ success: false, error: `Invalid validity "${validity}". Use format like 1d, 6h, 24h, 7d, or 30d`, code: 'MIKROTIK_ERROR' });
    }

    // Verify profile exists on the router (billing requirement)
    try {
      const profiles = await mikrotikService.getHotspotProfiles(r);
      const exists = Array.isArray(profiles)
        ? profiles.some((p) => String(p.name || p['profile-name'] || '').trim() === profile)
        : false;
      if (!exists) {
        return res.status(400).json({ success: false, error: 'Profile not found on router', code: 'PROFILE_NOT_FOUND' });
      }
    } catch (e) {
      const msg = mikrotikService.formatMikrotikConnectionError
        ? mikrotikService.formatMikrotikConnectionError(e)
        : (e.message || 'Failed to read profiles from router');
      return res.status(503).json({ success: false, error: msg, code: 'MIKROTIK_ERROR' });
    }

    const mikrotikVouchers = await mikrotikService.generateVouchersOnMikrotik(
      r,
      profile,
      countNum,
      prefix,
      normalizedValidity
    );

    const uptimeLimitForDb = mikrotikService.validityToUptime(normalizedValidity) || normalizedValidity;
    const vouchers = Array.isArray(mikrotikVouchers)
      ? mikrotikVouchers.map((v) => ({
          username: v.username,
          password: v.password,
          profile: v.profile || profile,
          uptime_limit: uptimeLimitForDb,
        }))
      : [];

    // Keep existing shape (owner_id/router_id/vouchers) but also include success for new callers.
    res.json({ success: true, owner_id: ownerId, router_id: routerId, vouchers });
  } catch (err) {
    console.error(err);
    const msg = mikrotikService.formatMikrotikConnectionError
      ? mikrotikService.formatMikrotikConnectionError(err)
      : (err.message || 'Failed to generate vouchers');
    res.status(503).json({ success: false, error: msg, code: 'MIKROTIK_ERROR' });
  }
});

/**
 * POST /api/billing/create-profile
 * New billing endpoint (API key required) - uses standardized error format.
 */
router.post('/create-profile', requireBillingApiKeyV2, async (req, res) => {
  try {
    const ownerId = parseInt(req.body?.owner_id, 10);
    const routerId = parseInt(req.body?.routerhub_router_id, 10);
    const profileName =
      typeof req.body?.profile_name === 'string' ? req.body.profile_name.trim() : '';
    const uptimeLimit =
      typeof req.body?.uptime_limit === 'string' ? req.body.uptime_limit.trim() : '';
    const dataLimit =
      req.body?.data_limit == null ? null : String(req.body.data_limit).trim() || null;

    if (!ownerId || !routerId || !profileName || !uptimeLimit) {
      return billingFail(res, 400, 'MIKROTIK_ERROR', 'routerhub_router_id, owner_id, profile_name, uptime_limit required');
    }

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return billingFail(res, 404, 'ROUTER_NOT_FOUND', 'Router not found');

    const r = routerRows[0];
    if (parseInt(r.billing_owner_id, 10) !== ownerId) {
      return billingFail(res, 403, 'OWNERSHIP_MISMATCH', 'Router does not belong to owner');
    }
    if (r.status !== 'online') return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router offline');
    if (!r.wg_ip) return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router has no wg_ip');

    // Create MikroTik hotspot profile:
    // Requirement says: session-timeout=uptime_limit; rate-limit if data_limit provided.
    try {
      await mikrotikService.createHotspotProfile(r, {
        profile_name: profileName,
        shared_users: 1,
        session_timeout: uptimeLimit, // not used by service, so we set via update below
        rate_limit: dataLimit || null,
      });
      // Ensure the session-timeout matches requested uptime_limit (service defaults to 0s).
      await mikrotikService.updateHotspotProfile(r, profileName, {
        session_timeout: uptimeLimit,
        rate_limit: dataLimit || undefined,
      });
    } catch (e) {
      const msg = mikrotikService.formatMikrotikConnectionError
        ? mikrotikService.formatMikrotikConnectionError(e)
        : (e.message || 'Failed to create profile');
      return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
    }

    return res.json({ success: true, profile_name: profileName, router_id: String(routerId) });
  } catch (err) {
    console.error(err);
    const msg = mikrotikService.formatMikrotikConnectionError
      ? mikrotikService.formatMikrotikConnectionError(err)
      : 'Failed to create profile';
    return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
  }
});

/**
 * POST /api/billing/delete-profile
 * New billing endpoint (API key required) - uses standardized error format.
 */
router.post('/delete-profile', requireBillingApiKeyV2, async (req, res) => {
  try {
    const ownerId = parseInt(req.body?.owner_id, 10);
    const routerId = parseInt(req.body?.routerhub_router_id, 10);
    const profileName =
      typeof req.body?.profile_name === 'string' ? req.body.profile_name.trim() : '';

    if (!ownerId || !routerId || !profileName) {
      return billingFail(res, 400, 'MIKROTIK_ERROR', 'routerhub_router_id, owner_id, profile_name required');
    }

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return billingFail(res, 404, 'ROUTER_NOT_FOUND', 'Router not found');
    const r = routerRows[0];
    if (parseInt(r.billing_owner_id, 10) !== ownerId) {
      return billingFail(res, 403, 'OWNERSHIP_MISMATCH', 'Router does not belong to owner');
    }
    if (!r.wg_ip) return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router has no wg_ip');

    try {
      await mikrotikService.deleteHotspotProfile(r, profileName);
    } catch (e) {
      const msg = mikrotikService.formatMikrotikConnectionError
        ? mikrotikService.formatMikrotikConnectionError(e)
        : (e.message || 'Failed to delete profile');
      if (msg.toLowerCase().includes('not found')) {
        return billingFail(res, 400, 'PROFILE_NOT_FOUND', msg);
      }
      return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    const msg = mikrotikService.formatMikrotikConnectionError
      ? mikrotikService.formatMikrotikConnectionError(err)
      : 'Failed to delete profile';
    return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
  }
});

/**
 * GET /api/billing/profiles-by-router/:routerhub_router_id
 * Read-only endpoint for billing: fetch MikroTik hotspot profiles for one router.
 *
 * Header: x-billing-api-key: <secret>
 * Optional: ?owner_id=4 to enforce ownership (recommended for billing).
 *
 * Response:
 * {
 *   success: true,
 *   router_id: "1",
 *   profiles: [{ profile_name, uptime_limit, rate_limit, data_limit }]
 * }
 */
router.get('/profiles-by-router/:routerhub_router_id', requireBillingApiKeyV2, async (req, res) => {
  try {
    const routerId = parseInt(req.params.routerhub_router_id, 10);
    const ownerId = req.query.owner_id ? parseInt(String(req.query.owner_id), 10) : null;

    if (!routerId) {
      return billingFail(res, 400, 'MIKROTIK_ERROR', 'Invalid routerhub_router_id');
    }

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return billingFail(res, 404, 'ROUTER_NOT_FOUND', 'Router not found');

    const r = routerRows[0];
    if (ownerId != null && parseInt(r.billing_owner_id, 10) !== ownerId) {
      return billingFail(res, 403, 'OWNERSHIP_MISMATCH', 'Router does not belong to owner');
    }
    if (!r.wg_ip) return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router has no wg_ip');
    if (r.status !== 'online') return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router offline');

    let profiles;
    // Load RouterHub's own hotspot_profiles for this router (validity + price, and optionally rate_limit).
    let dbProfiles = [];
    try {
      const [rows] = await db.query(
        'SELECT profile_name, validity, price, rate_limit FROM hotspot_profiles WHERE router_id = ?',
        [routerId]
      );
      dbProfiles = Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn(
        '[billing/profiles-by-router] failed to load hotspot_profiles from DB:',
        e.message
      );
      dbProfiles = [];
    }

    const dbByName = new Map();
    for (const p of dbProfiles) {
      const name = (p.profile_name || '').toString().trim();
      if (!name) continue;
      dbByName.set(name, p);
    }

    // Primary source of truth: DB rows. This avoids live MikroTik calls for billing, keeping
    // the endpoint fast and resilient under load.
    if (dbProfiles.length > 0) {
      const mappedFromDb = dbProfiles.map((p) => ({
        profile_name: (p.profile_name || '').toString().trim(),
        uptime_limit: p.validity || null,
        rate_limit: p.rate_limit || null,
        data_limit: null,
        price_ugx: p.price != null ? Number(p.price) : null,
      })).filter((p) => p.profile_name);

      return res.json({ success: true, router_id: String(routerId), profiles: mappedFromDb });
    }

    // Fallback ONLY when hotspot_profiles table is empty for this router.
    try {
      profiles = await mikrotikService.getHotspotProfiles(r);
    } catch (e) {
      console.warn(
        '[billing/profiles-by-router] Mikrotik profiles fetch failed, returning empty list:',
        e.message
      );
      return res.json({ success: true, router_id: String(routerId), profiles: [] });
    }

    const mapped = Array.isArray(profiles)
      ? profiles
          .map((p) => {
            console.log('[billing/profiles-by-router] raw profile', p);
            const name = (p.name || p['profile-name'] || '').toString().trim();
            if (!name) return null;

            // MikroTik uses hyphenated keys
            const rateLimit = p['rate-limit'] || null;
            const dataLimit =
              p['address-pool'] ||
              p['data-limit'] ||
              null;

            // Merge in validity/price from RouterHub DB if present
            const dbRow = dbByName.get(name) || null;
            const validity = dbRow?.validity || null;
            const priceUgx = dbRow?.price != null ? Number(dbRow.price) : null;

            return {
              profile_name: name,
              uptime_limit: validity || null,
              rate_limit: rateLimit || null,
              data_limit: dataLimit,
              price_ugx: priceUgx,
            };
          })
          .filter(Boolean)
      : [];

    return res.json({ success: true, router_id: String(routerId), profiles: mapped });
  } catch (err) {
    console.error(err);
    return billingFail(res, 500, 'MIKROTIK_ERROR', 'Failed to fetch profiles');
  }
});

/**
 * POST /api/billing/update-profile
 * Update hotspot profile settings on MikroTik for a specific router.
 */
router.post('/update-profile', requireBillingApiKeyV2, async (req, res) => {
  try {
    const routerId = parseInt(req.body?.routerhub_router_id, 10);
    const ownerId = parseInt(req.body?.owner_id, 10);
    const profileName =
      typeof req.body?.profile_name === 'string' ? req.body.profile_name.trim() : '';
    const newProfileName =
      typeof req.body?.new_profile_name === 'string'
        ? req.body.new_profile_name.trim()
        : '';
    const uptimeLimit =
      typeof req.body?.uptime_limit === 'string' && req.body.uptime_limit.trim()
        ? req.body.uptime_limit.trim()
        : null;
    const rateLimit =
      typeof req.body?.rate_limit === 'string' && req.body.rate_limit.trim()
        ? req.body.rate_limit.trim()
        : null;
    // data_limit is accepted but not currently mapped to a Mikrotik field; reserved for future use.
    const dataLimit =
      typeof req.body?.data_limit === 'string' && req.body.data_limit.trim()
        ? req.body.data_limit.trim()
        : null;

    if (!routerId || !ownerId || !profileName) {
      return billingFail(
        res,
        400,
        'MIKROTIK_ERROR',
        'routerhub_router_id, owner_id, profile_name required'
      );
    }

    const [routerRows] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routerRows.length === 0) return billingFail(res, 404, 'ROUTER_NOT_FOUND', 'Router not found');
    const r = routerRows[0];

    if (parseInt(r.billing_owner_id, 10) !== ownerId) {
      return billingFail(res, 403, 'OWNERSHIP_MISMATCH', 'Router does not belong to owner');
    }
    if (!r.wg_ip) return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router has no wg_ip');
    if (r.status !== 'online') return billingFail(res, 400, 'ROUTER_OFFLINE', 'Router offline');

    // Step 1: update session-timeout and rate-limit using existing service helper.
    try {
      const profileData = {};
      if (uptimeLimit) profileData.session_timeout = uptimeLimit;
      if (rateLimit) profileData.rate_limit = rateLimit;
      if (Object.keys(profileData).length > 0) {
        await mikrotikService.updateHotspotProfile(r, profileName, profileData);
      }
    } catch (e) {
      const msg = mikrotikService.formatMikrotikConnectionError
        ? mikrotikService.formatMikrotikConnectionError(e)
        : (e.message || 'Failed to update profile');
      if (msg.toLowerCase().includes('not found')) {
        return billingFail(res, 400, 'PROFILE_NOT_FOUND', msg);
      }
      return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
    }

    // Step 2: optional rename if new_profile_name provided and different.
    if (newProfileName && newProfileName !== profileName) {
      try {
        await mikrotikService.withLockedConnection(r, async (conn) => {
          const profiles = await conn.write('/ip/hotspot/user/profile/print', [
            `?name=${profileName}`,
          ]);
          if (!profiles || !profiles.length) {
            throw new Error(`Profile ${profileName} not found on router`);
          }
          const mikrotikId = profiles[0]['.id'] || profiles[0].id;
          await conn.write('/ip/hotspot/user/profile/set', [
            `=.id=${mikrotikId}`,
            `=name=${newProfileName}`,
          ]);
        });
      } catch (e) {
        const msg = mikrotikService.formatMikrotikConnectionError
          ? mikrotikService.formatMikrotikConnectionError(e)
          : (e.message || 'Failed to rename profile');
        return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
      }
    }

    return res.json({
      success: true,
      profile_name: newProfileName || profileName,
      router_id: String(routerId),
      data_limit: dataLimit || null,
    });
  } catch (err) {
    console.error(err);
    const msg = mikrotikService.formatMikrotikConnectionError
      ? mikrotikService.formatMikrotikConnectionError(err)
      : 'Failed to update profile';
    return billingFail(res, 503, 'MIKROTIK_ERROR', msg);
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
