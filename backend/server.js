require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const routerRoutes = require('./routes/routers');
const voucherRoutes = require('./routes/vouchers');
const wireguardRoutes = require('./routes/wireguard');
const reportRoutes = require('./routes/reports');
const { checkAllRoutersStatus } = require('./services/routerController');
const db = require('./config/database');
const mikrotikService = require('./services/mikrotikService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Apache reverse proxy)
app.set('trust proxy', 1);

// MySQL session store (persists across restarts); fallback to MemoryStore if MySQL fails
let sessionStore;
try {
  const storeOptions = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'routerhub',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'routerhub',
  };
  sessionStore = new MySQLStore(storeOptions);
  console.log('Using MySQL session store');
} catch (err) {
  console.warn('MySQL session store failed, using memory:', err.message);
  sessionStore = undefined;
}

// Session config (secure: false when using HTTP; set USE_HTTPS=1 when behind HTTPS)
// Don't set cookie domain - let browser use request host (ProxyPreserveHost ensures correct Host)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'routerhub-secret-change-in-production',
    store: sessionStore || undefined,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      path: '/',
      secure: process.env.USE_HTTPS === '1',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true,
    },
  })
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/routers', routerRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/wireguard', wireguardRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Router status check every 30 seconds (uses WireGuard handshake when available)
const STATUS_INTERVAL = 30 * 1000;
setInterval(() => {
  checkAllRoutersStatus().catch((err) => console.error('Status check error:', err.message));
}, STATUS_INTERVAL);

// Router stats cache refresh every 5 minutes
async function refreshAllRouterStats() {
  try {
    const [routers] = await db.query(
      "SELECT * FROM routers WHERE status = 'online' AND (lan_ip IS NOT NULL OR initial_ip IS NOT NULL)"
    );
    for (const r of routers) {
      try {
        const stats = await mikrotikService.getRouterStats(r);
        const res = stats.resources || {};
        const cpuLoad = Math.round(parseFloat(res['cpu-load']) || 0);
        const totalMem = parseInt(res['total-memory'], 10) || 0;
        const freeMem = parseInt(res['free-memory'], 10) || 0;
        const usedMem = totalMem - freeMem;
        const uptime = res.uptime || '';

        await db.query(
          `INSERT INTO router_stats (router_id, cpu_load, memory_used, memory_total, uptime, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
           cpu_load = VALUES(cpu_load),
           memory_used = VALUES(memory_used),
           memory_total = VALUES(memory_total),
           uptime = VALUES(uptime),
           updated_at = NOW()`,
          [r.id, cpuLoad, usedMem, totalMem, uptime]
        );
      } catch (err) {
        console.warn(`Stats refresh failed for router ${r.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Stats refresh error:', err.message);
  }
}

const STATS_INTERVAL = 5 * 60 * 1000;
setInterval(refreshAllRouterStats, STATS_INTERVAL);
setTimeout(refreshAllRouterStats, 10000); // First run after 10s

app.listen(PORT, () => {
  console.log(`RouterHub API running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
