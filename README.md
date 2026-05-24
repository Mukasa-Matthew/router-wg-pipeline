# RouterHub — MikroTik Router Management Dashboard

Manage multiple MikroTik routers remotely via WireGuard VPN. Add routers, generate hotspot vouchers, sync with MikHmon.

## Tech Stack

- **Backend:** Node.js, Express, MySQL
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Infrastructure:** WireGuard, MikHmon

## Quick Start

```bash
# Backend
cd backend
npm install
cp .env.example .env   # edit with your values
node db/init.js
node db/migrate.js
node db/seed.js
npm run dev
This happened ghlists the best

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- Dashboard: http://localhost:5173
- API: http://localhost:3000

## Deployment

See `deploy.sh` and `nginx-routerhub.conf` for VPS deployment.

## License

ISC
