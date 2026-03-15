# RouterHub — Complete Project Summary

---

## 1. PROJECT OVERVIEW

### What the system does
**RouterHub** is a MikroTik Router Management Dashboard that:
- Manages multiple MikroTik routers remotely via WireGuard VPN tunnels
- Adds routers by testing MikroTik API connection, generating WireGuard keys, assigning IPs, and adding peers to a VPS
- Provides step-by-step connect commands for admins to run on MikroTik (Winbox/SSH)
- Generates hotspot vouchers on MikroTik and exports them as CSV
- Tracks router status (online/offline/tunnel_failed) via WireGuard handshake
- Shows WireGuard tunnel status, router stats (CPU, RAM, uptime), and active hotspot users
- Reports revenue per router (from `revenue` table)
- Integrates with **MikHmon** — a service for hotspot management (config.php sessions) — but the integration is **not yet wired** into the main flow

### Tech stack
- **Backend:** Node.js, Express, MySQL2, bcryptjs, express-session, node-routeros, multer, cors
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS, Lucide React, React Router 7
- **Infrastructure:** Docker (MySQL + backend), WireGuard on VPS

### Where it runs
- **Development:** Local (backend on port 3000, frontend on port 5173 with proxy to `/api`)
- **Production:** Docker Compose on VPS (MySQL + backend); frontend built and served separately (e.g. nginx)
- **WireGuard:** Must run on Linux (VPS); `wg` CLI is required for adding peers, generating keys, and checking tunnel status

---

## 2. FOLDER STRUCTURE

```
wifi wallet management dahboard/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── db/
│   │   ├── init.js
│   │   ├── migrate.js
│   │   ├── schema.sql
│   │   └── seed.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── reports.js
│   │   ├── routers.js
│   │   ├── vouchers.js
│   │   └── wireguard.js
│   ├── services/
│   │   ├── mikrotikService.js
│   │   ├── mikhmonService.js
│   │   ├── routerController.js
│   │   └── wireguardService.js
│   ├── .env
│   ├── Dockerfile
│   ├── entrypoint.js
│   ├── package.json
│   ├── README.md
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddRouterModal.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── RouterCard.tsx
│   │   │   └── VoucherModal.tsx
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── pages/
│   │   │   ├── ConnectRouterPage.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── RouterDetailPage.tsx
│   │   │   ├── Routers.tsx
│   │   │   ├── VouchersPage.tsx
│   │   │   └── WireGuardPage.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── dist/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── README.md
├── docker-compose.yml
├── DOCKER.md
└── PROJECT_SUMMARY.md
```

---

## 3. DATABASE

### Tables

| Table | Purpose |
|-------|---------|
| `admin` | Admin users (login by username, email, or phone) |
| `routers` | MikroTik routers with WireGuard config |
| `vouchers` | Hotspot vouchers per router |
| `revenue` | Revenue entries per router |
| `wireguard_peers` | WireGuard peer records per router |
| `router_stats` | Cached CPU, RAM, uptime (refreshed every 5 min) |

### Schema

**admin**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PRIMARY KEY AUTO_INCREMENT |
| username | VARCHAR(100) | NOT NULL, UNIQUE |
| email | VARCHAR(255) | UNIQUE |
| phone | VARCHAR(50) | UNIQUE |
| password | VARCHAR(255) | NOT NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**routers**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PRIMARY KEY AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| location | VARCHAR(200) | |
| lan_ip | VARCHAR(50) | NOT NULL |
| initial_ip | VARCHAR(50) | |
| api_port | INT | DEFAULT 8728 |
| username | VARCHAR(100) | NOT NULL |
| password | VARCHAR(255) | NOT NULL |
| wg_ip | VARCHAR(50) | UNIQUE |
| wg_public_key | TEXT | |
| wg_private_key | TEXT | |
| client_name | VARCHAR(100) | |
| monthly_price | DECIMAL(10,2) | |
| notes | TEXT | |
| status | ENUM('online','offline','tunnel_failed') | DEFAULT 'offline' |
| last_seen | DATETIME | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**vouchers**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PRIMARY KEY AUTO_INCREMENT |
| router_id | INT | NOT NULL, FK → routers(id) ON DELETE CASCADE |
| username | VARCHAR(100) | |
| password | VARCHAR(100) | |
| profile | VARCHAR(100) | |
| uptime_limit | VARCHAR(50) | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| exported | TINYINT | DEFAULT 0 |
| exported_at | DATETIME | |
| used | TINYINT | DEFAULT 0 |

