/**
 * Optional integration with WiFi Billing API.
 * Set BILLING_API_URL (e.g. https://martomor.xyz/api/v1) and BILLING_JWT for server-to-server calls.
 * If not set, getHotspotOwners returns [] and createRouterInBilling does nothing.
 *
 * Connectivity: We only use RouterHub's WireGuard (direct_ip with wg_ip). Do not use billing's VPN;
 * RouterHub's tunnel is the single source of router connectivity; billing just stores the router record.
 */

const BASE = process.env.BILLING_API_URL || '';
const JWT = process.env.BILLING_JWT || '';

function enabled() {
  return Boolean(BASE && JWT);
}

async function request(method, path, body) {
  if (!enabled()) return null;
  const url = path.startsWith('http') ? path : `${BASE.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT}`,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Billing API ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * List hotspot owners (billing "clients"). Returns [] if billing not configured.
 */
async function getHotspotOwners(page = 1, limit = 500) {
  if (!enabled()) return { data: [], total: 0 };
  try {
    const data = await request('GET', `/hotspot-owners?page=${page}&limit=${limit}`);
    return Array.isArray(data) ? { data, total: data.length } : { data: data.data || data.items || [], total: data.total ?? 0 };
  } catch (err) {
    console.warn('[billing] getHotspotOwners failed:', err.message);
    return { data: [], total: 0 };
  }
}

/**
 * Create a router in billing for the given hotspot owner. Returns created router { id, ... } or null.
 * RouterHub should store the returned id as billing_router_id.
 */
async function createRouterInBilling(ownerId, payload) {
  if (!enabled() || !ownerId) return null;
  try {
    const created = await request('POST', `/hotspot-owners/${ownerId}/routers`, payload);
    return created;
  } catch (err) {
    console.warn('[billing] createRouterInBilling failed:', err.message);
    return null;
  }
}

module.exports = {
  enabled,
  getHotspotOwners,
  createRouterInBilling,
};
