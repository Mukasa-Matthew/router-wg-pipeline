# RouterHub Frontend

Modern dashboard built with **Vite 8**, **React 19**, **TypeScript**, **Tailwind CSS**, and **Lucide React** icons.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Vite 8** | Build tool & dev server |
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Tailwind CSS 3** | Styling |
| **Lucide React** | 1,500+ icons (tree-shaken) |
| **React Router 7** | Client-side routing |

## Scripts

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build
npm run preview  # Preview production build
```

## Development

1. Start the backend API on port 3000
2. Run `npm run dev` — Vite proxies `/api` to the backend
3. Open http://localhost:5173

## Pages

- **Login** — Username, email, or phone + password
- **Dashboard** — Router cards, add router, vouchers
- **Routers** — Full router list
- **Vouchers** — Generate & export per router
- **WireGuard** — Tunnel status
- **Reports** — Revenue summary
