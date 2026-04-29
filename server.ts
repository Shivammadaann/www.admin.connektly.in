import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient, type User } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

type JsonRecord = Record<string, unknown>;

type AdminContext = {
  id: string;
  email: string | null;
  user: User;
};

type AdminRequest = Request & {
  admin?: AdminContext;
};

type LivePayload = {
  id: string;
  occurredAt: string;
  source: string;
  eventType: string;
  table?: string;
  userId?: string | null;
  title: string;
  description?: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  status?: string | null;
  payload?: unknown;
};

const app = express();
const port = Number(process.env.PORT || 8787);
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientApiBaseUrl = process.env.CLIENT_API_BASE_URL || '';
const allowedEmails = new Set(
  (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const allowedUserIds = new Set(
  (process.env.ADMIN_ALLOWED_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const ownerProfileBucket = process.env.OWNER_PROFILE_BUCKET || 'owner-admin-profile-pictures';

const hasRequiredServerConfig = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
const anonSupabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key');
const adminSupabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseServiceRoleKey || 'placeholder-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const liveClients = new Map<string, Response>();
let realtimeStatus = 'not-started';
let realtimeStarted = false;
let recentLiveEvents: LivePayload[] = [];

app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

function isRecent(value: unknown, hours: number) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function formatTableName(table: string) {
  return table
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function sendError(res: Response, status: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unexpected error');
  res.status(status).json({ error: message });
}

function ensureServerConfig() {
  if (!hasRequiredServerConfig) {
    throw new Error('Admin API is missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.');
  }
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    ensureServerConfig();

    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer token.' });
      return;
    }

    const { data, error } = await anonSupabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid Supabase session.' });
      return;
    }

    const email = data.user.email?.toLowerCase() || null;
    const allowed =
      allowedUserIds.has(data.user.id) ||
      (email ? allowedEmails.has(email) : false) ||
      (process.env.NODE_ENV !== 'production' && allowedEmails.size === 0 && allowedUserIds.size === 0);

    if (!allowed) {
      res.status(403).json({
        error:
          'This account is not allowed to use the Admin Control Centre. Add its email to ADMIN_ALLOWED_EMAILS or its ID to ADMIN_ALLOWED_USER_IDS.',
      });
      return;
    }

    req.admin = {
      id: data.user.id,
      email,
      user: data.user,
    };

    next();
  } catch (error) {
    sendError(res, 503, error);
  }
}

async function safeSelect(
  table: string,
  select = '*',
  build?: (query: any) => any,
) {
  try {
    let query: any = adminSupabase.from(table).select(select);
    if (build) {
      query = build(query) as typeof query;
    }
    const { data, error } = await query;
    if (error) {
      return { rows: [] as JsonRecord[], error: error.message };
    }
    return { rows: asRows(data), error: null };
  } catch (error) {
    return { rows: [] as JsonRecord[], error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeCount(table: string, build?: (query: any) => any) {
  try {
    let query = adminSupabase.from(table).select('*', { count: 'exact', head: true });
    if (build) {
      query = build(query);
    }
    const { count, error } = await query;
    if (error) {
      return 0;
    }
    return count || 0;
  } catch {
    return 0;
  }
}

async function listAuthUsers() {
  const users: User[] = [];
  let page = 1;
  const perPage = 1000;

  while (page < 20) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    users.push(...data.users);
    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return users;
}

async function getAuthUserById(userId: string) {
  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error) {
    return null;
  }
  return data.user;
}

function userDisplayName(profile: JsonRecord | undefined, authUser?: User | null) {
  return (
    normalizeString(profile?.full_name) ||
    normalizeString(authUser?.user_metadata?.full_name) ||
    normalizeString(authUser?.user_metadata?.name) ||
    normalizeString(profile?.company_name) ||
    normalizeString(authUser?.email) ||
    'Unknown user'
  );
}

const defaultOwnerNotifications = {
  liveEventSound: false,
  criticalWebhookAlerts: true,
  billingAlerts: true,
  serverAlerts: true,
  weeklyOpsDigest: false,
};

function normalizeOwnerNotifications(value: unknown) {
  const incoming = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaultOwnerNotifications).map(([key, fallback]) => [key, typeof incoming[key] === 'boolean' ? incoming[key] : fallback]),
  ) as typeof defaultOwnerNotifications;
}

function normalizeTheme(value: unknown) {
  return ['system', 'light', 'dark'].includes(String(value)) ? String(value) : 'system';
}

function normalizeDensity(value: unknown) {
  return ['comfortable', 'compact'].includes(String(value)) ? String(value) : 'comfortable';
}

function normalizeAccentColor(value: unknown) {
  const color = normalizeString(value);
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#5b45ff';
}

function isMissingRelationError(error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = normalizeString(record.code);
  const message = String(error instanceof Error ? error.message : record.message || error || '').toLowerCase();
  return code === '42P01' || message.includes('could not find the table') || message.includes('does not exist');
}

async function getOwnerProfileRow(adminUserId: string) {
  const { data, error } = await adminSupabase
    .from('owner_admin_profiles')
    .select('*')
    .eq('admin_user_id', adminUserId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        row: null,
        warning: 'Apply supabase/admin_dashboard.sql to persist owner profile settings.',
      };
    }
    throw error;
  }

  return { row: isRecord(data) ? data : null, warning: null };
}

async function upsertOwnerProfile(admin: AdminContext, updates: JsonRecord) {
  const payload = {
    admin_user_id: admin.id,
    email: admin.email,
    ...updates,
    updated_at: nowIso(),
  };

  const { data, error } = await adminSupabase
    .from('owner_admin_profiles')
    .upsert(payload, { onConflict: 'admin_user_id' })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        row: payload,
        warning: 'Apply supabase/admin_dashboard.sql to persist owner profile settings.',
      };
    }
    throw error;
  }

  return { row: isRecord(data) ? data : payload, warning: null };
}

async function updateAdminUserMetadata(admin: AdminContext, updates: JsonRecord) {
  const current = isRecord(admin.user.user_metadata) ? admin.user.user_metadata : {};
  const metadata: JsonRecord = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  const { data, error } = await adminSupabase.auth.admin.updateUserById(admin.id, {
    user_metadata: metadata,
  });

  if (error) {
    throw error;
  }

  return data.user || { ...admin.user, user_metadata: metadata };
}

