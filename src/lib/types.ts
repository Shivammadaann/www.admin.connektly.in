export type Severity = 'info' | 'success' | 'warning' | 'critical';

export type AdminLiveEvent = {
  id: string;
  occurredAt: string;
  source: string;
  eventType: string;
  table?: string;
  webhookId?: string;
  webhookIds?: string[];
  userId?: string | null;
  title: string;
  description?: string;
  severity: Severity;
  status?: string | null;
  payload?: unknown;
};

export type ClientFeatureKey =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'meta_ads'
  | 'meta_lead_capture'
  | 'whatsapp_payments'
  | 'woocommerce'
  | 'email'
  | 'email_templates'
  | 'whatsapp_flows'
  | 'automations'
  | 'developer_tools'
  | 'workspace_team'
  | 'notifications';

export type ClientFeatureMetric = {
  label: string;
  value: string | number;
};

export type ClientFeatureSummary = {
  key: ClientFeatureKey;
  label: string;
  category: string;
  description: string;
  route: string;
  status: string;
  severity: Severity;
  metrics: ClientFeatureMetric[];
  risks: string[];
};

export type ClientFeatureRecord = {
  id: string;
  featureKey: ClientFeatureKey;
  featureLabel: string;
  category: string;
  userId: string;
  organizationName: string;
  ownerName: string;
  ownerEmail: string | null;
  status: string;
  severity: Severity;
  detail: string;
  route: string;
  updatedAt: string | null;
  metrics: ClientFeatureMetric[];
  risks: string[];
  canUpdateStatus: boolean;
  allowedStatuses: string[];
  raw: unknown;
};

export type ClientFeatureOperationsResponse = {
  generatedAt: string;
  summary: {
    workspaces: number;
    featureFamilies: number;
    configuredRecords: number;
    attentionRecords: number;
    controllableRecords: number;
  };
  features: ClientFeatureSummary[];
  records: ClientFeatureRecord[];
  recentActivity: AdminLiveEvent[];
  warnings: string[];
};

export type WebsiteBlogPost = {
  id: string;
  title: string;
  author: string;
  excerpt: string;
  content: string;
  coverImage: string;
  date: string;
  updatedAt?: string | null;
};

export type WebsiteHelpArticle = {
  id: string;
  title: string;
  author: string;
  category: string;
  excerpt: string;
  content: string;
  date: string;
  updatedAt?: string | null;
};

export type WebsiteContentResponse = {
  generatedAt: string;
  publicBaseUrl: string;
  summary: {
    blogs: number;
    helpArticles: number;
    helpCategories: number;
    mediaRootConfigured: boolean;
  };
  categories: string[];
  blogs: WebsiteBlogPost[];
  helpArticles: WebsiteHelpArticle[];
  warnings: string[];
};

export type WebsiteLeadSubmissionType = 'booked_demo' | 'lead_inquiry';

export type WebsiteLeadSubmission = {
  id: string;
  type: WebsiteLeadSubmissionType;
  submittedAt: string;
  sourcePath: string;
  sourceUrl: string;
  pageTitle: string;
  formId: string;
  userAgent: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  topic: string;
  message: string;
  fields: Record<string, string | string[]>;
};

export type WebsiteLeadFormsResponse = {
  generatedAt: string;
  publicBaseUrl: string;
  summary: {
    total: number;
    bookedDemos: number;
    leadInquiries: number;
    lastSubmissionAt: string | null;
  };
  bookedDemos: WebsiteLeadSubmission[];
  leadInquiries: WebsiteLeadSubmission[];
  submissions: WebsiteLeadSubmission[];
  warnings: string[];
};

