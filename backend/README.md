# RouterHub Backend

MikroTik Router Management Dashboard API.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

Required for local dev:
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` - MySQL credentials
- `SESSION_SECRET` - Random string for session encryption

### 3. Initialize database

Create the `routerhub` database and tables. Use a MySQL user with CREATE privileges (e.g. `root`):

```bash
# Ensure DB_USER in .env has CREATE DATABASE permission, or temporarily use root
node db/init.js
```

### 4. Seed admin credentials

```bash
npm run seed
```

This creates/updates the admin:
- **Username:** matthew
- **Email:** matthewmukasa50@gmail.com
- **Phone:** 0792255955
- **Password:** 1100211Matt.

### 5. Start server

```bash
npm start
# or for dev with auto-reload:
npm run dev
```

API runs at `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login (identifier + password) |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Session check |
| GET | /api/routers | List routers |
| POST | /api/routers | Add router (supports SSE for progress) |
| GET | /api/routers/:id | Get router |
| PUT | /api/routers/:id | Update router |
| DELETE | /api/routers/:id | Delete router |
| GET | /api/routers/:id/stats | Router stats |
| GET | /api/routers/:id/users | Active hotspot users |
| POST | /api/routers/:id/reboot | Reboot router |
| GET | /api/vouchers/:routerId | List vouchers |
| POST | /api/vouchers/generate | Generate vouchers |
| GET | /api/vouchers/export/:routerId | Export CSV |
| GET | /api/vouchers/export-new/:routerId | Export new only |
| GET | /api/wireguard/status | All tunnel statuses |
| GET | /api/wireguard/:routerId | Single tunnel |
| DELETE | /api/wireguard/:routerId | Remove tunnel |
| GET | /api/reports/revenue | Revenue all |
| GET | /api/reports/revenue/:id | Revenue per router |
| GET | /api/reports/vouchers/:id | Voucher stats |

## Login request

```json
POST /api/auth/login
{
  "identifier": "matthew",
  "password": "1100211Matt."
}
```

`identifier` can be username, email, or phone.