function buildOwnerSettings(admin: AdminContext, profile: JsonRecord | null, warning: string | null, authUser = admin.user) {
  const metadata = isRecord(authUser.user_metadata) ? authUser.user_metadata : {};
  const fullName =
    normalizeString(profile?.full_name) ||
    normalizeString(metadata.full_name) ||
    normalizeString(metadata.name) ||
    normalizeString(admin.email?.split('@')[0]) ||
    'Owner';
  const organizationName =
    normalizeString(profile?.organization_name) ||
    normalizeString(metadata.organization_name) ||
    normalizeString(metadata.company_name) ||
    'Connektly';

  return {
    profile: {
      adminUserId: admin.id,
      email: normalizeString(profile?.email) || admin.email,
      loginEmail: admin.email,
      fullName,
      phone: normalizeString(profile?.phone) || normalizeString(metadata.phone) || '',
      avatarUrl:
        normalizeString(profile?.avatar_url) ||
        normalizeString(metadata.avatar_url) ||
        normalizeString(metadata.picture) ||
        null,
      organizationName,
      organizationWebsite: normalizeString(profile?.organization_website) || normalizeString(metadata.organization_website) || '',
      roleTitle: normalizeString(profile?.role_title) || normalizeString(metadata.role_title) || 'Owner',
      timezone: normalizeString(profile?.timezone) || 'Asia/Kolkata',
      dashboardTheme: normalizeTheme(profile?.dashboard_theme),
      density: normalizeDensity(profile?.density),
      accentColor: normalizeAccentColor(profile?.accent_color),
      notifications: normalizeOwnerNotifications(profile?.notifications),
      updatedAt: normalizeString(profile?.updated_at) || authUser.updated_at || null,
    },
    security: {
      createdAt: authUser.created_at,
      updatedAt: authUser.updated_at,
      lastSignInAt: authUser.last_sign_in_at || null,
      emailConfirmedAt: authUser.email_confirmed_at || null,
      phoneConfirmedAt: authUser.phone_confirmed_at || null,
      isBanned: Boolean(authUser.banned_until && Date.parse(authUser.banned_until) > Date.now()),
    },
    allowlist: {
      emails: allowedEmails.size,
      userIds: allowedUserIds.size,
      currentAccountAllowedBy: allowedUserIds.has(admin.id) ? 'user_id' : admin.email && allowedEmails.has(admin.email) ? 'email' : 'development',
    },
    warning,
    generatedAt: nowIso(),
  };
}

function parseProfilePhotoData(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') {
    throw new Error('Photo payload is required.');
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('Upload a PNG, JPEG, or WEBP image.');
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new Error('Photo payload is empty.');
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Photo must be 5 MB or smaller.');
  }

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, mimeType, extension };
}

async function ensureOwnerProfileBucket() {
  const { error } = await adminSupabase.storage.createBucket(ownerProfileBucket, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (!message.includes('already') && !message.includes('exists')) {
      throw error;
    }
  }
}

function buildUserRows(args: {
  authUsers: User[];
  profiles: JsonRecord[];
  metaChannels: JsonRecord[];
  instagramChannels: JsonRecord[];
  messengerChannels: JsonRecord[];
  threads: JsonRecord[];
  calls: JsonRecord[];
  emailCampaigns: JsonRecord[];
  creditLedger: JsonRecord[];
}) {
  const authById = new Map(args.authUsers.map((user) => [user.id, user]));
  const profileById = new Map(args.profiles.map((profile) => [String(profile.user_id), profile]));
  const allIds = new Set<string>([
    ...args.authUsers.map((user) => user.id),
    ...args.profiles.map((profile) => String(profile.user_id)),
  ]);

  return [...allIds].map((userId) => {
    const authUser = authById.get(userId);
    const profile = profileById.get(userId);
    const channels = [
      ...args.metaChannels.filter((row) => row.user_id === userId).map((row) => ({ type: 'WhatsApp', status: row.status || 'connected' })),
      ...args.instagramChannels.filter((row) => row.user_id === userId).map((row) => ({ type: 'Instagram', status: row.status || 'connected' })),
      ...args.messengerChannels.filter((row) => row.user_id === userId).map((row) => ({ type: 'Messenger', status: row.status || 'connected' })),
    ];
    const credits = args.creditLedger
      .filter((row) => row.user_id === userId)
      .reduce((total, row) => {
        const amount = normalizeNumber(row.amount);
        return row.type === 'deduction' ? total - amount : total + amount;
      }, 0);

    return {
      userId,
      email: normalizeString(profile?.email) || authUser?.email || null,
      fullName: userDisplayName(profile, authUser),
      companyName: normalizeString(profile?.company_name),
      phone: [profile?.country_code, profile?.phone].filter(Boolean).join(' ') || null,
      selectedPlan: normalizeString(profile?.selected_plan),
      billingCycle: normalizeString(profile?.billing_cycle),
      billingStatus: normalizeString(profile?.billing_status),
      trialEndsAt: normalizeString(profile?.trial_ends_at),
      onboardingCompleted: Boolean(profile?.onboarding_completed),
      createdAt: normalizeString(profile?.created_at) || authUser?.created_at || null,
      updatedAt: normalizeString(profile?.updated_at) || authUser?.updated_at || null,
      lastSignInAt: authUser?.last_sign_in_at || null,
      channels,
      counts: {
        conversations: args.threads.filter((row) => row.user_id === userId).length,
        calls: args.calls.filter((row) => row.user_id === userId).length,
        emailCampaigns: args.emailCampaigns.filter((row) => row.user_id === userId).length,
      },
      totalCredits: Math.round(credits * 100) / 100,
      isBanned: Boolean(authUser?.banned_until && Date.parse(authUser.banned_until) > Date.now()),
    };
  });
}

function rowOwnerUserId(row: JsonRecord) {
  return (
    normalizeString(row.user_id) ||
    normalizeString(row.workspace_owner_user_id) ||
    normalizeString(row.owner_user_id)
  );
}

function normalizePlanRank(plan: unknown) {
  const value = String(plan || '').toLowerCase();
  const rank = ['free', 'starter', 'growth', 'scale', 'enterprise'];
  const index = rank.indexOf(value);
  return index === -1 ? 0 : index;
}

function normalizePaymentAmount(row: JsonRecord) {
  const amountKeys = ['amount_paid', 'amount_total', 'total_amount', 'amount', 'price'];
  for (const key of amountKeys) {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === '') continue;

    const numeric = normalizeNumber(raw);
    if (!numeric) continue;

    const looksLikeMinorUnit = key.includes('amount') && numeric >= 1000;
    return looksLikeMinorUnit ? numeric / 100 : numeric;
  }

  return 0;
}

function organizationNameForUser(user: ReturnType<typeof buildUserRows>[number]) {
  return user.companyName || user.fullName || user.email || `Organization ${user.userId.slice(0, 8)}`;
}