export type WebsiteMediaUploadResponse = {
  location: string;
  publicUrl: string | null;
  contentType: string;
  size: number;
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

export type AdminUserActivityNotification = {
  id: string;
  type: 'signup' | 'onboarding' | 'trial_expired' | 'payment';
  title: string;
  occurredAt: string;
  severity: Severity;
  status: string;
  description: string;
  user: {
    userId: string | null;
    fullName: string;
    email: string | null;
    companyName: string | null;
    phone: string | null;
    selectedPlan: string | null;
    billingCycle: string | null;
    billingStatus: string | null;
    trialEndsAt: string | null;
    onboardingCompleted: boolean;
  };
  metadata: {
    amount?: number;
    currency?: string;
    reference?: string | null;
    channels?: number;
    lastSignInAt?: string | null;
    trialEndsAt?: string | null;
    completedAt?: string | null;
  };
};

export type AdminOverview = {
  generatedAt: string;
  metrics: {
    totalUsers: number;
    totalOrganizations: number;
    activeOrganizations: number;
    workspaces: number;
    paidWorkspaces: number;
    trialWorkspaces: number;
    connectedChannels: number;
    conversations: number;
    messagesSent: number;
    messages24h: number;
    calls24h: number;
    activeCalls: number;
    leadWebhooks24h: number;
    emailCampaigns24h: number;
    monthlyRecurringRevenue: number;
    churnRate: number;
    totalCreditBalance: number;
  };
  charts: {
    revenueGrowth: Array<{ label: string; value: number }>;
    customerMovement: Array<{ label: string; newCustomers: number; churnedCustomers: number }>;
    messageVolume: Array<{ label: string; value: number }>;
    channelUsage: Array<{ label: string; value: number }>;
  };
  alerts: Array<{
    key: string;
    label: string;
    value: number;
    suffix?: string;
    severity: Severity;
    detail: string;
  }>;
  planBreakdown: Record<string, number>;
  health: SystemHealth;
  timeline: AdminLiveEvent[];
  userActivity: AdminUserActivityNotification[];
  recentUsers: AdminUserRow[];
  warnings: string[];
};

export type AdminLogEntry = {
  id: string;
  occurredAt: string;
  orgId: string | null;
  userId: string | null;
  category: 'api' | 'error' | 'webhook' | 'message_delivery';
  source: string;
  title: string;
  status: string;
  errorType: string | null;
  severity: Severity;
  detail: string | null;
  payload: unknown;
  isMetaApi?: boolean;
  apiProvider?: string | null;
  apiEndpoint?: string | null;
  apiMethod?: string | null;
  metaFeatureName?: string | null;
  metaPermissionName?: string | null;
};

export type LogsMonitoringResponse = {
  generatedAt: string;
  apiLogs: AdminLogEntry[];
  errorLogs: AdminLogEntry[];
  webhookLogs: AdminLogEntry[];
  messageDeliveryLogs: AdminLogEntry[];
  errorTypes: string[];
};

export type GlobalIntegration = {
  key: string;
  label: string;
  status: string;
  severity: Severity;
  summary: string;
  lastCheckedAt: string;
  metrics: Array<{ label: string; value: number }>;
};

export type GlobalIntegrationsResponse = {
  generatedAt: string;
  integrations: GlobalIntegration[];
  clientApi: Record<string, unknown> | null;
};

export type AdminOrganizationRow = {
  orgId: string;
  orgName: string;
  companyName: string | null;
  companyWebsite: string | null;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  plan: string;
  billingCycle: string | null;
  userCount: number;
  status: string;
  revenue: number;
  createdAt: string | null;
  updatedAt: string | null;
  isBanned: boolean;
  channels: Array<{ type: string; status: unknown }>;
  whatsapp: AdminWhatsAppChannel | null;
  usage: {
    conversations: number;
    messages: number;
    calls: number;
    emailCampaigns: number;
    webhookEvents: number;
    apiUsage: number;
    creditBalance: number;
  };
  riskFlags: string[];
};

export type AdminWhatsAppChannel = {
  id: string;
  userId: string;
  setupType: string | null;
  connectionMethod: string | null;
  status: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  accessTokenLast4: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  updatedAt: string | null;
  webhookSubscription: {
    isSubscribed: boolean;
    callbackUrl: string | null;
    subscribedAt: string | null;
    unsubscribedAt: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
    entries: unknown[];
  };
  twoStepVerification: {
    isEnabled: boolean;
    enabledAt: string | null;
    disabledAt: string | null;
    lastPinUpdatedAt: string | null;
    liveStatusCheckedAt: string | null;
    codeVerificationStatus: string | null;
  };
  verificationCodeRequest: {
    lastRequestedAt: string | null;
    lastVerifiedAt: string | null;
    codeMethod: string | null;
    language: string | null;
    verifiedPhoneNumberId: string | null;
  };
  senderRegistration: {
    registeredAt: string | null;
    deregisteredAt: string | null;
  };
  displayName: {
    requestedName: string | null;
    requestedAt: string | null;
    status: string | null;
    approvedAt: string | null;
    lastCheckedAt: string | null;
  };
  metadata: Record<string, unknown>;
};

export type AdminOrganizationsResponse = {
  organizations: AdminOrganizationRow[];
  summary: {
    total: number;
    active: number;
    suspended: number;
    revenue: number;
    risk: number;
  };
  generatedAt: string;
};

export type AdminOrganizationDetail = {
  organization: AdminOrganizationRow;
  members: AdminUserRow[];
  usageStats: {
    conversations: number;
    messages: number;
    callLogs: number;
    callSessions: number;
    emailCampaigns: number;
    webhookEvents: number;
    apiUsage: number;
  };
  billingHistory: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    status: string;
    createdAt: string | null;
    reference: string | null;
  }>;
  recentEvents: AdminLiveEvent[];
  generatedAt: string;
};

