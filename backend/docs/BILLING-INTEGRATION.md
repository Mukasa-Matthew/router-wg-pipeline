# RouterHub ↔ WiFi Billing — Hotspot owners view their routers

RouterHub stays the **single place** for router management (WireGuard, MikroTik, vouchers). Billing only **displays** router status for hotspot owners. No VPN or MikroTik connectivity on the billing side.

## Flow

1. **RouterHub (super admin)**  
   You link each router to a billing hotspot owner (Add/Edit Router → Billing client). Routers keep working exactly as before.

2. **Billing app (hotspot owners)**  
   When an owner logs in, your billing backend calls RouterHub to get **real-time** status for that owner’s routers, then your “My Routers” page shows name, status, last seen, CPU, memory, uptime.

3. **Data source**  
   All live data (online/offline, stats) comes from RouterHub. Billing does **not** connect to MikroTik or any VPN; it only calls RouterHub’s API.

---

## Billing backend: “My Routers” for one owner

### 1. Shared secret

- In **RouterHub** `.env`: set `BILLING_API_SECRET` to a long random string.
- In your **billing app** config: set the same value (e.g. `ROUTERHUB_BILLING_SECRET`).

### 2. Call RouterHub when the owner opens “My Routers”

When the logged-in user is a hotspot owner, get their `hotspot_owner_id` (e.g. from `users.hotspot_owner_id` or session). Then:

```http
GET https://<routerhub-domain>/api/billing/status-by-owner/<hotspot_owner_id>
X-Billing-Api-Key: <BILLING_API_SECRET>
```

Example (Node):

```js
const ownerId = req.user.hotspot_owner_id; // or from session
const res = await fetch(
  `https://your-routerhub.com/api/billing/status-by-owner/${ownerId}`,
  { headers: { 'X-Billing-Api-Key': process.env.ROUTERHUB_BILLING_SECRET } }
);
const { owner_id, routers } = await res.json();
// Use `routers` to render "My Routers" (name, status, last_seen, cpu_load, uptime, etc.)
```

### 3. Response shape

```json
{
  "owner_id": 1,
  "routers": [
    {
      "router_id": 5,
      "billing_router_id": 12,
      "name": "Main Router - Cafe",
      "location": "Cafe",
      "status": "online",
      "wg_ip": "10.10.0.3",
      "last_seen": "2025-03-16T10:30:00.000Z",
      "cpu_load": 5,
      "memory_used": 128000000,
      "memory_total": 256000000,
      "uptime": "2w3d5h10m30s",
      "stats_updated_at": "2025-03-16T10:29:00.000Z"
    }
  ]
}
```

- `router_id`: RouterHub’s internal id.  
- `billing_router_id`: Your billing DB `mikrotik_routers.id` if you sync routers.  
- `status`: `"online"` | `"offline"` | `"tunnel_failed"`.  
- Only routers with `billing_owner_id = owner_id` in RouterHub are returned.

### 4. “My Routers” page in billing

- Backend: when the page loads (or on a short interval), call the URL above with the current owner’s id and the API key.
- Frontend: show a table/cards with `name`, `status`, `last_seen`, `uptime`, and optionally CPU/memory. No need to call MikroTik or VPN from billing.

---

## Summary

| Who              | Role                                                                 |
|------------------|----------------------------------------------------------------------|
| **RouterHub**    | Your super-admin tool. Manage routers, WireGuard, vouchers. Link each router to a billing owner. |
| **Billing**      | Shows hotspot owners *their* routers with real-time status by calling RouterHub’s API (API key only). |
| **Connectivity** | Only RouterHub talks to MikroTik (via its WireGuard). Billing never uses its own VPN or direct router connection. |
