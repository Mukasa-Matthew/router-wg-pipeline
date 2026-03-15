# RouterHub Docker Setup

Run the backend + MySQL with one command. Database, tables, and admin seed are created automatically.

## Quick Start (VPS)

```bash
# Clone and run
git clone <your-repo>
cd wifi\ wallet\ management\ dahboard

# Optional: create .env with your settings
cp .env.example .env
# Edit .env: DB_PASS, SESSION_SECRET, VPS_IP, WG_* for production

# Start everything
docker compose up -d

# Backend: http://localhost:3000
# Health: http://localhost:3000/api/health
```

## What Happens Automatically

1. **MySQL** starts and becomes healthy
2. **Backend** waits for MySQL, then:
   - Creates `routerhub` database
   - Creates all tables (admin, routers, vouchers, etc.)
   - Seeds admin user
   - Starts the API server

## Default Admin Login

- **Username:** matthew  
- **Email:** matthewmukasa50@gmail.com  
- **Phone:** 0792255955  
- **Password:** 1100211Matt.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DB_PASS | routerhub_secret | MySQL root password |
| SESSION_SECRET | routerhub-docker-secret | Session cookie secret |
| VPS_IP | - | Your VPS IP for WireGuard |
| WG_PUBLIC_KEY | - | WireGuard server public key |
| WG_PRIVATE_KEY | - | WireGuard server private key |

## Production Notes

- Set strong `DB_PASS` and `SESSION_SECRET`
- WireGuard commands run on the host; ensure `wg` CLI is installed on the VPS
- Frontend: build and serve separately (e.g. nginx) or add to docker-compose
