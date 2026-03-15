const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login with username, email, or phone + password
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password required' });
    }

    const [rows] = await db.query(
      'SELECT id, username, email, phone, password FROM admin WHERE username = ? OR email = ? OR phone = ?',
      [identifier, identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.json({
      success: true,
      admin: { id: admin.id, username: admin.username, email: admin.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/me - Check session (optional, for frontend)
 */
router.get('/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({
      loggedIn: true,
      admin: { id: req.session.adminId, username: req.session.adminUsername },
    });
  }
  res.json({ loggedIn: false });
});

module.exports = router;
