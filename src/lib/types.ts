export type Severity = 'info' | 'success' | 'warning' | 'critical';

export type AdminLiveEvent = {
  id: string;
  occurredAt: string;
  source: string;
  eventType: string;
  table?: string;
  userId?: string | null;
  title: string;
  description?: string;
  severity: Severity;
  status?: string | null;
  payload?: unknown;
};

export type SystemHealth = {
  generatedAt: string;
  status: 'ok' | 'warning' | 'critical';
  uptimeSeconds: number;
  dbLatencyMs: number | null;
  realtime: {
    status: string;
    subscribers: number;
    recentEvents: number;
  };
  envChecks: Array<{
    label: string;
    ok: boolean;
    detail: string;
  }>;
  clientApi: {
    url: string;
    ok: boolean;
    status: number | null;
    latencyMs: number | null;
    body: string;
    checkedAt: string;
  } | null;
  memory: {
    rssMb: number;
    heapUsedMb: number;
  };
};

export type AdminUserRow = {
  userId: string;
  email: string | null;
  fullName: string;
  companyName: string | null;
  phone: string | null;
  selectedPlan: string | null;
  billingCycle: string | null;
  billingStatus: string | null;
  trialEndsAt: string | null;
  onboardingCompleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  channels: Array<{ type: string; status: unknown }>;
  counts: {
    conversations: number;
    calls: number;
    emailCampaigns: number;
  };
  totalCredits: number;
  isBanned: boolean;
};

export type AdminOverview = {
  generatedAt: string;
  metrics: {
    totalUsers: number;
    workspaces: number;
    paidWorkspaces: number;
    trialWorkspaces: number;
    connectedChannels: number;
    conversations: number;
    messages24h: number;
    calls24h: number;
    activeCalls: number;
    leadWebhooks24h: number;
    emailCampaigns24h: number;
    totalCreditBalance: number;
  };
  planBreakdown: Record<string, number>;
  health: SystemHealth;
  timeline: AdminLiveEvent[];
  recentUsers: AdminUserRow[];
  warnings: string[];
};

export type OwnerNotificationPreferences = {
  liveEventSound: boolean;
  criticalWebhookAlerts: boolean;
  billingAlerts: boolean;
  serverAlerts: boolean;
  weeklyOpsDigest: boolean;
};

export type OwnerDashboardTheme = 'system' | 'light' | 'dark';
export type OwnerDashboardDensity = 'comfortable' | 'compact';

export type OwnerSettingsResponse = {
  profile: {
    adminUserId: string;
    email: string | null;
    loginEmail: string | null;
    fullName: string;
    phone: string;
    avatarUrl: string | null;
    organizationName: string;
    organizationWebsite: string;
    roleTitle: string;
    timezone: string;
    dashboardTheme: OwnerDashboardTheme;
    density: OwnerDashboardDensity;
    accentColor: string;
    notifications: OwnerNotificationPreferences;
    updatedAt: string | null;
  };
  security: {
    createdAt: string;
    updatedAt: string | null;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    phoneConfirmedAt: string | null;
    isBanned: boolean;
  };
  allowlist: {
    emails: number;
    userIds: number;
    currentAccountAllowedBy: 'email' | 'user_id' | 'development';
  };
  warning: string | null;
  generatedAt: string;
};

export type AdminUserDetail = {
  user: {
    userId: string;
    displayName: string;
    auth: Record<string, unknown> | null;
    profile: Record<string, unknown> | null;
    channels: {
      whatsapp: Record<string, unknown> | null;
      instagram: Record<string, unknown> | null;
      messenger: Record<string, unknown> | null;
    };
    conversations: Record<string, unknown>[];
    messages: Record<string, unknown>[];
    calls: Record<string, unknown>[];
    callSessions: Record<string, unknown>[];
    credits: Record<string, unknown>[];
    emailCampaigns: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
  };
  generatedAt: string;
};

export type PaymentsResponse = {
  summary: {
    profiles: number;
    activeSubscriptions: number;
    trialing: number;
    ledgerBalance: number;
    ledgerAdditions: number;
    ledgerDeductions: number;
  };
  billingBreakdown: Record<string, number>;
  planBreakdown: Record<string, number>;
  profiles: Record<string, unknown>[];
  creditLedger: Record<string, unknown>[];
  paymentEvents: Record<string, unknown>[];
  generatedAt: string;
};

export type WebhooksResponse = {
  summary: {
    leadConfigs: number;
    activeLeadConfigs: number;
    messengerWebhookErrors: number;
    events24h: number;
    failedEvents: number;
  };
  configs: {
    leadCapture: Record<string, unknown>[];
    messenger: Record<string, unknown>[];
  };
  webhookUrls: WebhookReference[];
  events: AdminLiveEvent[];
  generatedAt: string;
};

export type WebhookReference = {
  id: string;
  name: string;
  url: string | null;
  methods: string[];
  provider: string;
  purpose: string;
  verifyTokenEnv?: string;
  events: string[];
  status: 'configured' | 'needs_base_url' | 'external';
  notes?: string;
};

export type ServerResponse = {
  health: SystemHealth;
  tableCounts: Array<{ table: string; count: number }>;
  recentEvents: AdminLiveEvent[];
  generatedAt: string;
};

export type AuditResponse = {
  auditEvents: Record<string, unknown>[];
  liveEvents: AdminLiveEvent[];
  generatedAt: string;
  warning: string | null;
};