function buildOrganizationRows(core: Awaited<ReturnType<typeof loadCoreData>>, authUsers: User[]) {
  const users = buildUserRows({
    authUsers,
    profiles: core.profiles,
    metaChannels: core.metaChannels,
    instagramChannels: core.instagramChannels,
    messengerChannels: core.messengerChannels,
    threads: core.threads,
    calls: core.callLogs,
    emailCampaigns: core.emailCampaigns,
    creditLedger: core.creditLedger,
  });

  return users.map((user) => {
    const ownerUserId = user.userId;
    const ownerMatches = (row: JsonRecord) => rowOwnerUserId(row) === ownerUserId;
    const messages = core.messages.filter(ownerMatches);
    const threads = core.threads.filter(ownerMatches);
    const callLogs = core.callLogs.filter(ownerMatches);
    const callSessions = core.callSessions.filter(ownerMatches);
    const emailCampaigns = core.emailCampaigns.filter(ownerMatches);
    const leadEvents = core.leadEvents.filter(ownerMatches);
    const paymentEvents = core.paymentEvents.filter(ownerMatches);
    const creditLedger = core.creditLedger.filter(ownerMatches);
    const billingStatus = String(user.billingStatus || '').toLowerCase();
    const plan = user.selectedPlan || 'none';
    const revenue = paymentEvents.reduce((total, row) => total + normalizePaymentAmount(row), 0);
    const unpaidHighUsage =
      ['free', 'trialing', 'none', ''].includes(String(plan).toLowerCase()) &&
      (messages.length > 500 || threads.length > 100 || callLogs.length > 100 || emailCampaigns.length > 50);
    const failedWebhooks = leadEvents.filter((row) => /fail|error/i.test(String(row.status || row.delivery_status || ''))).length;
    const riskFlags = [
      user.isBanned ? 'Owner banned' : null,
      ['past_due', 'suspended', 'cancelled', 'deleted'].includes(billingStatus) ? 'Billing/action restricted' : null,
      unpaidHighUsage ? 'High usage on unpaid plan' : null,
      failedWebhooks > 5 ? 'Webhook failures' : null,
    ].filter(Boolean) as string[];

    return {
      orgId: ownerUserId,
      orgName: organizationNameForUser(user),
      ownerUserId,
      ownerName: user.fullName,
      ownerEmail: user.email,
      plan,
      billingCycle: user.billingCycle || null,
      userCount: 1,
      status: user.isBanned ? 'banned' : user.billingStatus || (user.onboardingCompleted ? 'active' : 'setup'),
      revenue: Math.round(revenue * 100) / 100,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isBanned: user.isBanned,
      channels: user.channels,
      usage: {
        conversations: threads.length,
        messages: messages.length,
        calls: callLogs.length + callSessions.length,
        emailCampaigns: emailCampaigns.length,
        webhookEvents: leadEvents.length + paymentEvents.length,
        apiUsage: messages.length + callSessions.length + leadEvents.length + paymentEvents.length,
        creditBalance: user.totalCredits,
      },
      riskFlags,
    };
  });
}

function buildOrganizationDetail(core: Awaited<ReturnType<typeof loadCoreData>>, authUsers: User[], orgId: string) {
  const organizations = buildOrganizationRows(core, authUsers);
  const organization = organizations.find((item) => item.orgId === orgId);
  if (!organization) {
    return null;
  }

  const ownerMatches = (row: JsonRecord) => rowOwnerUserId(row) === orgId;
  const users = buildUserRows({
    authUsers,
    profiles: core.profiles,
    metaChannels: core.metaChannels,
    instagramChannels: core.instagramChannels,
    messengerChannels: core.messengerChannels,
    threads: core.threads,
    calls: core.callLogs,
    emailCampaigns: core.emailCampaigns,
    creditLedger: core.creditLedger,
  }).filter((user) => user.userId === orgId);
  const billingHistory = [
    ...core.paymentEvents.filter(ownerMatches).map((row) => ({
      id: String(row.id || `payment-${row.created_at || Math.random()}`),
      type: 'payment',
      title: normalizeString(row.event_type) || normalizeString(row.status) || 'Payment event',
      amount: Math.round(normalizePaymentAmount(row) * 100) / 100,
      status: normalizeString(row.status) || 'recorded',
      createdAt: normalizeString(row.created_at) || normalizeString(row.updated_at),
      reference: normalizeString(row.razorpay_payment_id) || normalizeString(row.provider_payment_id) || normalizeString(row.id),
    })),
    ...core.creditLedger.filter(ownerMatches).map((row) => ({
      id: String(row.id || `credit-${row.created_at || Math.random()}`),
      type: 'credit',
      title: normalizeString(row.description) || 'Credit ledger entry',
      amount: normalizeNumber(row.amount) * (row.type === 'deduction' ? -1 : 1),
      status: normalizeString(row.type) || 'ledger',
      createdAt: normalizeString(row.created_at),
      reference: normalizeString(row.id),
    })),
  ].sort((left, right) => Date.parse(String(right.createdAt || 0)) - Date.parse(String(left.createdAt || 0)));

  const recentEvents = buildTimeline(core).filter((event) => event.userId === orgId).slice(0, 20);

  return {
    organization,
    members: users,
    usageStats: {
      conversations: core.threads.filter(ownerMatches).length,
      messages: core.messages.filter(ownerMatches).length,
      callLogs: core.callLogs.filter(ownerMatches).length,
      callSessions: core.callSessions.filter(ownerMatches).length,
      emailCampaigns: core.emailCampaigns.filter(ownerMatches).length,
      webhookEvents: core.leadEvents.filter(ownerMatches).length + core.paymentEvents.filter(ownerMatches).length,
      apiUsage:
        core.messages.filter(ownerMatches).length +
        core.callSessions.filter(ownerMatches).length +
        core.leadEvents.filter(ownerMatches).length +
        core.paymentEvents.filter(ownerMatches).length,
    },
    billingHistory: billingHistory.slice(0, 80),
    recentEvents,
    generatedAt: nowIso(),
  };
}

function summarizeHealth(dbLatencyMs: number | null, clientHealth: JsonRecord | null) {
  const envChecks = [
    { label: 'Supabase URL', ok: Boolean(supabaseUrl), detail: supabaseUrl ? 'Configured' : 'Missing' },
    { label: 'Supabase anon key', ok: Boolean(supabaseAnonKey), detail: supabaseAnonKey ? 'Configured' : 'Missing' },
    {
      label: 'Supabase service role',
      ok: Boolean(supabaseServiceRoleKey),
      detail: supabaseServiceRoleKey ? 'Configured server-side' : 'Missing',
    },
    {
      label: 'Admin allowlist',
      ok: allowedEmails.size > 0 || allowedUserIds.size > 0,
      detail:
        allowedEmails.size > 0 || allowedUserIds.size > 0
          ? `${allowedEmails.size} emails, ${allowedUserIds.size} user IDs`
          : 'Development fallback only',
    },
    {
      label: 'Client API health URL',
      ok: Boolean(clientApiBaseUrl),
      detail: clientApiBaseUrl || 'Not configured',
    },
  ];

  const hasCritical = envChecks.some((item) => !item.ok && item.label !== 'Client API health URL');
  const hasWarning = !clientHealth || realtimeStatus !== 'SUBSCRIBED';

  return {
    generatedAt: nowIso(),
    status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    dbLatencyMs,
    realtime: {
      status: realtimeStatus,
      subscribers: liveClients.size,
      recentEvents: recentLiveEvents.length,
    },
    envChecks,
    clientApi: clientHealth,
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };
}

async function checkDbLatency() {
  const startedAt = performance.now();
  const { error } = await adminSupabase.from('app_profiles').select('user_id', { count: 'exact', head: true });
  if (error) {
    throw error;
  }
  return Math.round(performance.now() - startedAt);
}

