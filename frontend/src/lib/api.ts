const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err?.error || res.statusText || 'Request failed';
    if (res.status === 404 && msg.includes('fetch')) {
      throw new Error('Cannot reach API. Start backend with: cd backend && npm start');
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  auth: {
    login: (identifier: string, password: string) =>
      request<{ success: boolean; admin: { id: number; username: string } }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        }
      ),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    me: () =>
      request<{ loggedIn: boolean; admin?: { id: number; username: string } }>(
        '/auth/me'
      ),
  },
  routers: {
    list: (params?: { dashboard?: boolean }) =>
      request<Router[]>(`/routers${params?.dashboard ? '?dashboard=true' : ''}`),
    get: (id: number) => request<Router>(`/routers/${id}`),
    connectCommands: (id: number) =>
      request<ConnectCommands>(`/routers/${id}/connect-commands`),
    testTunnel: (id: number) =>
      request<TunnelStatus>(`/routers/${id}/test-tunnel`),
    add: (data: AddRouterData) =>
      request<{ success: boolean; router_id: number }>('/routers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addWithProgress: (data: AddRouterData) =>
      request<{ jobId: string }>(`/routers?sse=true`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    progressUrl: (jobId: string) => `${API_BASE}/routers/add-progress/${jobId}`,
    update: (id: number, data: Partial<AddRouterData>) =>
      request<{ success: boolean }>(`/routers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ success: boolean }>(`/routers/${id}`, { method: 'DELETE' }),
    stats: (id: number) => request<RouterStats>(`/routers/${id}/stats`),
    users: (id: number) => request<HotspotUser[]>(`/routers/${id}/users`),
    reboot: (id: number) =>
      request<{ success: boolean }>(`/routers/${id}/reboot`, {
        method: 'POST',
      }),
    mikhmonUrl: (id: number) =>
      request<{ url: string }>(`/routers/${id}/mikhmon-url`),
    reAddPeer: (id: number) =>
      request<{ success: boolean; message: string }>(`/routers/${id}/re-add-peer`, {
        method: 'POST',
      }),
    profiles: {
      list: (id: number) =>
        request<HotspotProfile[]>(`/routers/${id}/profiles`),
      sync: (id: number) =>
        request<{ synced: number; profiles: HotspotProfile[] }>(
          `/routers/${id}/profiles/sync`
        ),
      fixAll: (id: number) =>
        request<{ fixed: number }>(`/routers/${id}/profiles/fix-all`, {
          method: 'POST',
        }),
      create: (id: number, data: HotspotProfileInput) =>
        request<{ success: boolean; profile: HotspotProfile }>(
          `/routers/${id}/profiles`,
          { method: 'POST', body: JSON.stringify(data) }
        ),
      update: (id: number, profileId: number, data: Partial<HotspotProfileInput>) =>
        request<{ success: boolean }>(`/routers/${id}/profiles/${profileId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (id: number, profileId: number, force?: boolean) =>
        request<{ success: boolean } | { warning: boolean; message: string; count: number }>(
          `/routers/${id}/profiles/${profileId}${force ? '?force=true' : ''}`,
          { method: 'DELETE' }
        ),
    },
  },
  vouchers: {
    list: (routerId: number) =>
      request<Voucher[]>(`/vouchers/${routerId}`),
    pendingCount: (routerId: number) =>
      request<{ count: number }>(`/vouchers/pending/${routerId}`),
    generate: (data: {
      routerId: number;
      profile: string;
      count: number;
      prefix?: string;
      uptime_limit?: string;
    }) =>
      request<{ success: boolean; vouchers: Voucher[] }>('/vouchers/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    exportUrl: (routerId: number) =>
      `${API_BASE}/vouchers/export/${routerId}`,
    exportNewUrl: (routerId: number) =>
      `${API_BASE}/vouchers/export-new/${routerId}`,
  },
  wireguard: {
    status: () => request<WireGuardPeer[]>(`/wireguard/status`),
    get: (routerId: number) =>
      request<WireGuardPeer>(`/wireguard/${routerId}`),
    remove: (routerId: number) =>
      request<{ success: boolean }>(`/wireguard/${routerId}`, {
        method: 'DELETE',
      }),
  },
  reports: {
    revenue: () => request<RevenueSummary[]>(`/reports/revenue`),
    revenueById: (id: number) =>
      request<RevenueEntry[]>(`/reports/revenue/${id}`),
    vouchers: (id: number) =>
      request<{ total: number; exported: number; used: number }>(
        `/reports/vouchers/${id}`
      ),
  },
};

export interface Router {
  id: number;
  name: string;
  location: string | null;
  lan_ip: string;
  initial_ip?: string | null;
  api_port: number;
  wg_ip: string | null;
  status: 'online' | 'offline' | 'tunnel_failed';
  last_seen: string | null;
  created_at: string;
}

export interface AddRouterData {
  name: string;
  location?: string;
  lan_ip: string;
  api_port?: number;
  username: string;
  password: string;
  client_name?: string;
  monthly_price?: number;
  notes?: string;
  /** Skip MikroTik connection test (use when router not reachable from VPS; you'll run connect commands manually) */
  skipConnectionTest?: boolean;
}

export interface RouterStats {
  resources?: {
    'cpu-load'?: number;
    'total-memory'?: number;
    'free-memory'?: number;
    uptime?: string;
  };
  identity?: { name?: string };
  cached?: boolean;
}

export interface HotspotUser {
  user?: string;
  'uptime'?: string;
  'mac-address'?: string;
  address?: string;
  'session-time-left'?: string;
  [key: string]: unknown;
}

export interface Voucher {
  id: number;
  username: string;
  password: string;
  profile: string;
  uptime_limit: string | null;
  exported: number;
  used: number;
}

export interface WireGuardPeer {
  id: number;
  router_id: number;
  public_key: string;
  wg_ip: string;
  status: string;
  last_handshake?: string | null;
  bytes_sent?: number;
  bytes_received?: number;
  router_name?: string;
}

export interface RevenueSummary {
  id: number;
  name: string;
  location: string | null;
  total_revenue: string | null;
  transaction_count: number;
}

export interface RevenueEntry {
  id: number;
  amount: number;
  voucher_profile: string;
  quantity: number;
  date: string;
}

export interface ConnectCommands {
  router_id: number;
  router_name: string;
  location: string | null;
  wg_ip: string;
  tunnel_status: string;
  vps_ip?: string;
  wg_port?: string;
  commands: {
    step0?: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    step5: string;
    step6: string;
    step7?: string;
    all: string;
  };
}

export interface TunnelStatus {
  tunnel_up: boolean;
  last_handshake: string | null;
  minutes_ago: number | null;
  wg_ip: string;
  bytes_sent: number;
  bytes_received: number;
  mikhmon_added?: boolean;
}

export interface HotspotProfile {
  id: number;
  router_id: number;
  profile_name: string;
  display_name: string;
  validity: string;
  validity_seconds: number;
  price: number;
  shared_users: number;
  rate_limit: string | null;
  session_timeout: string | null;
  idle_timeout: string | null;
  currency: string;
  is_active: number;
}

export interface HotspotProfileInput {
  profile_name: string;
  display_name: string;
  validity: string;
  price: number;
  shared_users?: number;
  rate_limit?: string;
  session_timeout?: string;
  idle_timeout?: string;
}
