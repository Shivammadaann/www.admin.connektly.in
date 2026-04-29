import { clientConfig } from './config';
import { getCachedSession } from './supabase';
import type {
  AdminOverview,
  AdminOrganizationDetail,
  AdminOrganizationsResponse,
  AdminUserDetail,
  AdminUserRow,
  AuditResponse,
  DashboardAdminUsersResponse,
  GlobalIntegrationsResponse,
  LogsMonitoringResponse,
  PaymentsResponse,
  OwnerSettingsResponse,
  ServerResponse,
  UserPlatformSettings,
  UserPlatformSettingsResponse,
  WebhooksResponse,
  AdminLiveEvent,
} from './types';

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getCachedSession();
  const token = session?.access_token;

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }

  const response = await fetch(`${clientConfig.adminApiBaseUrl}${path}`, {
    ...init,
    headers: requestHeaders,
  });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      throw new AdminApiError(payload.error || fallback, response.status);
    } catch (error) {
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw new AdminApiError(fallback, response.status);
    }
  }

  return response.json() as Promise<T>;
}

export const adminApi = {
  me() {
    return request<{ admin: { id: string; email: string | null; access: OwnerSettingsResponse['access'] } }>('/me');
  },
  getOverview() {
    return request<AdminOverview>('/bootstrap', { cache: 'no-store' });
  },
  getLogsMonitoring() {
    return request<LogsMonitoringResponse>('/logs', { cache: 'no-store' });
  },
  getGlobalIntegrations() {
    return request<GlobalIntegrationsResponse>('/integrations', { cache: 'no-store' });
  },
  getOwnerSettings() {
    return request<OwnerSettingsResponse>('/settings', { cache: 'no-store' });
  },
  updateOwnerProfile(payload: Partial<OwnerSettingsResponse['profile']>) {
    return request<OwnerSettingsResponse>('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  updateOwnerProfilePhoto(payload: { dataUrl: string }) {
    return request<OwnerSettingsResponse>('/settings/profile-photo', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateOwnerAccount(payload: { loginEmail?: string; newPassword?: string }) {
    return request<OwnerSettingsResponse>('/settings/account', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  getDashboardAdmins() {
    return request<DashboardAdminUsersResponse>('/admin-users', { cache: 'no-store' });
  },
  inviteDashboardAdmin(payload: { email: string; fullName?: string; roleTitle?: string; permissions: string[] }) {
    return request<DashboardAdminUsersResponse>('/admin-users/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateDashboardAdmin(
    adminId: string,
    payload: { fullName?: string; roleTitle?: string; status?: 'active' | 'invited' | 'disabled'; permissions?: string[] },
  ) {
    return request<DashboardAdminUsersResponse>(`/admin-users/${encodeURIComponent(adminId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  removeDashboardAdmin(adminId: string) {
    return request<DashboardAdminUsersResponse>(`/admin-users/${encodeURIComponent(adminId)}`, {
      method: 'DELETE',
    });
  },
  getPlatformSettings() {
    return request<UserPlatformSettingsResponse>('/platform-settings', { cache: 'no-store' });
  },
  updatePlatformSettingsSection<K extends keyof UserPlatformSettings>(section: K, payload: UserPlatformSettings[K]) {
    return request<UserPlatformSettingsResponse>(`/platform-settings/${String(section)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  getOrganizations(params?: { q?: string; status?: string; plan?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.plan && params.plan !== 'all') query.set('plan', params.plan);
    const suffix = query.size ? `?${query.toString()}` : '';
    return request<AdminOrganizationsResponse>(`/organizations${suffix}`, { cache: 'no-store' });
  },
  getOrganization(orgId: string) {
    return request<AdminOrganizationDetail>(`/organizations/${encodeURIComponent(orgId)}`, { cache: 'no-store' });
  },
  runOrganizationAction(
    orgId: string,
    payload: {
      action: 'suspend' | 'activate' | 'delete' | 'ban' | 'unban' | 'update_plan' | 'impersonate';
      selectedPlan?: string;
      billingCycle?: string;
      billingStatus?: string;
      duration?: string;
    },
  ) {
    return request<{ detail: AdminOrganizationDetail | null; impersonation: { email: string; actionLink: string | null } | null }>(
      `/organizations/${encodeURIComponent(orgId)}/action`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  getUsers(params?: { q?: string; status?: string; orgId?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.orgId && params.orgId !== 'all') query.set('orgId', params.orgId);
    const suffix = query.size ? `?${query.toString()}` : '';
    return request<{ users: AdminUserRow[]; generatedAt: string }>(`/users${suffix}`, {
      cache: 'no-store',
    });
  },
  getUser(userId: string) {
    return request<AdminUserDetail>(`/users/${encodeURIComponent(userId)}`, { cache: 'no-store' });
  },
  updateUserProfile(userId: string, payload: Record<string, unknown>) {
    return request<{ profile: Record<string, unknown> }>(`/users/${encodeURIComponent(userId)}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  adjustCredits(userId: string, payload: { amount: number; type: 'addition' | 'deduction'; description: string; notifyUser?: boolean }) {
    return request<{ ledgerEntry: Record<string, unknown> }>(`/users/${encodeURIComponent(userId)}/credits`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  sendNotice(userId: string, payload: { title: string; body: string; targetPath?: string }) {
    return request<{ notification: Record<string, unknown> }>(`/users/${encodeURIComponent(userId)}/notice`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  setUserAuth(userId: string, payload: { action: 'ban' | 'unban'; duration?: string }) {
    return request<{ user: Record<string, unknown> }>(`/users/${encodeURIComponent(userId)}/auth`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getPayments() {
    return request<PaymentsResponse>('/payments', { cache: 'no-store' });
  },
  getWebhooks() {
    return request<WebhooksResponse>('/webhooks', { cache: 'no-store' });
  },
  getServer() {
    return request<ServerResponse>('/server', { cache: 'no-store' });
  },
  getAudit() {
    return request<AuditResponse>('/audit', { cache: 'no-store' });
  },
  async streamLiveEvents(
    onEvent: (event: AdminLiveEvent) => void,
    onStatus: (status: string) => void,
    signal?: AbortSignal,
  ) {
    const headers = await getAuthHeaders();
    const requestHeaders = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      requestHeaders.set(key, value);
    }

    const response = await fetch(`${clientConfig.adminApiBaseUrl}/live`, {
      headers: requestHeaders,
      signal,
    });

    if (!response.ok || !response.body) {
      throw new AdminApiError(`Live stream failed with status ${response.status}`, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    onStatus('connected');

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const eventLine = frame.split('\n').find((line) => line.startsWith('event:'));
        const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;

        const eventName = eventLine?.replace('event:', '').trim();
        if (eventName === 'heartbeat') {
          onStatus('connected');
          continue;
        }

        try {
          const payload = JSON.parse(dataLine.replace('data:', '').trim()) as AdminLiveEvent;
          onEvent(payload);
        } catch {
          // Ignore malformed event frames.
        }
      }
    }
  },
};