async function checkClientApiHealth() {
  if (!clientApiBaseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const healthUrl = `${clientApiBaseUrl.replace(/\/$/, '')}/health`;

  try {
    const startedAt = performance.now();
    const response = await fetch(healthUrl, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    return {
      url: healthUrl,
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      body: text.slice(0, 300),
      checkedAt: nowIso(),
    };
  } catch (error) {
    return {
      url: healthUrl,
      ok: false,
      status: null,
      latencyMs: null,
      body: error instanceof Error ? error.message : String(error),
      checkedAt: nowIso(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getEventTitle(table: string, row: JsonRecord, eventType: string) {
  if (table === 'conversation_messages') {
    return `${eventType} message ${normalizeString(row.direction) || ''}`.trim();
  }
  if (table === 'conversation_threads') {
    return `${eventType} conversation ${normalizeString(row.contact_name) || normalizeString(row.display_phone) || ''}`.trim();
  }
  if (table === 'call_sessions' || table === 'call_logs') {
    return `${eventType} WhatsApp call ${normalizeString(row.state) || normalizeString(row.type) || ''}`.trim();
  }
  if (table === 'meta_lead_capture_events') {
    return `${eventType} lead webhook ${normalizeString(row.processing_status) || ''}`.trim();
  }
  if (table === 'whatsapp_payment_configuration_events') {
    return `${eventType} payment webhook ${normalizeString(row.status) || ''}`.trim();
  }
  if (table === 'app_profiles') {
    return `${eventType} workspace profile`;
  }
  if (table === 'owner_admin_profiles') {
    return `${eventType} owner profile`;
  }
  if (table === 'credit_ledger') {
    return `${eventType} credit ledger entry`;
  }
  return `${eventType} ${formatTableName(table)}`;
}

function getEventSeverity(table: string, row: JsonRecord): LivePayload['severity'] {
  const status = String(row.processing_status || row.status || row.state || '').toLowerCase();
  if (status.includes('fail') || status.includes('error') || status.includes('halted')) {
    return 'critical';
  }
  if (status.includes('partial') || status.includes('pending') || status.includes('missed')) {
    return 'warning';
  }
  if (table === 'credit_ledger' || table === 'app_profiles') {
    return 'success';
  }
  return 'info';
}

function mapLivePayload(table: string, payload: { eventType: string; new?: unknown; old?: unknown }): LivePayload {
  const row = (isRecord(payload.new) ? payload.new : isRecord(payload.old) ? payload.old : {}) as JsonRecord;
  const id = normalizeString(row.id) || `${table}:${payload.eventType}:${Date.now()}`;
  const userId = normalizeString(row.user_id) || normalizeString(row.workspace_owner_user_id);
  return {
    id: `${table}:${payload.eventType}:${id}:${Date.now()}`,
    occurredAt: normalizeString(row.updated_at) || normalizeString(row.created_at) || nowIso(),
    source: 'supabase',
    eventType: payload.eventType,
    table,
    userId,
    title: getEventTitle(table, row, payload.eventType),
    description:
      normalizeString(row.last_message_text) ||
      normalizeString(row.body) ||
      normalizeString(row.error_message) ||
      normalizeString(row.description) ||
      normalizeString(row.campaign_name) ||
      undefined,
    severity: getEventSeverity(table, row),
    status:
      normalizeString(row.processing_status) ||
      normalizeString(row.status) ||
      normalizeString(row.state) ||
      normalizeString(row.type),
    payload: row,
  };
}

function pushLiveEvent(event: LivePayload) {
  recentLiveEvents = [event, ...recentLiveEvents].slice(0, 100);
  const frame = `event: admin-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const [, response] of liveClients) {
    response.write(frame);
  }
}

function startRealtimeBridge() {
  if (!hasRequiredServerConfig || realtimeStarted) {
    return;
  }

  realtimeStarted = true;
  const tables = [
    'app_profiles',
    'meta_channels',
    'instagram_channels',
    'messenger_channels',
    'conversation_threads',
    'conversation_messages',
    'call_logs',
    'call_sessions',
    'meta_lead_capture_events',
    'whatsapp_payment_configuration_events',
    'credit_ledger',
    'email_campaigns',
    'user_notifications',
    'owner_admin_profiles',
  ];

  let channel = adminSupabase.channel('owner-dashboard-live');
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => pushLiveEvent(mapLivePayload(table, payload)),
    );
  }

  channel.subscribe((status) => {
    realtimeStatus = status;
    pushLiveEvent({
      id: `realtime:${status}:${Date.now()}`,
      occurredAt: nowIso(),
      source: 'server',
      eventType: 'REALTIME_STATUS',
      title: `Realtime bridge ${status.toLowerCase()}`,
      description: 'Admin Control Centre Supabase realtime listener changed state.',
      severity: status === 'SUBSCRIBED' ? 'success' : 'warning',
      status,
    });
  });
}

async function recordAdminAudit(admin: AdminContext | undefined, action: string, targetUserId?: string | null, metadata?: JsonRecord) {
  const event: LivePayload = {
    id: `admin-action:${action}:${Date.now()}`,
    occurredAt: nowIso(),
    source: 'owner-dashboard',
    eventType: action,
    userId: targetUserId || null,
    title: action
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' '),
    description: admin?.email ? `By ${admin.email}` : undefined,
    severity: 'success',
    status: 'completed',
    payload: metadata,
  };

  pushLiveEvent(event);

  try {
    await adminSupabase.from('owner_admin_audit_events').insert({
      admin_user_id: admin?.id || null,
      admin_email: admin?.email || null,
      action,
      target_user_id: targetUserId || null,
      metadata: metadata || {},
    });
  } catch {
    // The optional admin audit migration may not have been applied yet.
  }
}

async function loadCoreData() {
  const [
    profiles,
    metaChannels,
    instagramChannels,
    messengerChannels,
    threads,
    messages,
    callLogs,
    callSessions,
    leadEvents,
    paymentEvents,
    emailCampaigns,
    creditLedger,
    notifications,
    emailConnections,
    templates,
  ] = await Promise.all([
    safeSelect('app_profiles', '*', (query: any) => query.order('created_at', { ascending: false }).limit(1000)),
    safeSelect('meta_channels', '*'),
    safeSelect('instagram_channels', '*'),
    safeSelect('messenger_channels', '*'),
    safeSelect('conversation_threads', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('conversation_messages', '*', (query: any) => query.order('created_at', { ascending: false }).limit(1000)),
    safeSelect('call_logs', '*', (query: any) => query.order('created_at', { ascending: false }).limit(1000)),
    safeSelect('call_sessions', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('meta_lead_capture_events', '*', (query: any) => query.order('created_at', { ascending: false }).limit(500)),
    safeSelect('whatsapp_payment_configuration_events', '*', (query: any) =>
      query.order('created_at', { ascending: false }).limit(500),
    ),
    safeSelect('email_campaigns', '*', (query: any) => query.order('created_at', { ascending: false }).limit(1000)),
    safeSelect('credit_ledger', '*', (query: any) => query.order('created_at', { ascending: false }).limit(2000)),
    safeSelect('user_notifications', '*', (query: any) => query.order('created_at', { ascending: false }).limit(500)),
    safeSelect('email_connections', '*'),
    safeSelect('meta_templates', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
  ]);

  return {
    profiles: profiles.rows,
    metaChannels: metaChannels.rows,
    instagramChannels: instagramChannels.rows,
    messengerChannels: messengerChannels.rows,
    threads: threads.rows,
    messages: messages.rows,
    callLogs: callLogs.rows,
    callSessions: callSessions.rows,
    leadEvents: leadEvents.rows,
    paymentEvents: paymentEvents.rows,
    emailCampaigns: emailCampaigns.rows,
    creditLedger: creditLedger.rows,
    notifications: notifications.rows,
    emailConnections: emailConnections.rows,
    templates: templates.rows,
    errors: [
      profiles.error,
      metaChannels.error,
      instagramChannels.error,
      messengerChannels.error,
      threads.error,
      messages.error,
      callLogs.error,
      callSessions.error,
      leadEvents.error,
      paymentEvents.error,
      emailCampaigns.error,
      creditLedger.error,
      notifications.error,
      emailConnections.error,
      templates.error,
    ].filter(Boolean),
  };
}

function buildTimeline(core: Awaited<ReturnType<typeof loadCoreData>>) {
  const items: LivePayload[] = [
    ...core.messages.slice(0, 30).map((row) => mapLivePayload('conversation_messages', { eventType: 'INSERT', new: row })),
    ...core.callSessions.slice(0, 20).map((row) => mapLivePayload('call_sessions', { eventType: 'UPDATE', new: row })),
    ...core.leadEvents.slice(0, 30).map((row) => mapLivePayload('meta_lead_capture_events', { eventType: 'INSERT', new: row })),
    ...core.paymentEvents
      .slice(0, 30)
      .map((row) => mapLivePayload('whatsapp_payment_configuration_events', { eventType: 'INSERT', new: row })),
    ...core.creditLedger.slice(0, 30).map((row) => mapLivePayload('credit_ledger', { eventType: 'INSERT', new: row })),
    ...recentLiveEvents.slice(0, 30),
  ];

  return items
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 60);
}

function buildClientApiUrl(pathname: string) {
  if (!clientApiBaseUrl) {
    return null;
  }

  return `${clientApiBaseUrl.replace(/\/$/, '')}${pathname}`;
}

function buildWebhookReferences() {
  const configured = Boolean(clientApiBaseUrl);

  return [
    {
      id: 'whatsapp-cloud-api',
      name: 'WhatsApp Cloud API webhook',
      url: buildClientApiUrl('/meta/webhook'),
      methods: ['GET', 'POST'],
      provider: 'Meta WhatsApp Cloud API',
      purpose:
        'GET verifies Meta subscription challenges. POST receives inbound WhatsApp messages, message delivery/read statuses, WhatsApp call events, and payment configuration update events.',
      verifyTokenEnv: 'META_WEBHOOK_VERIFY_TOKEN',
      events: [
        'messages',
        'statuses',
        'calls',
        'payment_configuration_update',
      ],
      status: configured ? 'configured' : 'needs_base_url',
      notes: 'Use this as the callback URL for WhatsApp Business Account webhooks.',
    },
    {
      id: 'messenger-canonical',
      name: 'Messenger webhook',
      url: buildClientApiUrl('/meta/messenger/webhook'),
      methods: ['GET', 'POST'],
      provider: 'Meta Messenger / Facebook Pages',
      purpose:
        'GET verifies Page webhook subscription challenges. POST receives Messenger page messages, postbacks, reads, deliveries, and echo events.',
      verifyTokenEnv: 'MESSENGER_WEBHOOK_VERIFY_TOKEN',
      events: [
        'messages',
        'messaging_postbacks',
        'message_reads',
        'message_deliveries',
        'message_echoes',
      ],
      status: configured ? 'configured' : 'needs_base_url',
      notes: 'Preferred Messenger callback URL.',
    },
    {
      id: 'messenger-alias',
      name: 'Messenger webhook alias',
      url: buildClientApiUrl('/messenger/webhook'),
      methods: ['GET', 'POST'],
      provider: 'Meta Messenger / Facebook Pages',
      purpose:
        'Compatibility alias for the Messenger webhook. It uses the same verification and event handler as the canonical Messenger URL.',
      verifyTokenEnv: 'MESSENGER_WEBHOOK_VERIFY_TOKEN',
      events: [
        'messages',
        'messaging_postbacks',
        'message_reads',
        'message_deliveries',
        'message_echoes',
      ],
      status: configured ? 'configured' : 'needs_base_url',
      notes: 'Keep available for older app configuration or manual Meta setup.',
    },
    {
      id: 'meta-lead-capture',
      name: 'Meta Lead Ads webhook',
      url: buildClientApiUrl('/meta/lead-capture/webhook'),
      methods: ['GET', 'POST'],
      provider: 'Meta Lead Ads',
      purpose:
        'GET verifies leadgen webhook setup using each workspace verify token. POST receives page/form leadgen events and syncs them into CRM leads.',
      verifyTokenEnv: 'Per-workspace verify_token in meta_lead_capture_configs',
      events: [
        'leadgen',
        'page lead events',
        'form lead events',
      ],
      status: configured ? 'configured' : 'needs_base_url',
      notes: 'Used by the Meta Lead Capture integration.',
    },
    {
      id: 'whatsapp-payments-data-endpoint',
      name: 'WhatsApp Payments data endpoint',
      url: null,
      methods: ['POST'],
      provider: 'WhatsApp Payments',
      purpose:
        'This is not a fixed Connektly route. Each payment configuration stores its own provider data endpoint URL and sends it to Meta through the WhatsApp Payments setup flow.',
      events: [
        'payment data exchange',
        'provider order/payment callback',
      ],
      status: 'external',
      notes:
        'Manage stored payment configuration URLs from WhatsApp Payments setup; webhook update events still arrive through the WhatsApp Cloud API webhook above.',
    },
  ] as const;
}

function buildOverview(core: Awaited<ReturnType<typeof loadCoreData>>, authUsers: User[], health: ReturnType<typeof summarizeHealth>) {
  const totalCredits = core.creditLedger.reduce((total, row) => {
    const amount = normalizeNumber(row.amount);
    return row.type === 'deduction' ? total - amount : total + amount;
  }, 0);
  const paidProfiles = core.profiles.filter((row) => ['active', 'paid'].includes(String(row.billing_status || '').toLowerCase()));
  const trials = core.profiles.filter((row) => String(row.billing_status || '').toLowerCase().includes('trial'));
  const connectedChannels = core.metaChannels.length + core.instagramChannels.length + core.messengerChannels.length;
  const activeCalls = core.callSessions.filter((row) => {
    const state = String(row.state || '').toLowerCase();
    return state && !['ended', 'failed', 'rejected', 'timeout'].includes(state);
  });

  const planBreakdown = core.profiles.reduce<Record<string, number>>((acc, row) => {
    const key = normalizeString(row.selected_plan) || 'No plan';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: nowIso(),
    metrics: {
      totalUsers: Math.max(authUsers.length, core.profiles.length),
      workspaces: core.profiles.length,
      paidWorkspaces: paidProfiles.length,
      trialWorkspaces: trials.length,
      connectedChannels,
      conversations: core.threads.length,
      messages24h: core.messages.filter((row) => isRecent(row.created_at, 24)).length,
      calls24h: core.callLogs.filter((row) => isRecent(row.created_at, 24)).length,
      activeCalls: activeCalls.length,
      leadWebhooks24h: core.leadEvents.filter((row) => isRecent(row.created_at, 24)).length,
      emailCampaigns24h: core.emailCampaigns.filter((row) => isRecent(row.created_at, 24)).length,
      totalCreditBalance: Math.round(totalCredits * 100) / 100,
    },
    planBreakdown,
    health,
    timeline: buildTimeline(core),
    recentUsers: buildUserRows({
      authUsers,
      profiles: core.profiles,
      metaChannels: core.metaChannels,
      instagramChannels: core.instagramChannels,
      messengerChannels: core.messengerChannels,
      threads: core.threads,
      calls: core.callLogs,
      emailCampaigns: core.emailCampaigns,
      creditLedger: core.creditLedger,
    })
      .sort((left, right) => Date.parse(String(right.createdAt || 0)) - Date.parse(String(left.createdAt || 0)))
      .slice(0, 8),
    warnings: core.errors,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'connektly-owner-dashboard', uptimeSeconds: Math.round(process.uptime()) });
});

app.get('/api/admin/me', requireAdmin, (req: AdminRequest, res) => {
  res.json({
    admin: {
      id: req.admin?.id,
      email: req.admin?.email,
    },
  });
});

app.get('/api/admin/settings', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const { row, warning } = await getOwnerProfileRow(admin.id);
    res.json(buildOwnerSettings(admin, row, warning));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/settings/profile', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const updates: JsonRecord = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) {
      const fullName = normalizeString(req.body.fullName);
      if (!fullName) {
        throw new Error('Full name is required.');
      }
      updates.full_name = fullName;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      updates.email = normalizeString(req.body.email) || admin.email;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      updates.phone = normalizeString(req.body.phone) || '';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'organizationName')) {
      updates.organization_name = normalizeString(req.body.organizationName) || '';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'organizationWebsite')) {
      updates.organization_website = normalizeString(req.body.organizationWebsite) || '';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'roleTitle')) {
      updates.role_title = normalizeString(req.body.roleTitle) || '';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'timezone')) {
      updates.timezone = normalizeString(req.body.timezone) || 'Asia/Kolkata';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'dashboardTheme')) {
      updates.dashboard_theme = normalizeTheme(req.body.dashboardTheme);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'density')) {
      updates.density = normalizeDensity(req.body.density);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'accentColor')) {
      updates.accent_color = normalizeAccentColor(req.body.accentColor);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'notifications')) {
      updates.notifications = normalizeOwnerNotifications(req.body.notifications);
    }

    const metadataUpdates: JsonRecord = {};
    if (updates.full_name !== undefined) metadataUpdates.full_name = updates.full_name;
    if (updates.phone !== undefined) metadataUpdates.phone = updates.phone;
    if (updates.organization_name !== undefined) metadataUpdates.organization_name = updates.organization_name;
    if (updates.organization_website !== undefined) metadataUpdates.organization_website = updates.organization_website;
    if (updates.role_title !== undefined) metadataUpdates.role_title = updates.role_title;

    const [authUser, saved] = await Promise.all([
      Object.keys(metadataUpdates).length > 0 ? updateAdminUserMetadata(admin, metadataUpdates) : Promise.resolve(admin.user),
      upsertOwnerProfile(admin, updates),
    ]);

    await recordAdminAudit(admin, 'UPDATE_OWNER_PROFILE', null, { updates: Object.keys(updates) });
    res.json(buildOwnerSettings(admin, saved.row, saved.warning, authUser));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/settings/profile-photo', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const { buffer, mimeType, extension } = parseProfilePhotoData(req.body?.dataUrl);
    await ensureOwnerProfileBucket();

    const storagePath = `${admin.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error: uploadError } = await adminSupabase.storage.from(ownerProfileBucket).upload(storagePath, buffer, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: true,
    });
    if (uploadError) {
      throw uploadError;
    }

    const { data } = adminSupabase.storage.from(ownerProfileBucket).getPublicUrl(storagePath);
    const avatarUrl = data.publicUrl;
    const [authUser, saved] = await Promise.all([
      updateAdminUserMetadata(admin, { avatar_url: avatarUrl, picture: avatarUrl }),
      upsertOwnerProfile(admin, { avatar_url: avatarUrl }),
    ]);

    await recordAdminAudit(admin, 'UPDATE_OWNER_PROFILE_PHOTO');
    res.json(buildOwnerSettings(admin, saved.row, saved.warning, authUser));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/bootstrap', requireAdmin, async (_req, res) => {
  try {
    startRealtimeBridge();
    const [dbLatencyMs, clientHealth, authUsers, core] = await Promise.all([
      checkDbLatency().catch(() => null),
      checkClientApiHealth(),
      listAuthUsers().catch(() => []),
      loadCoreData(),
    ]);

    const health = summarizeHealth(dbLatencyMs, clientHealth);
    res.json(buildOverview(core, authUsers, health));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/organizations', requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const plan = String(req.query.plan || 'all').trim().toLowerCase();
    const core = await loadCoreData();
    const authUsers = await listAuthUsers().catch(() => []);
    let organizations = buildOrganizationRows(core, authUsers);

    if (search) {
      organizations = organizations.filter((organization) =>
        [
          organization.orgName,
          organization.ownerName,
          organization.ownerEmail,
          organization.ownerUserId,
          organization.plan,
          organization.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }

    if (status !== 'all') {
      organizations = organizations.filter((organization) => String(organization.status || 'none').toLowerCase() === status);
    }

    if (plan !== 'all') {
      organizations = organizations.filter((organization) => String(organization.plan || 'none').toLowerCase() === plan);
    }

    const allOrganizations = buildOrganizationRows(core, authUsers);
    res.json({
      organizations: organizations.sort(
        (left, right) => Date.parse(String(right.updatedAt || right.createdAt || 0)) - Date.parse(String(left.updatedAt || left.createdAt || 0)),
      ),
      summary: {
        total: allOrganizations.length,
        active: allOrganizations.filter((organization) => ['active', 'trialing'].includes(String(organization.status).toLowerCase())).length,
        suspended: allOrganizations.filter((organization) => ['suspended', 'banned', 'deleted'].includes(String(organization.status).toLowerCase())).length,
        revenue: Math.round(allOrganizations.reduce((total, organization) => total + organization.revenue, 0) * 100) / 100,
        risk: allOrganizations.filter((organization) => organization.riskFlags.length > 0).length,
      },
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/organizations/:orgId', requireAdmin, async (req, res) => {
  try {
    const { orgId } = req.params;
    const core = await loadCoreData();
    const authUsers = await listAuthUsers().catch(() => []);
    const detail = buildOrganizationDetail(core, authUsers, orgId);
    if (!detail) {
      res.status(404).json({ error: 'Organization was not found.' });
      return;
    }
    res.json(detail);
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/organizations/:orgId/action', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { orgId } = req.params;
    const action = normalizeString(req.body.action);
    if (!action) {
      throw new Error('Organization action is required.');
    }

    let impersonation: JsonRecord | null = null;

    if (['suspend', 'activate', 'delete', 'update_plan'].includes(action)) {
      const updates: JsonRecord = { updated_at: nowIso() };
      if (action === 'suspend') {
        updates.billing_status = 'suspended';
      }
      if (action === 'activate') {
        updates.billing_status = 'active';
      }
      if (action === 'delete') {
        updates.billing_status = 'deleted';
        updates.onboarding_completed = false;
      }
      if (action === 'update_plan') {
        const selectedPlan = normalizeString(req.body.selectedPlan);
        if (!selectedPlan) {
          throw new Error('selectedPlan is required for update_plan.');
        }
        updates.selected_plan = selectedPlan;
        if (Object.prototype.hasOwnProperty.call(req.body, 'billingCycle')) {
          updates.billing_cycle = normalizeString(req.body.billingCycle) || null;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'billingStatus')) {
          updates.billing_status = normalizeString(req.body.billingStatus) || 'active';
        }
      }

      const { error } = await adminSupabase.from('app_profiles').update(updates).eq('user_id', orgId);
      if (error) {
        throw error;
      }
      await recordAdminAudit(req.admin, `ORG_${action.toUpperCase()}`, orgId, { updates });
    } else if (action === 'ban' || action === 'unban') {
      const { error } = await adminSupabase.auth.admin.updateUserById(orgId, {
        ban_duration: action === 'ban' ? normalizeString(req.body.duration) || '876000h' : 'none',
      });
      if (error) {
        throw error;
      }
      await recordAdminAudit(req.admin, action === 'ban' ? 'BAN_ORG' : 'UNBAN_ORG', orgId);
    } else if (action === 'impersonate') {
      const authUser = await getAuthUserById(orgId);
      const email = normalizeString(authUser?.email);
      if (!email) {
        throw new Error('This organization owner does not have an email address for impersonation.');
      }

      const { data, error } = await adminSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (error) {
        throw error;
      }

      impersonation = {
        email,
        actionLink: data.properties?.action_link || null,
      };
      await recordAdminAudit(req.admin, 'IMPERSONATE_ORG_LOGIN', orgId, { email });
    } else {
      throw new Error('Unsupported organization action.');
    }

    const core = await loadCoreData();
    const authUsers = await listAuthUsers().catch(() => []);
    const detail = buildOrganizationDetail(core, authUsers, orgId);
    res.json({
      detail,
      impersonation,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const orgId = String(req.query.orgId || 'all').trim();
    const core = await loadCoreData();
    const authUsers = await listAuthUsers().catch(() => []);
    let users = buildUserRows({
      authUsers,
      profiles: core.profiles,
      metaChannels: core.metaChannels,
      instagramChannels: core.instagramChannels,
      messengerChannels: core.messengerChannels,
      threads: core.threads,
      calls: core.callLogs,
      emailCampaigns: core.emailCampaigns,
      creditLedger: core.creditLedger,
    });

    if (search) {
      users = users.filter((user) =>
        [user.email, user.fullName, user.companyName, user.phone, user.userId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }

    if (status !== 'all') {
      users = users.filter((user) => String(user.billingStatus || 'none').toLowerCase() === status);
    }

    if (orgId !== 'all') {
      users = users.filter((user) => user.userId === orgId);
    }

    res.json({
      users: users.sort((left, right) => Date.parse(String(right.updatedAt || right.createdAt || 0)) - Date.parse(String(left.updatedAt || left.createdAt || 0))),
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const [authUser, profile, metaChannel, instagramChannel, messengerChannel, conversations, messages, calls, callSessions, credits, emailCampaigns, notifications] =
      await Promise.all([
        getAuthUserById(userId),
        safeSelect('app_profiles', '*', (query: any) => query.eq('user_id', userId).maybeSingle()),
        safeSelect('meta_channels', '*', (query: any) => query.eq('user_id', userId).maybeSingle()),
        safeSelect('instagram_channels', '*', (query: any) => query.eq('user_id', userId).maybeSingle()),
        safeSelect('messenger_channels', '*', (query: any) => query.eq('user_id', userId).maybeSingle()),
        safeSelect('conversation_threads', '*', (query: any) => query.eq('user_id', userId).order('updated_at', { ascending: false }).limit(50)),
        safeSelect('conversation_messages', '*', (query: any) => query.eq('user_id', userId).order('created_at', { ascending: false }).limit(100)),
        safeSelect('call_logs', '*', (query: any) => query.eq('user_id', userId).order('created_at', { ascending: false }).limit(50)),
        safeSelect('call_sessions', '*', (query: any) => query.eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)),
        safeSelect('credit_ledger', '*', (query: any) => query.eq('user_id', userId).order('created_at', { ascending: false }).limit(100)),
        safeSelect('email_campaigns', '*', (query: any) => query.eq('user_id', userId).order('created_at', { ascending: false }).limit(50)),
        safeSelect('user_notifications', '*', (query: any) => query.eq('user_id', userId).order('created_at', { ascending: false }).limit(50)),
      ]);

    const profileRow = profile.rows[0] || null;
    res.json({
      user: {
        userId,
        auth: authUser
          ? {
              id: authUser.id,
              email: authUser.email,
              createdAt: authUser.created_at,
              updatedAt: authUser.updated_at,
              lastSignInAt: authUser.last_sign_in_at,
              bannedUntil: authUser.banned_until,
              emailConfirmedAt: authUser.email_confirmed_at,
            }
          : null,
        profile: profileRow,
        displayName: userDisplayName(profileRow || undefined, authUser),
        channels: {
          whatsapp: metaChannel.rows[0] || null,
          instagram: instagramChannel.rows[0] || null,
          messenger: messengerChannel.rows[0] || null,
        },
        conversations: conversations.rows,
        messages: messages.rows,
        calls: calls.rows,
        callSessions: callSessions.rows,
        credits: credits.rows,
        emailCampaigns: emailCampaigns.rows,
        notifications: notifications.rows,
      },
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/users/:userId/profile', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { userId } = req.params;
    const allowedFields = [
      'full_name',
      'company_name',
      'company_website',
      'industry',
      'selected_plan',
      'billing_cycle',
      'billing_status',
      'trial_ends_at',
      'coupon_code',
      'razorpay_subscription_id',
      'onboarding_completed',
    ];
    const updates: JsonRecord = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }
    updates.updated_at = nowIso();

    const { data, error } = await adminSupabase.from('app_profiles').update(updates).eq('user_id', userId).select('*').single();
    if (error) {
      throw error;
    }

    if (req.body.notifyUser) {
      await adminSupabase.from('user_notifications').insert({
        user_id: userId,
        type: 'lead_created',
        title: 'Workspace updated',
        body: 'Your Connektly workspace settings were updated by support.',
        target_path: '/dashboard/settings',
        metadata: { source: 'owner_dashboard', updates: Object.keys(updates) },
      });
    }

    await recordAdminAudit(req.admin, 'UPDATE_USER_PROFILE', userId, { updates });
    res.json({ profile: data });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/users/:userId/credits', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { userId } = req.params;
    const amount = normalizeNumber(req.body.amount);
    const type = req.body.type === 'deduction' ? 'deduction' : 'addition';
    const description = normalizeString(req.body.description) || 'Admin Control Centre credit adjustment';
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const { data, error } = await adminSupabase
      .from('credit_ledger')
      .insert({
        user_id: userId,
        description,
        type,
        amount,
        currency: normalizeString(req.body.currency) || 'USD',
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (req.body.notifyUser) {
      await adminSupabase.from('user_notifications').insert({
        user_id: userId,
        type: 'lead_created',
        title: type === 'addition' ? 'Credits added' : 'Credits adjusted',
        body: description,
        target_path: '/dashboard/credits/whatsapp',
        metadata: { source: 'owner_dashboard', amount, type },
      });
    }

    await recordAdminAudit(req.admin, 'ADJUST_USER_CREDITS', userId, { amount, type, description });
    res.json({ ledgerEntry: data });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/users/:userId/notice', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { userId } = req.params;
    const title = normalizeString(req.body.title);
    const body = normalizeString(req.body.body);
    if (!title || !body) {
      throw new Error('Title and body are required.');
    }

    const { data, error } = await adminSupabase
      .from('user_notifications')
      .insert({
        user_id: userId,
        type: 'lead_created',
        title,
        body,
        target_path: normalizeString(req.body.targetPath) || '/dashboard/home',
        metadata: { source: 'owner_dashboard' },
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await recordAdminAudit(req.admin, 'SEND_USER_NOTICE', userId, { title });
    res.json({ notification: data });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/users/:userId/auth', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { userId } = req.params;
    const action = normalizeString(req.body.action);
    if (action !== 'ban' && action !== 'unban') {
      throw new Error('Action must be "ban" or "unban".');
    }

    const { data, error } = await adminSupabase.auth.admin.updateUserById(userId, {
      ban_duration: action === 'ban' ? normalizeString(req.body.duration) || '876000h' : 'none',
    });
    if (error) {
      throw error;
    }

    await recordAdminAudit(req.admin, action === 'ban' ? 'BAN_USER' : 'UNBAN_USER', userId);
    res.json({ user: data.user });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/payments', requireAdmin, async (_req, res) => {
  try {
    const [profiles, creditLedger, paymentEvents] = await Promise.all([
      safeSelect('app_profiles', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
      safeSelect('credit_ledger', '*', (query: any) => query.order('created_at', { ascending: false }).limit(500)),
      safeSelect('whatsapp_payment_configuration_events', '*', (query: any) =>
        query.order('created_at', { ascending: false }).limit(500),
      ),
    ]);

    const billingBreakdown = profiles.rows.reduce<Record<string, number>>((acc, row) => {
      const key = normalizeString(row.billing_status) || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const planBreakdown = profiles.rows.reduce<Record<string, number>>((acc, row) => {
      const key = normalizeString(row.selected_plan) || 'none';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ledgerTotals = creditLedger.rows.reduce<{ additions: number; deductions: number }>(
      (acc, row) => {
        const amount = normalizeNumber(row.amount);
        if (row.type === 'deduction') {
          acc.deductions += amount;
        } else {
          acc.additions += amount;
        }
        return acc;
      },
      { additions: 0, deductions: 0 },
    );

    res.json({
      summary: {
        profiles: profiles.rows.length,
        activeSubscriptions: profiles.rows.filter((row) => String(row.billing_status || '').toLowerCase() === 'active').length,
        trialing: profiles.rows.filter((row) => String(row.billing_status || '').toLowerCase().includes('trial')).length,
        ledgerBalance: Math.round((ledgerTotals.additions - ledgerTotals.deductions) * 100) / 100,
        ledgerAdditions: Math.round(ledgerTotals.additions * 100) / 100,
        ledgerDeductions: Math.round(ledgerTotals.deductions * 100) / 100,
      },
      billingBreakdown,
      planBreakdown,
      profiles: profiles.rows,
      creditLedger: creditLedger.rows,
      paymentEvents: paymentEvents.rows,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/webhooks', requireAdmin, async (_req, res) => {
  try {
    const [leadConfigs, leadEvents, paymentEvents, messengerChannels, messages, calls] = await Promise.all([
      safeSelect('meta_lead_capture_configs', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(200)),
      safeSelect('meta_lead_capture_events', '*', (query: any) => query.order('created_at', { ascending: false }).limit(300)),
      safeSelect('whatsapp_payment_configuration_events', '*', (query: any) =>
        query.order('created_at', { ascending: false }).limit(300),
      ),
      safeSelect('messenger_channels', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(200)),
      safeSelect('conversation_messages', '*', (query: any) => query.order('created_at', { ascending: false }).limit(200)),
      safeSelect('call_sessions', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(200)),
    ]);

    const events = [
      ...leadEvents.rows.map((row) => mapLivePayload('meta_lead_capture_events', { eventType: 'INSERT', new: row })),
      ...paymentEvents.rows.map((row) => mapLivePayload('whatsapp_payment_configuration_events', { eventType: 'INSERT', new: row })),
      ...messages.rows.map((row) => mapLivePayload('conversation_messages', { eventType: 'INSERT', new: row })),
      ...calls.rows.map((row) => mapLivePayload('call_sessions', { eventType: 'UPDATE', new: row })),
      ...recentLiveEvents,
    ]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 400);

    res.json({
      summary: {
        leadConfigs: leadConfigs.rows.length,
        activeLeadConfigs: leadConfigs.rows.filter((row) => String(row.status || '').toLowerCase() === 'active').length,
        messengerWebhookErrors: messengerChannels.rows.filter((row) => Boolean(row.webhook_last_error)).length,
        events24h: events.filter((event) => isRecent(event.occurredAt, 24)).length,
        failedEvents: events.filter((event) => event.severity === 'critical').length,
      },
      configs: {
        leadCapture: leadConfigs.rows,
        messenger: messengerChannels.rows,
      },
      webhookUrls: buildWebhookReferences(),
      events,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/server', requireAdmin, async (_req, res) => {
  try {
    const [dbLatencyMs, clientHealth, tableCounts] = await Promise.all([
      checkDbLatency().catch(() => null),
      checkClientApiHealth(),
      Promise.all(
        [
          'app_profiles',
          'meta_channels',
          'conversation_threads',
          'conversation_messages',
          'call_sessions',
          'meta_lead_capture_events',
          'user_notifications',
          'email_campaigns',
        ].map(async (table) => ({ table, count: await safeCount(table) })),
      ),
    ]);

    res.json({
      health: summarizeHealth(dbLatencyMs, clientHealth),
      tableCounts,
      recentEvents: recentLiveEvents.slice(0, 50),
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/audit', requireAdmin, async (_req, res) => {
  try {
    const audit = await safeSelect('owner_admin_audit_events', '*', (query: any) =>
      query.order('created_at', { ascending: false }).limit(200),
    );
    res.json({
      auditEvents: audit.rows,
      liveEvents: recentLiveEvents,
      generatedAt: nowIso(),
      warning: audit.error ? 'Apply supabase/admin_dashboard.sql to persist audit events.' : null,
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/live', requireAdmin, (req: AdminRequest, res) => {
  startRealtimeBridge();

  const clientId = `${req.admin?.id || 'admin'}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  liveClients.set(clientId, res);
  res.write(
    `event: hello\ndata: ${JSON.stringify({
      id: `hello:${clientId}`,
      occurredAt: nowIso(),
      source: 'server',
      eventType: 'CONNECTED',
      title: 'Live stream connected',
      severity: 'success',
      status: realtimeStatus,
    })}\n\n`,
  );

  for (const event of recentLiveEvents.slice(0, 10)) {
    res.write(`event: admin-event\ndata: ${JSON.stringify(event)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: nowIso(), realtimeStatus })}\n\n`);
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    liveClients.delete(clientId);
  });
});

const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  if (hasRequiredServerConfig) {
    startRealtimeBridge();
  }

  console.log(`Connektly Admin Control Centre API listening on http://127.0.0.1:${port}`);
});