**revenue**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PRIMARY KEY AUTO_INCREMENT |
| router_id | INT | NOT NULL, FK → routers(id) ON DELETE CASCADE |
| amount | DECIMAL(10,2) | |
| voucher_profile | VARCHAR(100) | |
| quantity | INT | |
| date | DATE | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**wireguard_peers**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | PRIMARY KEY AUTO_INCREMENT |
| router_id | INT | NOT NULL, FK → routers(id) ON DELETE CASCADE |
| public_key | TEXT | |
| private_key | TEXT | |
| wg_ip | VARCHAR(50) | |
| last_handshake | DATETIME | |
| bytes_sent | BIGINT | DEFAULT 0 |
| bytes_received | BIGINT | DEFAULT 0 |
| status | ENUM('connected','disconnected') | DEFAULT 'disconnected' |

**router_stats**
| Column | Type | Constraints |
|--------|------|-------------|
| router_id | INT | PRIMARY KEY, FK → routers(id) ON DELETE CASCADE |
| cpu_load | INT | DEFAULT 0 |
| memory_used | BIGINT | DEFAULT 0 |
| memory_total | BIGINT | DEFAULT 0 |
| uptime | VARCHAR(100) | |
| updated_at | DATETIME | |

### Migrations run
- `db/migrate.js` adds:
  - `initial_ip` to `routers`
  - `exported_at` to `vouchers`
  - `unique_wg_ip` on `routers.wg_ip`
  - `tunnel_failed` to `status` ENUM
  - `router_stats` table (if not exists)

---

## 4. BACKEND — API ENDPOINTS

| Method | Path | Description | Returns |
|--------|------|-------------|---------|
| GET | /api/health | Health check | `{ ok, timestamp }` |
| POST | /api/auth/login | Login (identifier + password) | `{ success, admin }` |
| POST | /api/auth/logout | Logout | `{ success }` |
| GET | /api/auth/me | Session check | `{ loggedIn, admin? }` |
| GET | /api/routers | List routers | Array of routers |
| GET | /api/routers?dashboard=true | List with dashboard enrichment | Routers + total_vouchers, pending_export, today_revenue, cpu_load, uptime |
| POST | /api/routers | Add router | `{ success, router_id }` or `{ jobId }` |
| GET | /api/routers/add-progress/:jobId | SSE progress for add router | `{ step, message, status, done?, success? }` |
| GET | /api/routers/:id | Get router | Router object |
| PUT | /api/routers/:id | Update router | `{ success }` |
| DELETE | /api/routers/:id | Delete router + cleanup WireGuard | `{ success }` |
| GET | /api/routers/:id/connect-commands | MikroTik connect commands | `{ commands, tunnel_status, wg_ip, ... }` |
| GET | /api/routers/:id/test-tunnel | Check WireGuard tunnel status | `{ tunnel_up, last_handshake, minutes_ago, ... }` |
| GET | /api/routers/:id/stats | Router stats (CPU, RAM, uptime) | `{ resources, identity, cached? }` |
| GET | /api/routers/:id/users | Active hotspot users | Array of users |
| POST | /api/routers/:id/reboot | Reboot router | `{ success }` |
| POST | /api/vouchers/generate | Generate vouchers | `{ success, vouchers }` |
| GET | /api/vouchers/export/:routerId | Export unexported vouchers (CSV) | CSV file |
| GET | /api/vouchers/export-new/:routerId | Same as export | CSV file |
| GET | /api/vouchers/pending/:routerId | Pending export count | `{ count }` |
| GET | /api/vouchers/:routerId | List vouchers per router | Array of vouchers |
| GET | /api/wireguard/status | All tunnel statuses | Array of peers with handshake/bytes |
| GET | /api/wireguard/:routerId | Single tunnel | Peer object |
| DELETE | /api/wireguard/:routerId | Remove tunnel | `{ success }` |
| GET | /api/reports/revenue | Revenue all routers | Array of summaries |
| GET | /api/reports/revenue/:id | Revenue per router | Array of entries |
| GET | /api/reports/vouchers/:id | Voucher stats per router | `{ total, exported, used }` |

