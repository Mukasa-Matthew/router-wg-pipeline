const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/reports/revenue - Revenue all routers
 */
router.get('/revenue', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.id, r.name, r.location, SUM(rev.amount) as total_revenue, COUNT(rev.id) as transaction_count
       FROM routers r
       LEFT JOIN revenue rev ON r.id = rev.router_id
       GROUP BY r.id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

/**
 * GET /api/reports/revenue/:id - Revenue single router
 */
router.get('/revenue/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM revenue WHERE router_id = ? ORDER BY date DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

/**
 * GET /api/reports/vouchers/:id - Voucher stats per router
 */
router.get('/vouchers/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(exported) as exported,
        SUM(used) as used
       FROM vouchers WHERE router_id = ?`,
      [req.params.id]
    );
    res.json(rows[0] || { total: 0, exported: 0, used: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch voucher stats' });
  }
});

module.exports = router;
