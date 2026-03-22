const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');

const authRoutes = require('./routes/auth');
const routerRoutes = require('./routes/routers');
const voucherRoutes = require('./routes/vouchers');
const wireguardRoutes = require('./routes/wireguard');
const reportRoutes = require('./routes/reports');
const billingRoutes = require('./routes/billing');
const { checkAllRoutersStatus } = require('./services/routerController');
const db = require('./config/database');
const mikrotikService = require('./services/mikrotikService');
const connectionReportService = require('./services/connectionReportService');

const app = express();
const PORT = process.env.PORT || 3000;

// Prevent the process from crashing on unexpected async errors (e.g. routeros library UNKNOWNREPLY).
// We log and keep the API running so callers get JSON errors instead of dropped sockets.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

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
app.use('/api/billing', billingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Router status check every 10 seconds for quick online/offline detection
const STATUS_INTERVAL = 10 * 1000;
checkAllRoutersStatus().catch((err) => console.error('Status check error:', err.message));
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
        const msg = err?.message || err?.code || String(err) || 'Unknown';
        console.warn(`Stats refresh failed for router ${r.id}:`, msg);
      }
    }
  } catch (err) {
    console.error('Stats refresh error:', err.message);
  }
}

const STATS_INTERVAL = 5 * 60 * 1000;
setInterval(refreshAllRouterStats, STATS_INTERVAL);
setTimeout(refreshAllRouterStats, 10000); // First run after 10s

// Connection snapshots for trend reports (every 15 min)
async function recordConnectionSnapshots() {
  try {
    const [routers] = await db.query(
      "SELECT * FROM routers WHERE status = 'online' AND wg_ip IS NOT NULL"
    );
    for (const r of routers) {
      await connectionReportService.recordSnapshot(r).catch(() => {});
    }
  } catch (err) {
    console.error('Connection snapshot error:', err.message);
  }
}
const SNAPSHOT_INTERVAL = 15 * 60 * 1000;
setInterval(recordConnectionSnapshots, SNAPSHOT_INTERVAL);
setTimeout(recordConnectionSnapshots, 60000); // First run after 1 min

app.listen(PORT, () => {
  console.log(`RouterHub API running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