All endpoints except `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, and `/api/health` require authentication via session.

---

## 5. FRONTEND — PAGES

| Page | Route | What it shows | Actions |
|------|-------|---------------|---------|
| Login | /login | Login form | Username/email/phone + password login |
| Dashboard | / | Stats cards, router grid | Add Router, Manage, Vouchers |
| Routers | /routers | Router grid | Add Router, Manage, Vouchers |
| Router Detail | /routers/:id | Router info, WireGuard status | View Connection Commands |
| Connect Router | /routers/:id/connect | Step-by-step MikroTik commands | Copy, Print, Test Connection, Go to Router Dashboard |
| Vouchers | /vouchers | Router cards for voucher management | Manage, Export CSV |
| WireGuard | /wireguard | All tunnel statuses | — |
| Reports | /reports | Revenue, transactions | — |

### Components
- **Layout** — Sidebar nav, user section, logout
- **AddRouterModal** — Add router form with SSE progress
- **VoucherModal** — Generate vouchers, export, copy
- **RouterCard** — Router card with Manage, Vouchers, Reboot, Delete
- **PageHeader** — Title, subtitle, optional action

---

## 6. SERVICES

### wireguardService.js
| Function | Purpose |
|----------|---------|
| `execCmd(cmd)` | Run shell command (wg only on Linux) |
| `generateKeypair()` | Generate WireGuard private/public keys |
| `getNextAvailableIP()` | Next free IP in 10.10.0.x |
| `addPeerToVPS(publicKey, wgIp)` | Add peer to wg0 (live + wg0.conf) |
| `removePeerFromVPS(publicKey)` | Remove peer from wg0 |
| `removePeerFromConfig(publicKey)` | Remove peer from wg0.conf file |
| `getTunnelStatus()` | Parse `wg show wg0 dump` for status |
| `verifyTunnel(wgIp, maxAttempts)` | Poll until handshake |

### mikrotikService.js
| Function | Purpose |
|----------|---------|
| `testConnection(ip, user, pass, port)` | Test MikroTik API connection |
| `connect(router)` | Connect via wg_ip or lan_ip |
| `connectByIp(ip, username, password, port)` | Connect by explicit IP |
| `addWireGuardInterface(router, privateKey, wgIp)` | Add WG interface on MikroTik |
| `addWireGuardPeer(router)` | Add VPS as peer on MikroTik |
| `getRouterStats(router)` | CPU, RAM, uptime |
| `getActiveHotspotUsers(router)` | Active hotspot users |
| `rebootRouter(router)` | Reboot router |
| `generateVouchersOnMikrotik(router, profile, count, prefix)` | Create hotspot users |

### mikhmonService.js
| Function | Purpose |
|----------|---------|
| `encrypt(str, key)` | MikHmon-compatible password encryption |
| `getSessionName(router)` | Session name from router name + id |
| `backupConfig()` | Backup config.php before write |
| `addMikHmonSession(router)` | Append session block to config.php |
| `removeMikHmonSession(routerId, routerName)` | Remove session block |
| `getMikHmonUrl(routerId, routerName)` | Return MikHmon URL for session |

**Note:** `mikhmonService` is **not** called from routers or routerController yet.

### routerController.js
| Function | Purpose |
|----------|---------|
| `addRouter(routerData, onStep)` | Add router + WireGuard peer |
| `updateRouterStatus(routerId, status)` | Update router status |
| `checkAllRoutersStatus()` | Poll WireGuard handshake for all routers |
| `deleteRouter(routerId)` | Delete router + cleanup WireGuard |

---

## 7. FEATURES COMPLETED ✅

- Admin login (username, email, phone + password)
- Session-based auth with protected routes
- Add router with SSE progress (test connection, generate keys, assign IP, add peer, save DB)
- Connect commands page with copy/print
- Test tunnel (WireGuard handshake check)
- Router status polling (every 30s) via WireGuard handshake
- Router stats cache (every 5 min) for CPU, RAM, uptime
- Router cards with Manage, Vouchers, Reboot, Delete
- Voucher generation on MikroTik
- Voucher export (CSV, unexported only)
- Voucher pending count
- WireGuard tunnel status page
- Reports (revenue, voucher stats)
- Delete router with WireGuard cleanup
- Docker Compose (MySQL + backend)
- Redirect to connect page after add router
- MikHmon service: `addMikHmonSession`, `removeMikHmonSession`, `getMikHmonUrl` (implemented but not wired)

---

## 8. FEATURES PARTIALLY DONE ⚠️

### MikHmon integration
- **Status:** Service exists but not integrated
- **Missing:**
  1. Call `addMikHmonSession(router)` when `test-tunnel` returns `tunnel_up` (need full router with password)
  2. Call `removeMikHmonSession(routerId, routerName)` in `deleteRouter` before deleting
  3. API endpoint `GET /api/routers/:id/mikhmon-url` returning `{ url }`
  4. "Open in MikHmon" button on Router Detail page
  5. MikHmon button on Router cards

### Dashboard enrichment
- **Status:** Backend supports `GET /api/routers?dashboard=true` with enriched data
- **Missing:** Frontend does not use `dashboard=true`; RouterCard loads users/pending separately

---

## 9. FEATURES NOT STARTED ❌

- API endpoint for MikHmon URL
- "Open in MikHmon" button on Router Detail page
- MikHmon button on Router cards
- Wire `addMikHmonSession` when tunnel is UP
- Wire `removeMikHmonSession` when router is deleted
- Revenue entry creation (revenue table exists but no UI/API to add entries)
- Frontend in Docker (only backend + MySQL in docker-compose)

---

## 10. KNOWN ISSUES OR BUGS

- **WireGuard on Windows:** Backend cannot add routers on Windows — `wg` CLI is Linux-only. Add routers on VPS.
- **MikHmon on Windows:** `mikhmonService` skips config writes on Windows (`config.php` path not available).
- **Voucher export:** Uses `api.vouchers.exportUrl(routerId)` — direct link; requires session cookie. May fail if CORS/credentials not handled.
- **WireGuard status:** `wireguard/status` joins `wireguard_peers` with `routers`; live handshake comes from `wg show`; `status` in DB may be stale.
- **Revenue:** No UI to add revenue entries; reports show data from `revenue` table only.

---

## 11. ENVIRONMENT VARIABLES

| Variable | Current | Description |
|----------|---------|-------------|
| DB_HOST | localhost | MySQL host |
| DB_USER | root | MySQL user |
| DB_PASS | *** | MySQL password |
| DB_NAME | routerhub | Database name |
| SESSION_SECRET | routerhub-dev-secret-change-me | Session cookie secret |
| VPS_IP | 198.199.76.158 | VPS IP for WireGuard |
| WG_PUBLIC_KEY | *** | WireGuard server public key |
| WG_PRIVATE_KEY | *** | WireGuard server private key |
| WG_SUBNET | 10.10.0 | Subnet for router IPs |
| WG_PORT | 51820 | WireGuard port |
| WG_INTERFACE | wg0 | WireGuard interface name |
| MIKROTIK_DEFAULT_API_PORT | 8728 | Default MikroTik API port |
| MIKHMON_URL | (not set) | MikHmon base URL (default: http://VPS_IP/mikhmon) |

---

## 12. HOW TO RUN

### Development mode

1. **Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env   # edit .env
   node db/init.js
   npm run seed
   npm run dev
   ```
   API: http://localhost:3000

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   App: http://localhost:5173 (proxies /api to backend)