export type PlatformPricingPlan = {
  id: string;
  name: string;
  currency: string;
  monthlyPrice: number;
  annualPrice: number;
  credits: number;
  features: string[];
  isActive: boolean;
  isRecommended: boolean;
};

export type PlatformFeatureFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type PlatformOrgFeatureOverride = {
  orgId: string;
  orgName: string;
  flags: Record<string, boolean>;
};

export type PlatformRateLimitOverride = {
  orgId: string;
  orgName: string;
  messagesPerMinute: number;
  apiRequestsPerMinute: number;
};

export type PlatformApiKey = {
  id: string;
  name: string;
  scope: string;
  key: string;
  maskedKey: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastRotatedAt: string | null;
};

export type PlatformEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: string | null;
};

export type UserPlatformSettings = {
  pricing_plans: {
    plans: PlatformPricingPlan[];
  };
  feature_flags: {
    flags: PlatformFeatureFlag[];
    orgOverrides: PlatformOrgFeatureOverride[];
  };
  rate_limits: {
    default: {
      messagesPerMinute: number;
      apiRequestsPerMinute: number;
    };
    orgOverrides: PlatformRateLimitOverride[];
  };
  api_keys: {
    keys: PlatformApiKey[];
  };
  email_templates: {
    templates: PlatformEmailTemplate[];
  };
};

export type UserPlatformSettingsResponse = {
  settings: UserPlatformSettings;
  warning: string | null;
  generatedAt: string;
};

export type PlanManagementResponse = {
  plans: PlatformPricingPlan[];
  warning: string | null;
  generatedAt: string;
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
export type AdminPermissionKey =
  | 'command_center'
  | 'organizations'
  | 'global_users'
  | 'plan_management'
  | 'platform_settings'
  | 'payments'
  | 'logs_monitoring'
  | 'global_integrations'
  | 'website_management'
  | 'webhooks'
  | 'server_status'
  | 'security_audit';

export type AdminPermissionDefinition = {
  key: AdminPermissionKey;
  label: string;
  description: string;
};

export type DashboardAdminUser = {
  id: string;
  authUserId: string | null;
  email: string;
  fullName: string;
  roleTitle: string;
  role: 'primary_owner' | 'admin';
  status: 'active' | 'invited' | 'disabled';
  permissions: AdminPermissionKey[];
  isPrimaryOwner: boolean;
  invitedBy: string | null;
  invitedAt: string | null;
  lastAccessAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  authCreatedAt: string | null;
  lastSignInAt: string | null;
};

export type DashboardAdminUsersResponse = {
  admins: DashboardAdminUser[];
  permissions: AdminPermissionDefinition[];
  primaryOwnerEmail: string;
  warning: string | null;
  generatedAt: string;
};

export type AdminAccessSummary = {
  role: 'primary_owner' | 'admin';
  status: 'active' | 'invited' | 'disabled';
  permissions: AdminPermissionKey[];
  isPrimaryOwner: boolean;
  canManageAdmins: boolean;
  primaryOwnerEmail: string;
};

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
    currentAccountAllowedBy: 'primary_owner' | 'database' | 'legacy_env' | 'development';
  };
  access: AdminAccessSummary;
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
    loginActivity?: AdminLoginActivityEntry[];
  };
  generatedAt: string;
};

export type AdminLoginActivityEntry = {
  id: string;
  occurredAt: string;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  rawPayload: unknown;
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
    activeWebhookUrls: number;
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

export type WebhookTokenPreview = {
  source: string;
  scope: 'environment' | 'workspace' | 'endpoint' | 'external';
  hasToken: boolean;
  maskedValue: string | null;
  count: number;
};

export type WebhookTokenValue = {
  id: string;
  label: string;
  value: string;
  maskedValue: string;
  source: string;
  userId: string | null;
  updatedAt: string | null;
};

export type WebhookTokenRevealResponse = {
  webhookId: string;
  tokens: WebhookTokenValue[];
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
  token: WebhookTokenPreview;
  events: string[];
  status: 'configured' | 'needs_base_url' | 'external';
  notes?: string;
  eventCount: number;
  successCount: number;
  failureCount: number;
  lastEventAt: string | null;
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
