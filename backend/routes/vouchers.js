const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const mikrotikService = require('../services/mikrotikService');

const router = express.Router();

/** Normalize validity to MikroTik format (e.g. 24h, 7d) for limit-uptime */
function normalizeValidityForMikrotik(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d+(m|h|d)$/i.test(s)) return s;
  const map = {
    '6-Hours': '6h', '6-hours': '6h',
    '12-Hours': '12h', '12-hours': '12h',
    '24-Hours': '24h', '24-hours': '24h',
    '1-Day': '1d', '1-day': '1d',
    '1-Week': '7d', '1-week': '7d',
    '1-Month': '30d', '1-month': '30d',
  };
  return map[s] || null;
}
router.use(requireAuth);

/**
 * POST /api/vouchers/generate - Generate batch vouchers (must be before :routerId)
 */
router.post('/generate', async (req, res) => {
  try {
    const { routerId, profile, count, prefix = 'v', uptime_limit } = req.body;
    if (!routerId || !profile || !count) {
      return res.status(400).json({ error: 'routerId, profile, count required' });
    }

    const [routers] = await db.query('SELECT * FROM routers WHERE id = ?', [routerId]);
    if (routers.length === 0) return res.status(404).json({ error: 'Router not found' });

    const router = routers[0];
    if (!router.wg_ip) {
      return res.status(400).json({
        error: 'Router must have WireGuard tunnel up. Run connect commands first.',
      });
    }

    const [profileRows] = await db.query(
      'SELECT * FROM hotspot_profiles WHERE router_id = ? AND profile_name = ?',
      [routerId, profile]
    );
    const hp = profileRows[0];
    const validity = hp ? hp.validity : uptime_limit || profile;
    const profilePrice = hp ? parseFloat(hp.price) || 0 : 0;

    const countNum = parseInt(count, 10);
    const limitUptime = normalizeValidityForMikrotik(validity);
    console.log(`[Router ${routerId}] Generating ${countNum} vouchers${limitUptime ? ` (limit-uptime=${limitUptime})` : ''}`);
    const mikrotikVouchers = await mikrotikService.generateVouchersOnMikrotik(
      router,
      profile,
      countNum,
      prefix,
      limitUptime
    );

    for (const v of mikrotikVouchers) {
      await db.query(
        'INSERT INTO vouchers (router_id, username, password, profile, uptime_limit, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [routerId, v.username, v.password, v.profile, validity]
      );
    }

    const totalAmount = profilePrice * countNum;
    if (totalAmount > 0) {
      await db.query(
        'INSERT INTO revenue (router_id, amount, voucher_profile, quantity, date) VALUES (?, ?, ?, ?, CURDATE())',
        [routerId, totalAmount, profile, countNum]
      );
    }

    const [created] = await db.query(
      'SELECT * FROM vouchers WHERE router_id = ? ORDER BY id DESC LIMIT ?',
      [routerId, mikrotikVouchers.length]
    );
    res.json({ success: true, vouchers: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

async function exportUnexportedVouchers(routerId, profile = null, res) {
  let query = 'SELECT id, username, password, profile, uptime_limit FROM vouchers WHERE router_id = ? AND exported = 0';
  const params = [routerId];
  if (profile) {
    query += ' AND profile = ?';
    params.push(profile);
  }
  const [rows] = await db.query(query, params);

  if (rows.length === 0) {
    res.status(400).json({ error: 'No new vouchers to export — all already exported' });
    return;
  }

  const [routerRows] = await db.query('SELECT name FROM routers WHERE id = ?', [routerId]);
  const routerSlug = routerRows[0]?.name?.toLowerCase().replace(/\s+/g, '-') || `router-${routerId}`;
  const date = new Date().toISOString().split('T')[0];
  const filename = `${routerSlug}-${profile || 'all'}-vouchers-${date}.csv`;

  const profileTimeMap = {
    '6-Hours': '6h',
    '12-Hours': '12h',
    '1-Day': '1d',
    '1-Week': '7d',
    '1-Month': '30d',
  };

  let csv = 'Login,Password,Uptime Limit,Used Uptime,Used Download,Used Upload\n';
  rows.forEach((v) => {
    const uptimeLimit = profileTimeMap[v.profile] || v.profile || v.uptime_limit || '';
    csv += `"${v.username}","${v.password}","${uptimeLimit}","","",""\n`;
  });

  const ids = rows.map((r) => r.id).join(',');
  await db.query(`UPDATE vouchers SET exported = 1, exported_at = NOW() WHERE id IN (${ids})`);

  console.log(`[Router ${routerId}] Exported ${rows.length} vouchers`);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/**
 * GET /api/vouchers/export/:routerId - Export ONLY unexported vouchers (anti-duplicate)
 */
router.get('/export/:routerId', async (req, res) => {
  try {
    await exportUnexportedVouchers(req.params.routerId, req.query.profile || null, res);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export-new/:routerId', async (req, res) => {
  try {
    await exportUnexportedVouchers(req.params.routerId, req.query.profile || null, res);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/vouchers/pending/:routerId - Count of unexported vouchers
 */
router.get('/pending/:routerId', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT COUNT(*) as count FROM vouchers WHERE router_id = ? AND exported = 0',
      [req.params.routerId]
    );
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

/**
 * GET /api/vouchers/:routerId - List vouchers per router
 */
router.get('/:routerId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM vouchers WHERE router_id = ? ORDER BY id DESC',
      [req.params.routerId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

module.exports = router;