3. **MySQL**

   Ensure MySQL is running and `routerhub` exists. Use `DB_*` in `.env`.

### Production mode

1. **Backend**
   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm run build
   npm run preview   # or serve dist/ with nginx
   ```

3. Set `VITE_API_URL` for production API base URL if needed.

### Docker

```bash
# Optional: create .env with DB_PASS, SESSION_SECRET, VPS_IP, WG_*
docker compose up -d
```

- Backend: http://localhost:3000
- Health: http://localhost:3000/api/health
- MySQL: auto-init, migrate, seed

**Note:** WireGuard commands run on the host; ensure `wg` is installed on the VPS and the backend container has access (or run backend on host).

---

## 13. WHAT NEEDS TO BE DONE NEXT

1. **MikHmon integration**
   - In `GET /api/routers/:id/test-tunnel`, when `tunnel_up` becomes true, load full router (with password), call `addMikHmonSession(router)`.
   - In `routerController.deleteRouter`, before deleting, fetch router name and call `removeMikHmonSession(routerId, routerName)`.
   - Add `GET /api/routers/:id/mikhmon-url` returning `{ url }`.
   - Add `api.routers.mikhmonUrl(id)` in frontend.
   - Add "Open in MikHmon" button on Router Detail page (when `wg_ip` present).
   - Add MikHmon button on Router cards (when `wg_ip` present).

2. **Production deployment**
   - Deploy backend + MySQL on VPS (Docker or bare).
   - Install WireGuard on VPS; ensure `wg` is available.
   - Build frontend and serve via nginx (or add frontend to docker-compose).
   - Configure `VITE_API_URL` for production API base.
   - Set strong `SESSION_SECRET` and `DB_PASS`.

3. **MikHmon on VPS**
   - Ensure MikHmon is installed at `/var/www/html/mikhmon/include/config.php`.
   - Ensure backend has write access to config.php and backup directory.
   - Set `MIKHMON_URL` if different from `http://VPS_IP/mikhmon`.

4. **Optional**
   - Add revenue entry UI (create/update revenue).
   - Use `dashboard=true` in Dashboard for enriched router data.
   - Add frontend to docker-compose for full stack.
