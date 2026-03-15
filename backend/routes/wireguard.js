const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const wireguardService = require('../services/wireguardService');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/wireguard/status - All tunnel statuses
 */
router.get('/status', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT wp.*, r.name as router_name FROM wireguard_peers wp JOIN routers r ON wp.router_id = r.id'
    );
    const liveStatus = await wireguardService.getTunnelStatus();
    const byKey = {};
    liveStatus.forEach((p) => {
      byKey[p.publicKey] = p;
    });
    const now = Date.now();
    const enriched = rows.map((r) => {
      const live = byKey[r.public_key];
      const lastHandshake = live?.lastHandshake || (r.last_handshake ? new Date(r.last_handshake) : null);
      const minutesAgo = lastHandshake ? (now - lastHandshake.getTime()) / 60000 : null;
      const connected = lastHandshake && minutesAgo !== null && minutesAgo < 3;
      return {
        ...r,
        last_handshake: lastHandshake ? lastHandshake.toISOString() : r.last_handshake,
        bytes_sent: live?.bytesSent ?? r.bytes_sent ?? 0,
        bytes_received: live?.bytesReceived ?? r.bytes_received ?? 0,
        status: connected ? 'connected' : 'disconnected',
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch WireGuard status' });
  }
});

/**
 * GET /api/wireguard/:routerId - Single tunnel status
 */
router.get('/:routerId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM wireguard_peers WHERE router_id = ?',
      [req.params.routerId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tunnel not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tunnel' });
  }
});

/**
 * DELETE /api/wireguard/:routerId - Remove tunnel
 */
router.delete('/:routerId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT public_key FROM wireguard_peers WHERE router_id = ?',
      [req.params.routerId]
    );
    if (rows.length > 0 && rows[0].public_key) {
      await wireguardService.removePeerFromVPS(rows[0].public_key);
    }
    await db.query('DELETE FROM wireguard_peers WHERE router_id = ?', [req.params.routerId]);
    await db.query('UPDATE routers SET wg_ip = NULL, wg_public_key = NULL, wg_private_key = NULL WHERE id = ?', [
      req.params.routerId,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
