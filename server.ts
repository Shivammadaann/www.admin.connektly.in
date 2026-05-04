import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient, type User } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

type JsonRecord = Record<string, unknown>;

type AdminPermissionKey =
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

type AdminAccessContext = {
  rowId: string | null;
  role: 'primary_owner' | 'admin';
  status: 'active' | 'invited' | 'disabled';
  permissions: AdminPermissionKey[];
  isPrimaryOwner: boolean;
  source: 'primary_owner' | 'database' | 'legacy_env' | 'development';
};

type AdminContext = {
  id: string;
  email: string | null;
  user: User;
  access: AdminAccessContext;
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

type ClientFeatureKey =
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

const app = express();
const port = Number(process.env.PORT || 8787);
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientApiBaseUrl = process.env.CLIENT_API_BASE_URL || '';
const websiteContentRoot = path.resolve(process.env.WEBSITE_CONTENT_ROOT || path.join(__dirname, '..', 'www.connektly.in'));
const websitePublicBaseUrl = (process.env.WEBSITE_PUBLIC_BASE_URL || process.env.WEBSITE_API_BASE_URL || 'http://localhost:3001')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');
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
const primaryOwnerEmail = (process.env.PRIMARY_OWNER_EMAIL || 'admin@connektly.in').trim().toLowerCase();
const adminInviteRedirectUrl = process.env.ADMIN_INVITE_REDIRECT_URL || '';
const graphVersion = process.env.META_GRAPH_VERSION || 'v24.0';
const metaWebhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
const tokenEncryptionSecret = process.env.META_TOKEN_ENCRYPTION_KEY || '';
const tokenEncryptionKey = tokenEncryptionSecret ? crypto.createHash('sha256').update(tokenEncryptionSecret).digest() : null;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

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

function normalizeEmail(value: unknown) {
  const email = normalizeString(value)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) as string[] : [];
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

function decryptSecretValue(value: string) {
  if (!value.startsWith('enc:') || !tokenEncryptionKey) {
    return value;
  }

  const [iv, tag, payload] = value.slice(4).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenEncryptionKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

function decryptAccessToken(value: unknown) {
  const token = normalizeString(value);
  if (!token) {
    throw new Error('This WhatsApp channel does not have a stored Meta access token.');
  }
  return decryptSecretValue(token);
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

    const email = normalizeEmail(data.user.email);
    const access = await getAdminAccessForUser(data.user);

    if (!access) {
      res.status(403).json({
        error:
          `This account is not allowed to use the Admin Control Centre. Ask ${primaryOwnerEmail} to invite this user from Admin Profile > User Management.`,
      });
      return;
    }

    req.admin = {
      id: data.user.id,
      email,
      user: data.user,
      access,
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

async function safeRpc(functionName: string, args: JsonRecord) {
  try {
    const { data, error } = await adminSupabase.rpc(functionName, args);
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

function detectBrowser(userAgent: string | null) {
  const value = String(userAgent || '');
  if (/Edg\//i.test(value)) return 'Microsoft Edge';
  if (/OPR\//i.test(value) || /Opera/i.test(value)) return 'Opera';
  if (/Chrome\//i.test(value) && !/Chromium/i.test(value)) return 'Chrome';
  if (/Firefox\//i.test(value)) return 'Firefox';
  if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) return 'Safari';
  if (/PostmanRuntime/i.test(value)) return 'Postman';
  if (/curl/i.test(value)) return 'curl';
  return value ? 'Unknown browser' : null;
}

function detectOs(userAgent: string | null) {
  const value = String(userAgent || '');
  if (/Windows NT/i.test(value)) return 'Windows';
  if (/Android/i.test(value)) return 'Android';
  if (/(iPhone|iPad|iPod)/i.test(value)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(value)) return 'macOS';
  if (/Linux/i.test(value)) return 'Linux';
  return value ? 'Unknown OS' : null;
}

function detectDevice(userAgent: string | null, fallback?: string | null) {
  const explicit = normalizeString(fallback);
  if (explicit) return explicit;

  const value = String(userAgent || '');
  if (/iPad|Tablet/i.test(value)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/i.test(value)) return 'Mobile';
  if (value) return 'Desktop';
  return null;
}

function normalizeAuthEventType(value: unknown) {
  const text = normalizeString(value) || 'auth_event';
  return text.replace(/^user_?/i, '').replace(/[_-]+/g, ' ');
}

function nestedRecord(record: JsonRecord, key: string) {
  return isRecord(record[key]) ? record[key] as JsonRecord : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested: string | null = pickString(...value);
      if (nested) return nested;
      continue;
    }

    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }

  return null;
}

function extractAuditUserAgent(rawPayload: JsonRecord, row: JsonRecord) {
  const traits = nestedRecord(rawPayload, 'traits');
  const metadata = nestedRecord(rawPayload, 'metadata');
  const request = nestedRecord(rawPayload, 'request');
  const requestHeaders = nestedRecord(request, 'headers');
  const headers = nestedRecord(rawPayload, 'headers');
  const context = nestedRecord(rawPayload, 'context');
  const contextUserAgent = nestedRecord(context, 'user_agent');

  return pickString(
    row.user_agent,
    rawPayload.user_agent,
    rawPayload.userAgent,
    rawPayload.user_agent_string,
    rawPayload.userAgentString,
    traits.user_agent,
    traits.userAgent,
    metadata.user_agent,
    metadata.userAgent,
    request.user_agent,
    request.userAgent,
    requestHeaders['user-agent'],
    requestHeaders.user_agent,
    requestHeaders.userAgent,
    headers['user-agent'],
    headers.user_agent,
    headers.userAgent,
    context.user_agent,
    context.userAgent,
    contextUserAgent.original,
  );
}

function extractAuditIpAddress(rawPayload: JsonRecord, row: JsonRecord) {
  const traits = nestedRecord(rawPayload, 'traits');
  const metadata = nestedRecord(rawPayload, 'metadata');
  const request = nestedRecord(rawPayload, 'request');
  const requestHeaders = nestedRecord(request, 'headers');
  const headers = nestedRecord(rawPayload, 'headers');

  return pickString(
    row.ip_address,
    rawPayload.ip_address,
    rawPayload.ipAddress,
    rawPayload.ip,
    traits.ip_address,
    traits.ipAddress,
    traits.ip,
    metadata.ip_address,
    metadata.ipAddress,
    metadata.ip,
    request.ip_address,
    request.ipAddress,
    request.ip,
    requestHeaders['x-forwarded-for'],
    requestHeaders['x-real-ip'],
    requestHeaders['cf-connecting-ip'],
    requestHeaders['x-client-ip'],
    headers['x-forwarded-for'],
    headers['x-real-ip'],
    headers['cf-connecting-ip'],
    headers['x-client-ip'],
  );
}

function extractAuditDevice(rawPayload: JsonRecord, row: JsonRecord, userAgent: string | null) {
  const traits = nestedRecord(rawPayload, 'traits');
  const metadata = nestedRecord(rawPayload, 'metadata');
  const request = nestedRecord(rawPayload, 'request');
  return detectDevice(
    userAgent,
    pickString(
      row.device,
      rawPayload.device,
      rawPayload.device_type,
      rawPayload.deviceType,
      traits.device,
      traits.device_type,
      traits.deviceType,
      metadata.device,
      metadata.device_type,
      metadata.deviceType,
      request.device,
    ),
  );
}

async function loadUserLoginActivity(userId: string, authUser: User | null) {
  const audit = await safeRpc('get_admin_user_login_activity', {
    p_user_id: userId,
    p_limit: 200,
  });

  if (audit.rows.length > 0) {
    return audit.rows.map((row) => {
      const rawPayload = isRecord(row.raw_payload) ? row.raw_payload : {};
      const userAgent = extractAuditUserAgent(rawPayload, row);
      const device = extractAuditDevice(rawPayload, row, userAgent);
      return {
        id: normalizeString(row.id) || `${userId}:${normalizeString(row.occurred_at) || nowIso()}`,
        occurredAt: normalizeString(row.occurred_at) || nowIso(),
        eventType: normalizeAuthEventType(row.event_type),
        ipAddress: extractAuditIpAddress(rawPayload, row),
        userAgent,
        device,
        browser: detectBrowser(userAgent),
        os: detectOs(userAgent),
        location: normalizeString(row.location) || normalizeString(rawPayload.location),
        rawPayload: row.raw_payload || row,
      };
    });
  }

  const fallback = authUser?.last_sign_in_at
    ? [
        {
          id: `${userId}:last-sign-in`,
          occurredAt: authUser.last_sign_in_at,
          eventType: 'sign in',
          ipAddress: null,
          userAgent: null,
          device: null,
          browser: null,
          os: null,
          location: null,
          rawPayload: {
            source: 'auth.users.last_sign_in_at',
            auditLogAvailable: false,
            auditLogError: audit.error,
          },
        },
      ]
    : [];

  return fallback;
}

const defaultOwnerNotifications = {
  liveEventSound: false,
  criticalWebhookAlerts: true,
  billingAlerts: true,
  serverAlerts: true,
  weeklyOpsDigest: false,
};

const adminPermissionCatalog: Array<{ key: AdminPermissionKey; label: string; description: string }> = [
  { key: 'command_center', label: 'Overview', description: 'View dashboard overview, health, and realtime operations.' },
  { key: 'organizations', label: 'Organization Management', description: 'View and manage organizations, plans, suspension, and impersonation.' },
  { key: 'global_users', label: 'Global Users', description: 'View and manage users across every organization.' },
  { key: 'plan_management', label: 'Plan Management', description: 'Create and manage global pricing plans used by the website and app.' },
  { key: 'platform_settings', label: 'User Platform Settings', description: 'Control pricing, feature flags, limits, API keys, and email templates.' },
  { key: 'payments', label: 'Payments', description: 'View billing, credit ledger, revenue, and payment activity.' },
  { key: 'logs_monitoring', label: 'Logs & Monitoring', description: 'View API logs, error logs, webhook logs, delivery logs, server status, and audit history.' },
  { key: 'global_integrations', label: 'Global Integrations', description: 'View WhatsApp, Instagram, and email service health.' },
  { key: 'website_management', label: 'Website Management', description: 'Manage public website blog posts and Help Center articles.' },
  { key: 'webhooks', label: 'Webhooks Live', description: 'View webhook configuration and realtime webhook activity.' },
  { key: 'server_status', label: 'Server Status', description: 'View service health, table counts, and backend status.' },
  { key: 'security_audit', label: 'Security Audit', description: 'View persisted admin audit activity.' },
];

const allAdminPermissions = adminPermissionCatalog.map((permission) => permission.key);

const defaultPlatformSettings = {
  pricing_plans: {
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        currency: 'INR',
        monthlyPrice: 999,
        annualPrice: 9990,
        credits: 1000,
        features: ['Shared inbox', 'WhatsApp channel', 'Basic CRM'],
        isActive: true,
        isRecommended: false,
      },
      {
        id: 'growth',
        name: 'Growth',
        currency: 'INR',
        monthlyPrice: 2499,
        annualPrice: 24990,
        credits: 5000,
        features: ['Multi-channel inbox', 'Automation', 'Team members', 'Webhooks'],
        isActive: true,
        isRecommended: true,
      },
      {
        id: 'scale',
        name: 'Scale',
        currency: 'INR',
        monthlyPrice: 7999,
        annualPrice: 79990,
        credits: 20000,
        features: ['Advanced automation', 'Priority support', 'API access', 'Custom limits'],
        isActive: true,
        isRecommended: false,
      },
    ],
  },
  feature_flags: {
    flags: [
      { key: 'whatsapp_inbox', label: 'WhatsApp Inbox', description: 'Enable WhatsApp messaging workflows.', enabled: true },
      { key: 'instagram_inbox', label: 'Instagram Inbox', description: 'Enable Instagram DM support.', enabled: true },
      { key: 'messenger_inbox', label: 'Messenger Inbox', description: 'Enable Facebook Messenger support.', enabled: true },
      { key: 'voice_calls', label: 'Voice Calls', description: 'Enable calling and call logs.', enabled: true },
      { key: 'whatsapp_flows', label: 'WhatsApp Flows', description: 'Enable WhatsApp Flow creation, publishing, and submissions.', enabled: true },
      { key: 'automation_rules', label: 'Automation Rules', description: 'Enable keyword triggers, flow actions, and conversational automation.', enabled: true },
      { key: 'meta_ads', label: 'Meta Ads Manager', description: 'Enable Meta Ads account setup, campaign monitoring, and campaign status controls.', enabled: true },
      { key: 'meta_lead_capture', label: 'Meta Lead Capture', description: 'Enable Page/form lead webhook ingestion into CRM leads.', enabled: true },
      { key: 'email_campaigns', label: 'Email Campaigns', description: 'Enable campaign sending tools.', enabled: true },
      { key: 'email_inbox', label: 'Email Inbox', description: 'Enable IMAP email inbox sync and notifications.', enabled: true },
      { key: 'whatsapp_payments', label: 'WhatsApp Payments', description: 'Enable WhatsApp payment configuration setup and event monitoring.', enabled: true },
      { key: 'woocommerce', label: 'WooCommerce', description: 'Enable WooCommerce connection and automated order messages.', enabled: true },
      { key: 'workspace_team', label: 'Workspace Team', description: 'Enable team invitations and member management inside workspaces.', enabled: true },
      { key: 'api_access', label: 'API Access', description: 'Enable public API access for integrations.', enabled: false },
    ],
    orgOverrides: [],
  },
  rate_limits: {
    default: {
      messagesPerMinute: 60,
      apiRequestsPerMinute: 120,
    },
    orgOverrides: [],
  },
  api_keys: {
    keys: [
      { id: 'main-app', name: 'Main App API', scope: 'app.connektly.in', key: '', isActive: true, createdAt: null, updatedAt: null },
      { id: 'email-provider', name: 'Email Provider', scope: 'transactional_email', key: '', isActive: false, createdAt: null, updatedAt: null },
    ],
  },
  email_templates: {
    templates: [
      {
        id: 'invite_user',
        name: 'Invite user email',
        subject: 'You are invited to join {{organization_name}} on Connektly',
        body: 'Hi {{user_name}},\n\nYou have been invited to join {{organization_name}} on Connektly.\n\nOpen your invite: {{invite_url}}',
        enabled: true,
        updatedAt: null,
      },
      {
        id: 'password_reset',
        name: 'Password reset email',
        subject: 'Reset your Connektly password',
        body: 'Hi {{user_name}},\n\nUse this link to reset your password: {{reset_url}}\n\nIf you did not request this, ignore this email.',
        enabled: true,
        updatedAt: null,
      },
      {
        id: 'magic_link',
        name: 'Magic link email',
        subject: 'Your Connektly login link',
        body: 'Hi {{user_name}},\n\nUse this secure link to sign in: {{magic_link}}',
        enabled: true,
        updatedAt: null,
      },
    ],
  },
};

type PlatformSettingsSection = keyof typeof defaultPlatformSettings;

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

function normalizeAdminRole(value: unknown): 'primary_owner' | 'admin' {
  return value === 'primary_owner' ? 'primary_owner' : 'admin';
}

function normalizeAdminStatus(value: unknown): 'active' | 'invited' | 'disabled' {
  return value === 'disabled' || value === 'invited' ? value : 'active';
}

function normalizeAdminPermissions(value: unknown, role: 'primary_owner' | 'admin') {
  if (role === 'primary_owner') {
    return allAdminPermissions;
  }

  const allowed = new Set(allAdminPermissions);
  const incoming = Array.isArray(value) ? value : [];
  return incoming.map((item) => normalizeString(item)).filter((item): item is AdminPermissionKey => Boolean(item && allowed.has(item as AdminPermissionKey)));
}

function hasAdminPermission(admin: AdminContext | undefined, permission: AdminPermissionKey) {
  return Boolean(admin?.access.isPrimaryOwner || admin?.access.permissions.includes(permission));
}

function requireAdminPermission(permission: AdminPermissionKey) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!hasAdminPermission(req.admin, permission)) {
      res.status(403).json({ error: 'This admin account does not have access to that dashboard feature.' });
      return;
    }

    next();
  };
}

function requireAnyAdminPermission(permissions: AdminPermissionKey[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin?.access.isPrimaryOwner && !permissions.some((permission) => req.admin?.access.permissions.includes(permission))) {
      res.status(403).json({ error: 'This admin account does not have access to that dashboard feature.' });
      return;
    }

    next();
  };
}

function requirePrimaryOwner(req: AdminRequest, res: Response, next: NextFunction) {
  if (!req.admin?.access.isPrimaryOwner) {
    res.status(403).json({ error: `Only the primary owner (${primaryOwnerEmail}) can manage dashboard admins.` });
    return;
  }

  next();
}

function buildAdminAccessContext(row: JsonRecord, source: AdminAccessContext['source']): AdminAccessContext | null {
  const role = normalizeAdminRole(row.role);
  const status = normalizeAdminStatus(row.status);
  if (status === 'disabled') {
    return null;
  }

  return {
    rowId: normalizeString(row.id),
    role,
    status,
    permissions: normalizeAdminPermissions(row.permissions, role),
    isPrimaryOwner: role === 'primary_owner',
    source,
  };
}

async function upsertPrimaryOwnerAccess(user: User) {
  const email = normalizeEmail(user.email);
  if (!email) {
    return null;
  }

  const payload = {
    auth_user_id: user.id,
    email,
    full_name: normalizeString(user.user_metadata?.full_name) || normalizeString(user.user_metadata?.name) || 'Primary Owner',
    role_title: 'Primary Owner',
    role: 'primary_owner',
    status: 'active',
    permissions: allAdminPermissions,
    updated_at: nowIso(),
  };

  const { data, error } = await adminSupabase
    .from('owner_admin_users')
    .upsert(payload, { onConflict: 'email' })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        rowId: null,
        role: 'primary_owner',
        status: 'active',
        permissions: allAdminPermissions,
        isPrimaryOwner: true,
        source: 'primary_owner',
      } satisfies AdminAccessContext;
    }
    throw error;
  }

  return buildAdminAccessContext(isRecord(data) ? data : payload, 'primary_owner');
}

async function getAdminAccessForUser(user: User) {
  const email = normalizeEmail(user.email);
  const isPrimaryOwnerEmail = email === primaryOwnerEmail;

  if (isPrimaryOwnerEmail) {
    return upsertPrimaryOwnerAccess(user);
  }

  const byUserId = await adminSupabase.from('owner_admin_users').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (byUserId.error && isMissingRelationError(byUserId.error)) {
    const legacyAllowed =
      allowedUserIds.has(user.id) ||
      (email ? allowedEmails.has(email) : false) ||
      (process.env.NODE_ENV !== 'production' && allowedEmails.size === 0 && allowedUserIds.size === 0);

    return legacyAllowed
      ? {
          rowId: null,
          role: 'admin',
          status: 'active',
          permissions: allAdminPermissions,
          isPrimaryOwner: false,
          source: allowedUserIds.has(user.id) || (email && allowedEmails.has(email)) ? 'legacy_env' : 'development',
        } satisfies AdminAccessContext
      : null;
  }
  if (byUserId.error) {
    throw byUserId.error;
  }

  let row = isRecord(byUserId.data) ? byUserId.data : null;
  if (!row && email) {
    const byEmail = await adminSupabase.from('owner_admin_users').select('*').eq('email', email).maybeSingle();
    if (byEmail.error) {
      throw byEmail.error;
    }
    row = isRecord(byEmail.data) ? byEmail.data : null;
  }

  if (!row) {
    return null;
  }

  const updates: JsonRecord = {};
  if (!normalizeString(row.auth_user_id)) {
    updates.auth_user_id = user.id;
  }
  if (email && normalizeEmail(row.email) !== email) {
    updates.email = email;
  }
  if (normalizeAdminStatus(row.status) === 'invited') {
    updates.status = 'active';
  }
  if (Object.keys(updates).length > 0 && normalizeString(row.id)) {
    updates.updated_at = nowIso();
    const { data, error } = await adminSupabase.from('owner_admin_users').update(updates).eq('id', row.id).select('*').single();
    if (error) {
      throw error;
    }
    row = isRecord(data) ? data : { ...row, ...updates };
  }

  return buildAdminAccessContext(row, normalizeAdminRole(row.role) === 'primary_owner' ? 'primary_owner' : 'database');
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

const platformSettingSections = Object.keys(defaultPlatformSettings) as PlatformSettingsSection[];

function cloneDefaultPlatformSettings() {
  return JSON.parse(JSON.stringify(defaultPlatformSettings)) as Record<PlatformSettingsSection, any>;
}

function normalizePlatformSection(value: unknown) {
  const section = normalizeString(value) as PlatformSettingsSection | null;
  return section && platformSettingSections.includes(section) ? section : null;
}

function maskSecret(value: unknown) {
  const secret = normalizeString(value);
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function normalizePlatformSettingsSection(section: PlatformSettingsSection, incoming: unknown, current: any) {
  const value = isRecord(incoming) ? incoming : {};
  const fallback = cloneDefaultPlatformSettings()[section];

  if (section === 'pricing_plans') {
    const plans = Array.isArray(value.plans) ? value.plans : fallback.plans;
    return {
      plans: plans.map((plan: any) => ({
        id: normalizeString(plan.id) || normalizeString(plan.name)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `plan_${Date.now()}`,
        name: normalizeString(plan.name) || 'Untitled plan',
        currency: normalizeString(plan.currency) || 'INR',
        monthlyPrice: normalizeNumber(plan.monthlyPrice),
        annualPrice: normalizeNumber(plan.annualPrice),
        credits: normalizeNumber(plan.credits),
        features: Array.isArray(plan.features)
          ? plan.features.map((feature: unknown) => normalizeString(feature)).filter(Boolean)
          : [],
        isActive: Boolean(plan.isActive),
        isRecommended: Boolean(plan.isRecommended),
      })),
    };
  }

  if (section === 'feature_flags') {
    const flags = Array.isArray(value.flags) ? value.flags : fallback.flags;
    const orgOverrides = Array.isArray(value.orgOverrides) ? value.orgOverrides : [];
    return {
      flags: flags.map((flag: any) => ({
        key: normalizeString(flag.key) || normalizeString(flag.label)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `flag_${Date.now()}`,
        label: normalizeString(flag.label) || 'Untitled feature',
        description: normalizeString(flag.description) || '',
        enabled: Boolean(flag.enabled),
      })),
      orgOverrides: orgOverrides
        .map((override: any) => ({
          orgId: normalizeString(override.orgId),
          orgName: normalizeString(override.orgName) || '',
          flags: isRecord(override.flags) ? override.flags : {},
        }))
        .filter((override: any) => override.orgId),
    };
  }

  if (section === 'rate_limits') {
    const defaults = isRecord(value.default) ? value.default : fallback.default;
    const orgOverrides = Array.isArray(value.orgOverrides) ? value.orgOverrides : [];
    return {
      default: {
        messagesPerMinute: normalizeNumber(defaults.messagesPerMinute, fallback.default.messagesPerMinute),
        apiRequestsPerMinute: normalizeNumber(defaults.apiRequestsPerMinute, fallback.default.apiRequestsPerMinute),
      },
      orgOverrides: orgOverrides
        .map((override: any) => ({
          orgId: normalizeString(override.orgId),
          orgName: normalizeString(override.orgName) || '',
          messagesPerMinute: normalizeNumber(override.messagesPerMinute, fallback.default.messagesPerMinute),
          apiRequestsPerMinute: normalizeNumber(override.apiRequestsPerMinute, fallback.default.apiRequestsPerMinute),
        }))
        .filter((override: any) => override.orgId),
    };
  }

  if (section === 'api_keys') {
    const currentById = new Map((Array.isArray(current?.keys) ? current.keys : []).map((key: any) => [String(key.id), key]));
    const keys = Array.isArray(value.keys) ? value.keys : fallback.keys;
    return {
      keys: keys.map((apiKey: any) => {
        const id = normalizeString(apiKey.id) || normalizeString(apiKey.name)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `api_key_${Date.now()}`;
        const existing = (currentById.get(id) || {}) as JsonRecord;
        const nextSecret = normalizeString(apiKey.key);
        const previousSecret = normalizeString(existing.key) || '';
        const secret = nextSecret || previousSecret;
        const rotated = Boolean(nextSecret && nextSecret !== previousSecret);
        return {
          id,
          name: normalizeString(apiKey.name) || 'Untitled API key',
          scope: normalizeString(apiKey.scope) || 'general',
          key: secret,
          isActive: Boolean(apiKey.isActive),
          createdAt: normalizeString(existing.createdAt) || normalizeString(apiKey.createdAt) || nowIso(),
          updatedAt: nowIso(),
          lastRotatedAt: rotated ? nowIso() : normalizeString(existing.lastRotatedAt) || normalizeString(apiKey.lastRotatedAt),
        };
      }),
    };
  }

  if (section === 'email_templates') {
    const templates = Array.isArray(value.templates) ? value.templates : fallback.templates;
    return {
      templates: templates.map((template: any) => ({
        id: normalizeString(template.id) || normalizeString(template.name)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `template_${Date.now()}`,
        name: normalizeString(template.name) || 'Untitled template',
        subject: normalizeString(template.subject) || '',
        body: normalizeString(template.body) || '',
        enabled: Boolean(template.enabled),
        updatedAt: nowIso(),
      })),
    };
  }

  return value;
}

function redactPlatformSettingsForAdmin(settings: Record<PlatformSettingsSection, any>) {
  return {
    ...settings,
    api_keys: {
      keys: (settings.api_keys.keys || []).map((apiKey: any) => ({
        ...apiKey,
        key: '',
        maskedKey: maskSecret(apiKey.key),
      })),
    },
  };
}

async function loadPlatformSettings() {
  const settings = cloneDefaultPlatformSettings();
  const { data, error } = await adminSupabase.from('user_platform_settings').select('*');

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        settings: redactPlatformSettingsForAdmin(settings),
        rawSettings: settings,
        warning: 'Apply supabase/admin_dashboard.sql to persist User Platform Settings.',
      };
    }
    throw error;
  }

  for (const row of asRows(data)) {
    const section = normalizePlatformSection(row.section);
    if (section && isRecord(row.settings)) {
      settings[section] = normalizePlatformSettingsSection(section, row.settings, settings[section]);
    }
  }

  return {
    settings: redactPlatformSettingsForAdmin(settings),
    rawSettings: settings,
    warning: null,
  };
}

async function savePlatformSettingsSection(admin: AdminContext | undefined, section: PlatformSettingsSection, incoming: unknown) {
  const current = await loadPlatformSettings();
  const normalized = normalizePlatformSettingsSection(section, incoming, current.rawSettings[section]);
  const payload = {
    section,
    settings: normalized,
    updated_by: admin?.id || null,
    updated_at: nowIso(),
  };

  const { error } = await adminSupabase.from('user_platform_settings').upsert(payload, { onConflict: 'section' });
  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Apply supabase/admin_dashboard.sql before saving User Platform Settings.');
    }
    throw error;
  }

  await recordAdminAudit(admin, 'UPDATE_USER_PLATFORM_SETTINGS', null, { section });
  return loadPlatformSettings();
}

function buildPublicPricingPlans(settings: Record<PlatformSettingsSection, any>) {
  const plans = Array.isArray(settings.pricing_plans?.plans) ? settings.pricing_plans.plans : [];
  return plans
    .map((plan: any) => ({
      id: normalizeString(plan.id) || normalizeString(plan.name)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || '',
      name: normalizeString(plan.name) || 'Untitled plan',
      currency: normalizeString(plan.currency) || 'INR',
      monthlyPrice: normalizeNumber(plan.monthlyPrice),
      annualPrice: normalizeNumber(plan.annualPrice),
      credits: normalizeNumber(plan.credits),
      features: Array.isArray(plan.features)
        ? plan.features.map((feature: unknown) => normalizeString(feature)).filter(Boolean)
        : [],
      isActive: Boolean(plan.isActive),
      isRecommended: Boolean(plan.isRecommended),
    }))
    .filter((plan: { id: string; isActive: boolean }) => plan.id && plan.isActive);
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
      currentAccountAllowedBy: admin.access.source,
    },
    access: {
      role: admin.access.role,
      status: admin.access.status,
      permissions: admin.access.permissions,
      isPrimaryOwner: admin.access.isPrimaryOwner,
      canManageAdmins: admin.access.isPrimaryOwner,
      primaryOwnerEmail,
    },
    warning,
    generatedAt: nowIso(),
  };
}

function buildAdminUserRow(row: JsonRecord, authUser?: User | null) {
  const role = normalizeAdminRole(row.role);
  const status = normalizeAdminStatus(row.status);
  return {
    id: normalizeString(row.id) || '',
    authUserId: normalizeString(row.auth_user_id) || authUser?.id || null,
    email: normalizeEmail(row.email) || normalizeEmail(authUser?.email) || '',
    fullName:
      normalizeString(row.full_name) ||
      normalizeString(authUser?.user_metadata?.full_name) ||
      normalizeString(authUser?.user_metadata?.name) ||
      normalizeEmail(row.email)?.split('@')[0] ||
      'Admin user',
    roleTitle: normalizeString(row.role_title) || (role === 'primary_owner' ? 'Primary Owner' : 'Admin'),
    role,
    status,
    permissions: normalizeAdminPermissions(row.permissions, role),
    isPrimaryOwner: role === 'primary_owner',
    invitedBy: normalizeString(row.invited_by),
    invitedAt: normalizeString(row.invited_at),
    lastAccessAt: normalizeString(row.last_access_at),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
    authCreatedAt: authUser?.created_at || null,
    lastSignInAt: authUser?.last_sign_in_at || null,
  };
}

async function loadDashboardAdmins() {
  const { data, error } = await adminSupabase.from('owner_admin_users').select('*').order('created_at', { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) {
      return {
        admins: [] as ReturnType<typeof buildAdminUserRow>[],
        warning: 'Apply supabase/admin_dashboard.sql to persist dashboard admin access.',
      };
    }
    throw error;
  }

  const rows = asRows(data);
  const authUsers = await listAuthUsers().catch(() => [] as User[]);
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const authByEmail = new Map(authUsers.map((user) => [normalizeEmail(user.email), user]).filter(([email]) => Boolean(email)) as Array<[string, User]>);

  return {
    admins: rows.map((row) => buildAdminUserRow(row, authById.get(String(row.auth_user_id)) || authByEmail.get(String(row.email).toLowerCase()) || null)),
    warning: null,
  };
}

async function findAuthUserByEmail(email: string) {
  const users = await listAuthUsers();
  return users.find((user) => normalizeEmail(user.email) === email) || null;
}

function normalizeInvitePermissions(value: unknown) {
  const permissions = normalizeAdminPermissions(value, 'admin');
  return permissions.length > 0 ? permissions : ['command_center'] satisfies AdminPermissionKey[];
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

function normalizePaymentMethodLabel(method: unknown, cardType?: unknown) {
  const value = String(method || '').toLowerCase();
  if (value === 'upi') return 'UPI';
  if (value === 'card') {
    const type = String(cardType || '').toLowerCase();
    if (type === 'credit') return 'Credit Card';
    if (type === 'debit') return 'Debit Card';
    return 'Credit / Debit Card';
  }
  if (value === 'netbanking') return 'NetBanking';
  if (value === 'wallet') return 'Wallet';
  if (value === 'emi') return 'EMI';
  if (value === 'emandate') return 'eMandate';
  if (value === 'nach') return 'NACH';
  return value ? formatTableName(value) : 'Not available';
}

function getRazorpayAuthHeader() {
  if (!razorpayKeyId || !razorpayKeySecret) return null;
  return `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`;
}

async function fetchRazorpayJson(pathname: string, query?: Record<string, string>) {
  const auth = getRazorpayAuthHeader();
  if (!auth) {
    throw new Error('Razorpay API keys are not configured.');
  }

  const url = new URL(`https://api.razorpay.com/v1/${pathname.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      isRecord(payload) && isRecord(payload.error)
        ? normalizeString(payload.error.description) || normalizeString(payload.error.reason)
        : null;
    throw new Error(errorMessage || `Razorpay API request failed with status ${response.status}.`);
  }
  return payload;
}

function latestPaidInvoice(invoices: unknown) {
  const items = isRecord(invoices) && Array.isArray(invoices.items) ? invoices.items.filter(isRecord) : [];
  return items
    .filter((item) => normalizeString(item.payment_id))
    .sort((left, right) => normalizeNumber(right.created_at) - normalizeNumber(left.created_at))[0] || null;
}

function mapRazorpayPaymentMethod(payment: JsonRecord | null, invoice: JsonRecord | null, error?: string | null) {
  const method = normalizeString(payment?.method) || normalizeString(invoice?.payment_method);
  const card = isRecord(payment?.card) ? payment.card as JsonRecord : {};
  const upi = isRecord(payment?.upi) ? payment.upi as JsonRecord : {};
  const cardLast4 =
    normalizeString(card.last4) ||
    normalizeString(payment?.card_last4) ||
    normalizeString(payment?.card_last_four);
  const cardType = normalizeString(card.type) || normalizeString(payment?.card_type);

  return {
    method: method || null,
    label: normalizePaymentMethodLabel(method, cardType),
    cardLast4,
    cardNetwork: normalizeString(card.network),
    cardType,
    upiVpa: normalizeString(payment?.vpa) || normalizeString(upi.vpa),
    paymentId: normalizeString(payment?.id) || normalizeString(invoice?.payment_id),
    invoiceId: normalizeString(invoice?.id),
    status: normalizeString(payment?.status) || normalizeString(invoice?.status),
    error: error || null,
  };
}

async function resolveSubscriptionPaymentMethod(subscriptionId: string) {
  if (!getRazorpayAuthHeader()) {
    return mapRazorpayPaymentMethod(null, null, 'Razorpay API keys are not configured.');
  }

  try {
    const invoices = await fetchRazorpayJson('invoices', {
      subscription_id: subscriptionId,
      count: '10',
    });
    const invoice = latestPaidInvoice(invoices);
    const paymentId = normalizeString(invoice?.payment_id);
    if (!invoice || !paymentId) {
      return mapRazorpayPaymentMethod(null, invoice, 'No paid invoice payment was found for this subscription.');
    }

    const payment = await fetchRazorpayJson(`payments/${encodeURIComponent(paymentId)}`, {
      'expand[]': 'card',
    });
    return mapRazorpayPaymentMethod(isRecord(payment) ? payment : null, invoice);
  } catch (error) {
    return mapRazorpayPaymentMethod(null, null, error instanceof Error ? error.message : String(error));
  }
}

async function enrichProfilesWithPaymentMethods(profiles: JsonRecord[]) {
  const cache = new Map<string, Awaited<ReturnType<typeof resolveSubscriptionPaymentMethod>>>();
  const enriched: JsonRecord[] = [];

  for (const profile of profiles) {
    const subscriptionId = normalizeString(profile.razorpay_subscription_id);
    if (!subscriptionId) {
      enriched.push({
        ...profile,
        payment_method: mapRazorpayPaymentMethod(null, null, 'No Razorpay subscription is linked.'),
      });
      continue;
    }

    if (!cache.has(subscriptionId)) {
      cache.set(subscriptionId, await resolveSubscriptionPaymentMethod(subscriptionId));
    }

    enriched.push({
      ...profile,
      payment_method: cache.get(subscriptionId),
    });
  }

  return enriched;
}

function monthStart(offsetFromCurrent: number) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() + offsetFromCurrent);
  return date;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date) {
  return date.toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function dayStart(offsetFromCurrent: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetFromCurrent);
  return date;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function timestampFromRow(row: JsonRecord, fallbackKey = 'created_at') {
  const value = normalizeString(row[fallbackKey]) || normalizeString(row.updated_at) || normalizeString(row.created_at);
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function planMonthlyValue(row: JsonRecord) {
  const selectedPlan = String(row.selected_plan || '').toLowerCase();
  const plan = defaultPlatformSettings.pricing_plans.plans.find((item) => item.id === selectedPlan || item.name.toLowerCase() === selectedPlan);
  if (!plan) {
    return 0;
  }

  const billingCycle = String(row.billing_cycle || '').toLowerCase();
  return billingCycle.includes('annual') || billingCycle.includes('year') ? plan.annualPrice / 12 : plan.monthlyPrice;
}

function isChurnedProfile(row: JsonRecord) {
  const billingStatus = String(row.billing_status || '').toLowerCase();
  const accountStatus = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'deleted', 'churned', 'suspended'].some(
    (status) => billingStatus.includes(status) || accountStatus.includes(status),
  );
}

function isActiveProfile(row: JsonRecord) {
  const billingStatus = String(row.billing_status || '').toLowerCase();
  return !isChurnedProfile(row) && ['active', 'paid', 'trial', 'trialing'].some((status) => billingStatus.includes(status));
}

function isFailedRow(row: JsonRecord) {
  const value = [
    row.status,
    row.delivery_status,
    row.processing_status,
    row.error,
    row.error_message,
    row.failure_reason,
    row.payment_status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /fail|error|disconnect|timeout|declin|past_due|cancel/.test(value);
}

function logStatus(row: JsonRecord) {
  return (
    normalizeString(row.status) ||
    normalizeString(row.delivery_status) ||
    normalizeString(row.processing_status) ||
    normalizeString(row.payment_status) ||
    normalizeString(row.state) ||
    'recorded'
  );
}

function logErrorType(row: JsonRecord) {
  const value = [
    row.error_type,
    row.error_code,
    row.error,
    row.error_message,
    row.failure_reason,
    row.status,
    row.delivery_status,
    row.processing_status,
    row.payment_status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!value) return null;
  if (value.includes('auth') || value.includes('token') || value.includes('permission')) return 'auth';
  if (value.includes('rate') || value.includes('limit') || value.includes('quota')) return 'rate_limit';
  if (value.includes('timeout')) return 'timeout';
  if (value.includes('disconnect')) return 'disconnection';
  if (value.includes('payment') || value.includes('declin') || value.includes('past_due')) return 'payment';
  if (value.includes('webhook')) return 'webhook';
  if (value.includes('fail') || value.includes('error')) return 'error';
  return null;
}

function logDetail(row: JsonRecord) {
  return (
    normalizeString(row.error_message) ||
    normalizeString(row.failure_reason) ||
    normalizeString(row.error) ||
    normalizeString(row.message) ||
    normalizeString(row.title) ||
    null
  );
}

function logOccurredAt(row: JsonRecord) {
  return normalizeString(row.created_at) || normalizeString(row.updated_at) || nowIso();
}

function buildLogEntry(args: {
  row: JsonRecord;
  idPrefix: string;
  category: 'api' | 'error' | 'webhook' | 'message_delivery';
  source: string;
  title: string;
  fallbackOrgId?: string | null;
}) {
  const orgId = rowOwnerUserId(args.row) || normalizeString(args.row.org_id) || normalizeString(args.row.organization_id) || args.fallbackOrgId || null;
  const status = logStatus(args.row);
  const errorType = logErrorType(args.row);
  const failed = isFailedRow(args.row);
  return {
    id: normalizeString(args.row.id) || `${args.idPrefix}:${orgId || 'global'}:${logOccurredAt(args.row)}`,
    occurredAt: logOccurredAt(args.row),
    orgId,
    userId: normalizeString(args.row.user_id) || orgId,
    category: args.category,
    source: args.source,
    title: args.title,
    status,
    errorType,
    severity: failed ? 'critical' : 'info',
    detail: logDetail(args.row),
    payload: args.row,
  };
}

function organizationNameForUser(user: ReturnType<typeof buildUserRows>[number]) {
  return user.companyName || user.fullName || user.email || `Organization ${user.userId.slice(0, 8)}`;
}

function getMetadataRecord(row: JsonRecord | null | undefined) {
  return isRecord(row?.metadata) ? row.metadata as JsonRecord : {};
}

function getNestedRecord(record: JsonRecord, key: string) {
  return isRecord(record[key]) ? record[key] as JsonRecord : {};
}

function mapWhatsAppWebhookSubscription(row: JsonRecord | null | undefined) {
  const metadata = getMetadataRecord(row);
  const subscription = getNestedRecord(metadata, 'webhookSubscription');
  const entries = Array.isArray(subscription.entries) ? subscription.entries : [];
  return {
    isSubscribed: subscription.isSubscribed === true,
    callbackUrl: normalizeString(subscription.overrideCallbackUri) || normalizeString(subscription.callbackUrl),
    subscribedAt: normalizeString(subscription.subscribedAt),
    unsubscribedAt: normalizeString(subscription.unsubscribedAt),
    lastCheckedAt: normalizeString(subscription.lastCheckedAt),
    lastError: normalizeString(subscription.lastError),
    entries,
  };
}

function mapWhatsAppTwoStepVerification(row: JsonRecord | null | undefined) {
  const metadata = getMetadataRecord(row);
  const twoStep = getNestedRecord(metadata, 'twoStepVerification');
  const senderRegistration = getNestedRecord(metadata, 'senderRegistration');
  const enabledAt = normalizeString(twoStep.enabledAt) || normalizeString(senderRegistration.registeredAt);
  const disabledAt = normalizeString(twoStep.disabledAt) || normalizeString(senderRegistration.deregisteredAt);
  const lastPinUpdatedAt = normalizeString(twoStep.lastPinUpdatedAt) || enabledAt;
  const liveIsEnabled =
    typeof twoStep.isPinEnabled === 'boolean'
      ? twoStep.isPinEnabled
      : normalizeString(twoStep.codeVerificationStatus)?.toUpperCase() === 'VERIFIED'
        ? true
        : null;
  const enabledAtMs = Date.parse(String(enabledAt || ''));
  const disabledAtMs = Date.parse(String(disabledAt || ''));
  const inferredEnabled =
    Boolean(enabledAt) &&
    (!Number.isFinite(disabledAtMs) || !Number.isFinite(enabledAtMs) || enabledAtMs >= disabledAtMs);

  return {
    isEnabled: liveIsEnabled ?? inferredEnabled,
    enabledAt,
    disabledAt,
    lastPinUpdatedAt,
    liveStatusCheckedAt: normalizeString(twoStep.liveStatusCheckedAt),
    codeVerificationStatus: normalizeString(twoStep.codeVerificationStatus),
  };
}

function mapWhatsAppVerificationCodeRequest(row: JsonRecord | null | undefined) {
  const request = getNestedRecord(getMetadataRecord(row), 'verificationCodeRequest');
  return {
    lastRequestedAt: normalizeString(request.lastRequestedAt),
    lastVerifiedAt: normalizeString(request.lastVerifiedAt),
    codeMethod: normalizeString(request.codeMethod),
    language: normalizeString(request.language),
    verifiedPhoneNumberId: normalizeString(request.verifiedPhoneNumberId),
  };
}

function mapWhatsAppSenderRegistration(row: JsonRecord | null | undefined) {
  const senderRegistration = getNestedRecord(getMetadataRecord(row), 'senderRegistration');
  return {
    registeredAt: normalizeString(senderRegistration.registeredAt),
    deregisteredAt: normalizeString(senderRegistration.deregisteredAt),
  };
}

function mapWhatsAppDisplayName(row: JsonRecord | null | undefined) {
  const metadata = getMetadataRecord(row);
  const displayNameRequest = getNestedRecord(metadata, 'displayNameRequest');
  const displayNameApproval = getNestedRecord(metadata, 'displayNameApproval');
  return {
    requestedName: normalizeString(displayNameRequest.requestedName),
    requestedAt: normalizeString(displayNameRequest.requestedAt),
    status: normalizeString(displayNameApproval.status) || normalizeString(displayNameRequest.status) || normalizeString(row?.name_status),
    approvedAt: normalizeString(displayNameApproval.approvedAt) || normalizeString(displayNameRequest.approvedAt),
    lastCheckedAt: normalizeString(displayNameApproval.lastCheckedAt) || normalizeString(displayNameRequest.lastCheckedAt),
  };
}

function mapWhatsAppChannel(row: JsonRecord | null | undefined) {
  if (!row) return null;
  return {
    id: normalizeString(row.id) || '',
    userId: normalizeString(row.user_id) || '',
    setupType: normalizeString(row.setup_type),
    connectionMethod: normalizeString(row.connection_method),
    status: normalizeString(row.status) || 'connected',
    wabaId: normalizeString(row.waba_id),
    phoneNumberId: normalizeString(row.phone_number_id),
    displayPhoneNumber: normalizeString(row.display_phone_number),
    verifiedName: normalizeString(row.verified_name),
    qualityRating: normalizeString(row.quality_rating),
    messagingLimitTier: normalizeString(row.messaging_limit_tier),
    businessAccountName: normalizeString(row.business_account_name),
    accessTokenLast4: normalizeString(row.access_token_last4),
    connectedAt: normalizeString(row.connected_at) || normalizeString(row.created_at),
    lastSyncedAt: normalizeString(row.last_synced_at),
    updatedAt: normalizeString(row.updated_at),
    webhookSubscription: mapWhatsAppWebhookSubscription(row),
    twoStepVerification: mapWhatsAppTwoStepVerification(row),
    verificationCodeRequest: mapWhatsAppVerificationCodeRequest(row),
    senderRegistration: mapWhatsAppSenderRegistration(row),
    displayName: mapWhatsAppDisplayName(row),
    metadata: getMetadataRecord(row),
  };
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
    const profile = core.profiles.find((row) => row.user_id === ownerUserId);
    const whatsappChannel = core.metaChannels.find((row) => row.user_id === ownerUserId);
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
      orgName: normalizeString(profile?.company_name) || organizationNameForUser(user),
      companyName: normalizeString(profile?.company_name),
      companyWebsite: normalizeString(profile?.company_website),
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
      whatsapp: mapWhatsAppChannel(whatsappChannel),
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

function metaErrorMessage(payload: unknown) {
  const payloadRecord = isRecord(payload) ? payload : {};
  if (isRecord(payloadRecord.error)) {
    const error = payloadRecord.error as JsonRecord;
    return (
      normalizeString(error.error_user_msg) ||
      normalizeString(error.message) ||
      normalizeString(isRecord(error.error_data) ? error.error_data.details : null)
    );
  }
  return null;
}

async function metaRequest<T>(args: {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string>;
  body?: JsonRecord;
}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${String(args.path).replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(args.query || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: args.method || 'GET',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const payload = await response.json().catch(() => null) as T;

  if (!response.ok) {
    throw new Error(metaErrorMessage(payload) || `Meta Graph API request failed with status ${response.status}.`);
  }

  return payload;
}

async function getOrgWhatsAppChannel(orgId: string) {
  const { data, error } = await adminSupabase.from('meta_channels').select('*').eq('user_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This organization does not have a WhatsApp Business number linked.');
  const row = data as JsonRecord;
  return {
    row,
    accessToken: decryptAccessToken(row.access_token_ciphertext),
  };
}

function getAdminWebhookCallbackUrl(req: Request) {
  const baseUrl = clientApiBaseUrl || `${req.protocol}://${req.get('host') || ''}/api`;
  return `${baseUrl.replace(/\/$/, '')}/meta/webhook`;
}

function resolveWhatsAppWebhookSubscriptionEntry(entries: JsonRecord[]) {
  return entries.find((entry) => {
    const callbackUrl = normalizeString(entry.callback_url) || normalizeString(entry.callbackUrl);
    const fields = normalizeStringArray(entry.subscribed_fields || entry.fields);
    return Boolean(callbackUrl || fields.some((field) => field.toLowerCase().includes('message')));
  }) || null;
}

async function persistWhatsAppWebhookSubscriptionStatus(args: {
  orgId: string;
  row: JsonRecord;
  req: Request;
  entries: JsonRecord[];
  isSubscribed: boolean;
  lastError?: string | null;
}) {
  const timestamp = nowIso();
  const metadata = getMetadataRecord(args.row);
  const existing = getNestedRecord(metadata, 'webhookSubscription');
  const callbackUrl = getAdminWebhookCallbackUrl(args.req);
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      status: args.lastError ? 'error' : 'connected',
      metadata: {
        ...metadata,
        webhookSubscription: {
          ...existing,
          isSubscribed: args.isSubscribed,
          callbackUrl,
          entries: args.entries,
          subscribedAt: args.isSubscribed ? normalizeString(existing.subscribedAt) || timestamp : null,
          unsubscribedAt: args.isSubscribed ? null : timestamp,
          lastCheckedAt: timestamp,
          lastError: args.lastError || null,
        },
      },
      last_synced_at: timestamp,
      updated_at: timestamp,
    })
    .eq('user_id', args.orgId)
    .eq('id', args.row.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as JsonRecord;
}

async function listWhatsAppSubscribedApps(accessToken: string, wabaId: string) {
  return metaRequest<{ data?: JsonRecord[] }>({ accessToken, path: `${wabaId}/subscribed_apps` });
}

async function subscribeWhatsAppWebhook(accessToken: string, wabaId: string, req: Request) {
  if (!metaWebhookVerifyToken) {
    throw new Error('META_WEBHOOK_VERIFY_TOKEN must be configured before WhatsApp webhooks can be activated.');
  }
  await metaRequest({
    accessToken,
    path: `${wabaId}/subscribed_apps`,
    method: 'POST',
    body: {
      override_callback_uri: getAdminWebhookCallbackUrl(req),
      verify_token: metaWebhookVerifyToken,
    },
  });
  return listWhatsAppSubscribedApps(accessToken, wabaId);
}

async function unsubscribeWhatsAppWebhook(accessToken: string, wabaId: string) {
  return metaRequest({ accessToken, path: `${wabaId}/subscribed_apps`, method: 'DELETE' });
}

async function runWhatsAppWebhookAction(orgId: string, action: string, req: Request) {
  const { row, accessToken } = await getOrgWhatsAppChannel(orgId);
  const wabaId = normalizeString(row.waba_id);
  if (!wabaId) throw new Error('This WhatsApp channel is missing its WABA ID.');

  if (action === 'check_webhook') {
    const subscriptions = await listWhatsAppSubscribedApps(accessToken, wabaId);
    const entries = Array.isArray(subscriptions.data) ? subscriptions.data.filter(isRecord) : [];
    return persistWhatsAppWebhookSubscriptionStatus({
      orgId,
      row,
      req,
      entries,
      isSubscribed: Boolean(resolveWhatsAppWebhookSubscriptionEntry(entries)),
    });
  }

  if (action === 'activate_webhook') {
    try {
      const subscriptions = await subscribeWhatsAppWebhook(accessToken, wabaId, req);
      const entries = Array.isArray(subscriptions.data) ? subscriptions.data.filter(isRecord) : [];
      return persistWhatsAppWebhookSubscriptionStatus({ orgId, row, req, entries, isSubscribed: true });
    } catch (error) {
      await persistWhatsAppWebhookSubscriptionStatus({
        orgId,
        row,
        req,
        entries: [],
        isSubscribed: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  if (action === 'deactivate_webhook' || action === 'unsubscribe_webhook') {
    await unsubscribeWhatsAppWebhook(accessToken, wabaId);
    return persistWhatsAppWebhookSubscriptionStatus({ orgId, row, req, entries: [], isSubscribed: false });
  }

  throw new Error('Unsupported WhatsApp webhook action.');
}

async function requestWhatsAppVerificationCode(orgId: string, codeMethod: 'SMS' | 'VOICE', language: string) {
  const { row, accessToken } = await getOrgWhatsAppChannel(orgId);
  const phoneNumberId = normalizeString(row.phone_number_id);
  if (!phoneNumberId) throw new Error('This WhatsApp channel is missing its phone number ID.');
  await metaRequest({
    accessToken,
    path: `${phoneNumberId}/request_code`,
    method: 'POST',
    body: {
      code_method: codeMethod,
      language,
    },
  });

  const timestamp = nowIso();
  const metadata = getMetadataRecord(row);
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...metadata,
        verificationCodeRequest: {
          lastRequestedAt: timestamp,
          codeMethod,
          language,
        },
      },
      updated_at: timestamp,
    })
    .eq('user_id', orgId)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as JsonRecord;
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
      label: 'Primary owner',
      ok: Boolean(primaryOwnerEmail),
      detail: primaryOwnerEmail,
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
    'meta_ads_integrations',
    'meta_lead_capture_configs',
    'meta_flows',
    'flow_submissions',
    'meta_conversational_automation_configs',
    'automation_rules',
    'conversation_threads',
    'conversation_messages',
    'call_logs',
    'call_sessions',
    'meta_lead_capture_events',
    'whatsapp_payment_configuration_events',
    'credit_ledger',
    'email_connections',
    'email_templates',
    'email_campaigns',
    'woocommerce_connections',
    'developer_api_credentials',
    'developer_webhook_endpoints',
    'workspace_team_members',
    'user_notifications',
    'user_notification_preferences',
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
    metaAdsIntegrations,
    metaLeadCaptureConfigs,
    metaFlows,
    flowSubmissions,
    conversationalAutomationConfigs,
    automationRules,
    threads,
    messages,
    callLogs,
    callSessions,
    leadEvents,
    paymentEvents,
    emailCampaigns,
    creditLedger,
    notifications,
    notificationPreferences,
    emailConnections,
    emailTemplates,
    woocommerceConnections,
    developerApiCredentials,
    developerWebhookEndpoints,
    workspaceTeamMembers,
    templates,
  ] = await Promise.all([
    safeSelect('app_profiles', '*', (query: any) => query.order('created_at', { ascending: false }).limit(1000)),
    safeSelect('meta_channels', '*'),
    safeSelect('instagram_channels', '*'),
    safeSelect('messenger_channels', '*'),
    safeSelect('meta_ads_integrations', '*'),
    safeSelect('meta_lead_capture_configs', '*'),
    safeSelect('meta_flows', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('flow_submissions', '*', (query: any) => query.order('submitted_at', { ascending: false }).limit(1000)),
    safeSelect('meta_conversational_automation_configs', '*'),
    safeSelect('automation_rules', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
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
    safeSelect('user_notification_preferences', '*'),
    safeSelect('email_connections', '*'),
    safeSelect('email_templates', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('woocommerce_connections', '*'),
    safeSelect('developer_api_credentials', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('developer_webhook_endpoints', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('workspace_team_members', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
    safeSelect('meta_templates', '*', (query: any) => query.order('updated_at', { ascending: false }).limit(1000)),
  ]);

  return {
    profiles: profiles.rows,
    metaChannels: metaChannels.rows,
    instagramChannels: instagramChannels.rows,
    messengerChannels: messengerChannels.rows,
    metaAdsIntegrations: metaAdsIntegrations.rows,
    metaLeadCaptureConfigs: metaLeadCaptureConfigs.rows,
    metaFlows: metaFlows.rows,
    flowSubmissions: flowSubmissions.rows,
    conversationalAutomationConfigs: conversationalAutomationConfigs.rows,
    automationRules: automationRules.rows,
    threads: threads.rows,
    messages: messages.rows,
    callLogs: callLogs.rows,
    callSessions: callSessions.rows,
    leadEvents: leadEvents.rows,
    paymentEvents: paymentEvents.rows,
    emailCampaigns: emailCampaigns.rows,
    creditLedger: creditLedger.rows,
    notifications: notifications.rows,
    notificationPreferences: notificationPreferences.rows,
    emailConnections: emailConnections.rows,
    emailTemplates: emailTemplates.rows,
    woocommerceConnections: woocommerceConnections.rows,
    developerApiCredentials: developerApiCredentials.rows,
    developerWebhookEndpoints: developerWebhookEndpoints.rows,
    workspaceTeamMembers: workspaceTeamMembers.rows,
    templates: templates.rows,
    errors: [
      profiles.error,
      metaChannels.error,
      instagramChannels.error,
      messengerChannels.error,
      metaAdsIntegrations.error,
      metaLeadCaptureConfigs.error,
      metaFlows.error,
      flowSubmissions.error,
      conversationalAutomationConfigs.error,
      automationRules.error,
      threads.error,
      messages.error,
      callLogs.error,
      callSessions.error,
      leadEvents.error,
      paymentEvents.error,
      emailCampaigns.error,
      creditLedger.error,
      notifications.error,
      notificationPreferences.error,
      emailConnections.error,
      emailTemplates.error,
      woocommerceConnections.error,
      developerApiCredentials.error,
      developerWebhookEndpoints.error,
      workspaceTeamMembers.error,
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
    ...core.flowSubmissions.slice(0, 20).map((row) => mapLivePayload('flow_submissions', { eventType: 'INSERT', new: row })),
    ...core.emailCampaigns.slice(0, 20).map((row) => mapLivePayload('email_campaigns', { eventType: 'INSERT', new: row })),
    ...core.automationRules.slice(0, 20).map((row) => mapLivePayload('automation_rules', { eventType: 'UPDATE', new: row })),
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
  const organizations = buildOrganizationRows(core, authUsers);
  const totalCredits = core.creditLedger.reduce((total, row) => {
    const amount = normalizeNumber(row.amount);
    return row.type === 'deduction' ? total - amount : total + amount;
  }, 0);
  const paidProfiles = core.profiles.filter((row) => ['active', 'paid'].includes(String(row.billing_status || '').toLowerCase()));
  const trials = core.profiles.filter((row) => String(row.billing_status || '').toLowerCase().includes('trial'));
  const connectedChannels = core.metaChannels.length + core.instagramChannels.length + core.messengerChannels.length;
  const churnedProfiles = core.profiles.filter(isChurnedProfile);
  const activeProfiles = core.profiles.filter(isActiveProfile);
  const monthlyRecurringRevenue = core.profiles
    .filter((row) => !isChurnedProfile(row))
    .reduce((total, row) => total + planMonthlyValue(row), 0);
  const churnRateDenominator = activeProfiles.length + churnedProfiles.length;
  const churnRate = churnRateDenominator > 0 ? (churnedProfiles.length / churnRateDenominator) * 100 : 0;
  const activeCalls = core.callSessions.filter((row) => {
    const state = String(row.state || '').toLowerCase();
    return state && !['ended', 'failed', 'rejected', 'timeout'].includes(state);
  });

  const planBreakdown = core.profiles.reduce<Record<string, number>>((acc, row) => {
    const key = normalizeString(row.selected_plan) || 'No plan';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const months = Array.from({ length: 6 }, (_value, index) => monthStart(index - 5));
  const customerMovement = months.map((date) => {
    const key = monthKey(date);
    const newCustomers = core.profiles.filter((row) => {
      const createdAt = timestampFromRow(row, 'created_at');
      return createdAt ? monthKey(createdAt) === key : false;
    }).length;
    const churnedCustomers = core.profiles.filter((row) => {
      const updatedAt = timestampFromRow(row, 'updated_at');
      return isChurnedProfile(row) && updatedAt ? monthKey(updatedAt) === key : false;
    }).length;
    return {
      label: monthLabel(date),
      newCustomers,
      churnedCustomers,
    };
  });

  const days = Array.from({ length: 7 }, (_value, index) => dayStart(index - 6));
  const messagesByDay = new Map(days.map((date) => [dayKey(date), 0]));
  for (const row of core.messages) {
    const date = timestampFromRow(row);
    if (!date) continue;
    const key = dayKey(date);
    if (messagesByDay.has(key)) {
      messagesByDay.set(key, (messagesByDay.get(key) || 0) + 1);
    }
  }

  const failedApiCalls = [...core.leadEvents, ...core.paymentEvents].filter(isFailedRow).length + (health.clientApi && !health.clientApi.ok ? 1 : 0);
  const whatsappDisconnections = core.metaChannels.filter((row) => {
    const status = String(row.status || row.connection_status || '').toLowerCase();
    return status && !['active', 'connected', 'approved', 'verified'].some((item) => status.includes(item));
  }).length;
  const paymentFailures = core.paymentEvents.filter(isFailedRow).length;
  const totalApiSignals = core.leadEvents.length + core.paymentEvents.length;
  const highErrorRate = totalApiSignals > 0 ? (failedApiCalls / totalApiSignals) * 100 : 0;

  return {
    generatedAt: nowIso(),
    metrics: {
      totalOrganizations: organizations.length,
      activeOrganizations: organizations.filter((organization) =>
        ['active', 'paid', 'trialing', 'trial'].some((status) => String(organization.status || '').toLowerCase().includes(status)),
      ).length,
      totalUsers: Math.max(authUsers.length, core.profiles.length),
      workspaces: core.profiles.length,
      paidWorkspaces: paidProfiles.length,
      trialWorkspaces: trials.length,
      connectedChannels,
      conversations: core.threads.length,
      messagesSent: core.messages.length,
      messages24h: core.messages.filter((row) => isRecent(row.created_at, 24)).length,
      calls24h: core.callLogs.filter((row) => isRecent(row.created_at, 24)).length,
      activeCalls: activeCalls.length,
      leadWebhooks24h: core.leadEvents.filter((row) => isRecent(row.created_at, 24)).length,
      emailCampaigns24h: core.emailCampaigns.filter((row) => isRecent(row.created_at, 24)).length,
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100,
      churnRate: Math.round(churnRate * 100) / 100,
      totalCreditBalance: Math.round(totalCredits * 100) / 100,
    },
    charts: {
      revenueGrowth: months.map((date) => ({
        label: monthLabel(date),
        value:
          Math.round(
            core.profiles
              .filter((row) => {
                const createdAt = timestampFromRow(row, 'created_at');
                const updatedAt = timestampFromRow(row, 'updated_at');
                const monthEnd = new Date(date);
                monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
                const wasCreated = createdAt ? createdAt < monthEnd : true;
                const wasChurned = isChurnedProfile(row) && updatedAt ? updatedAt < monthEnd : isChurnedProfile(row);
                return wasCreated && !wasChurned;
              })
              .reduce((total, row) => total + planMonthlyValue(row), 0) * 100,
          ) / 100,
      })),
      customerMovement,
      messageVolume: days.map((date) => ({
        label: dayLabel(date),
        value: messagesByDay.get(dayKey(date)) || 0,
      })),
      channelUsage: [
        { label: 'WhatsApp', value: core.metaChannels.length },
        { label: 'Instagram', value: core.instagramChannels.length },
        { label: 'Email', value: Math.max(core.emailConnections.length, core.emailCampaigns.length) },
      ],
    },
    alerts: [
      {
        key: 'failed_api_calls',
        label: 'Failed API calls',
        value: failedApiCalls,
        severity: failedApiCalls > 0 ? 'critical' : 'success',
        detail: health.clientApi && !health.clientApi.ok ? 'Client API health check is failing.' : 'Webhook and API error signals.',
      },
      {
        key: 'whatsapp_disconnections',
        label: 'WhatsApp disconnections',
        value: whatsappDisconnections,
        severity: whatsappDisconnections > 0 ? 'warning' : 'success',
        detail: 'WhatsApp channels not reporting a connected status.',
      },
      {
        key: 'high_error_rates',
        label: 'High error rates',
        value: Math.round(highErrorRate * 100) / 100,
        suffix: '%',
        severity: highErrorRate >= 10 ? 'critical' : highErrorRate > 0 ? 'warning' : 'success',
        detail: `${failedApiCalls} failed signals across ${Math.max(totalApiSignals, 0)} recent webhook/API events.`,
      },
      {
        key: 'payment_failures',
        label: 'Payment failures',
        value: paymentFailures,
        severity: paymentFailures > 0 ? 'critical' : 'success',
        detail: 'Failed, declined, or past-due payment events.',
      },
    ],
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

function sortLogs<T>(logs: T[]) {
  return logs.sort((left, right) => Date.parse(String((right as any).occurredAt)) - Date.parse(String((left as any).occurredAt)));
}

function buildLogsMonitoring(core: Awaited<ReturnType<typeof loadCoreData>>, health: ReturnType<typeof summarizeHealth>) {
  const apiLogs = sortLogs([
    ...core.leadEvents.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'lead-api',
        category: 'api',
        source: 'Meta Lead API',
        title: 'Meta lead capture API event',
      }),
    ),
    ...core.paymentEvents.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'payment-api',
        category: 'api',
        source: 'WhatsApp Payments API',
        title: 'WhatsApp payment API event',
      }),
    ),
    ...core.callSessions.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'call-api',
        category: 'api',
        source: 'Calling API',
        title: 'Call session API event',
      }),
    ),
  ]).slice(0, 500);

  const webhookLogs = sortLogs([
    ...core.leadEvents.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'lead-webhook',
        category: 'webhook',
        source: 'Meta Lead Webhook',
        title: 'Lead webhook event',
      }),
    ),
    ...core.paymentEvents.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'payment-webhook',
        category: 'webhook',
        source: 'WhatsApp Webhook',
        title: 'Payment webhook event',
      }),
    ),
    ...recentLiveEvents
      .filter((event) => event.table?.includes('webhook') || event.table === 'conversation_messages' || event.table === 'call_sessions')
      .map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        orgId: event.userId || null,
        userId: event.userId || null,
        category: 'webhook' as const,
        source: event.source,
        title: event.title,
        status: event.status || event.eventType,
        errorType: event.severity === 'critical' ? 'error' : null,
        severity: event.severity,
        detail: event.description || null,
        payload: event.payload || event,
      })),
  ]).slice(0, 500);

  const messageDeliveryLogs = sortLogs(
    core.messages.map((row) =>
      buildLogEntry({
        row,
        idPrefix: 'message-delivery',
        category: 'message_delivery',
        source: 'Messaging',
        title: `${normalizeString(row.direction) || 'Message'} delivery event`,
      }),
    ),
  ).slice(0, 500);

  const errorLogs = sortLogs([
    ...apiLogs.filter((log) => log.errorType || log.severity === 'critical').map((log) => ({ ...log, category: 'error' as const })),
    ...webhookLogs.filter((log) => log.errorType || log.severity === 'critical').map((log) => ({ ...log, category: 'error' as const })),
    ...messageDeliveryLogs.filter((log) => log.errorType || log.severity === 'critical').map((log) => ({ ...log, category: 'error' as const })),
    ...core.errors.map((error, index) => ({
      id: `server-error:${index}:${nowIso()}`,
      occurredAt: nowIso(),
      orgId: null,
      userId: null,
      category: 'error' as const,
      source: 'Admin API',
      title: 'Data load warning',
      status: 'warning',
      errorType: 'server',
      severity: 'warning' as const,
      detail: error,
      payload: { error },
    })),
    ...(health.clientApi && !health.clientApi.ok
      ? [
          {
            id: `client-api-health:${health.clientApi.checkedAt}`,
            occurredAt: health.clientApi.checkedAt,
            orgId: null,
            userId: null,
            category: 'error' as const,
            source: 'Client API health',
            title: 'Client API health check failed',
            status: String(health.clientApi.status || 'failed'),
            errorType: 'api_health',
            severity: 'critical' as const,
            detail: health.clientApi.body || 'Client API did not return a healthy response.',
            payload: health.clientApi,
          },
        ]
      : []),
  ]).slice(0, 500);

  return {
    generatedAt: nowIso(),
    apiLogs,
    errorLogs,
    webhookLogs,
    messageDeliveryLogs,
    errorTypes: [...new Set(errorLogs.map((log) => log.errorType).filter(Boolean))].sort(),
  };
}

function integrationSeverity(total: number, unhealthy: number) {
  if (total === 0) return 'warning' as const;
  if (unhealthy === 0) return 'success' as const;
  return unhealthy >= total ? 'critical' as const : 'warning' as const;
}

function latestTimestamp(rows: JsonRecord[]) {
  const timestamps = rows
    .map((row) => timestampFromRow(row, 'updated_at') || timestampFromRow(row, 'created_at'))
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime());
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function buildGlobalIntegrations(core: Awaited<ReturnType<typeof loadCoreData>>, clientHealth: JsonRecord | null) {
  const whatsappUnhealthy = core.metaChannels.filter((row) => {
    const status = String(row.status || row.connection_status || '').toLowerCase();
    return status && !['active', 'connected', 'approved', 'verified'].some((item) => status.includes(item));
  }).length;
  const instagramUnhealthy = core.instagramChannels.filter((row) => {
    const status = String(row.status || row.connection_status || '').toLowerCase();
    return status && !['active', 'connected', 'approved', 'verified'].some((item) => status.includes(item));
  }).length;
  const emailUnhealthy = core.emailConnections.filter((row) => {
    const status = String(row.status || row.connection_status || '').toLowerCase();
    return status && !['active', 'connected', 'verified'].some((item) => status.includes(item));
  }).length;
  const failedEmailCampaigns = core.emailCampaigns.filter(isFailedRow).length;
  const clientApiHealthy = Boolean(clientHealth?.ok);

  return {
    generatedAt: nowIso(),
    integrations: [
      {
        key: 'whatsapp',
        label: 'WhatsApp API Health',
        status: whatsappUnhealthy === 0 && core.metaChannels.length > 0 ? 'healthy' : core.metaChannels.length === 0 ? 'not configured' : 'degraded',
        severity: integrationSeverity(core.metaChannels.length, whatsappUnhealthy),
        summary: `${core.metaChannels.length - whatsappUnhealthy}/${core.metaChannels.length} WhatsApp channels healthy`,
        lastCheckedAt: latestTimestamp(core.metaChannels) || nowIso(),
        metrics: [
          { label: 'Channels', value: core.metaChannels.length },
          { label: 'Disconnected', value: whatsappUnhealthy },
          { label: 'Webhook events', value: core.paymentEvents.length + core.leadEvents.length },
        ],
      },
      {
        key: 'instagram',
        label: 'Instagram API Status',
        status: instagramUnhealthy === 0 && core.instagramChannels.length > 0 ? 'healthy' : core.instagramChannels.length === 0 ? 'not configured' : 'degraded',
        severity: integrationSeverity(core.instagramChannels.length, instagramUnhealthy),
        summary: `${core.instagramChannels.length - instagramUnhealthy}/${core.instagramChannels.length} Instagram channels healthy`,
        lastCheckedAt: latestTimestamp(core.instagramChannels) || nowIso(),
        metrics: [
          { label: 'Channels', value: core.instagramChannels.length },
          { label: 'Disconnected', value: instagramUnhealthy },
          { label: 'API health', value: clientApiHealthy ? 1 : 0 },
        ],
      },
      {
        key: 'email',
        label: 'Email Service Status',
        status:
          emailUnhealthy === 0 && failedEmailCampaigns === 0 && (core.emailConnections.length > 0 || core.emailCampaigns.length > 0)
            ? 'healthy'
            : core.emailConnections.length === 0 && core.emailCampaigns.length === 0
              ? 'not configured'
              : 'degraded',
        severity: integrationSeverity(Math.max(core.emailConnections.length + core.emailCampaigns.length, 1), emailUnhealthy + failedEmailCampaigns),
        summary: `${core.emailCampaigns.length} campaigns, ${failedEmailCampaigns} failed signals`,
        lastCheckedAt: latestTimestamp([...core.emailConnections, ...core.emailCampaigns]) || nowIso(),
        metrics: [
          { label: 'Connections', value: core.emailConnections.length },
          { label: 'Campaigns', value: core.emailCampaigns.length },
          { label: 'Failures', value: failedEmailCampaigns },
        ],
      },
    ],
    clientApi: clientHealth,
  };
}

const clientFeatureCatalog: Record<
  ClientFeatureKey,
  {
    label: string;
    category: string;
    description: string;
    route: string;
  }
> = {
  whatsapp: {
    label: 'WhatsApp Channel',
    category: 'Channels',
    description: 'WhatsApp inbox, templates, calls, business profile, commerce, and webhook state.',
    route: '/dashboard/channels',
  },
  instagram: {
    label: 'Instagram Inbox',
    category: 'Channels',
    description: 'Instagram business login, DM inbox connection, and Page webhook state.',
    route: '/dashboard/connections?integration=instagram',
  },
  messenger: {
    label: 'Messenger Inbox',
    category: 'Channels',
    description: 'Facebook Page Messenger connection and subscribed webhook fields.',
    route: '/dashboard/connections?integration=messenger',
  },
  meta_ads: {
    label: 'Meta Ads Manager',
    category: 'Campaigns',
    description: 'Meta Ads Page/ad-account connection used by campaign manager and media library.',
    route: '/dashboard/ads/meta-ads-manager',
  },
  meta_lead_capture: {
    label: 'Meta Lead Capture',
    category: 'CRM',
    description: 'Page/form lead ingestion configuration and lead webhook processing.',
    route: '/dashboard/connections?integration=meta-lead-capture',
  },
  whatsapp_payments: {
    label: 'WhatsApp Payments',
    category: 'Commerce',
    description: 'Payment configuration update events and provider setup signals.',
    route: '/dashboard/connections?integration=whatsapp-payments',
  },
  woocommerce: {
    label: 'WooCommerce',
    category: 'Commerce',
    description: 'WooCommerce store connection, webhook secret, and automated order messages.',
    route: '/dashboard/connections?integration=woocommerce',
  },
  email: {
    label: 'Email Inbox',
    category: 'Email',
    description: 'SMTP/IMAP mailbox connection used by email inbox and email campaign sending.',
    route: '/dashboard/inbox/email',
  },
  email_templates: {
    label: 'Email Templates',
    category: 'Email',
    description: 'Workspace email templates used by the template builder and campaigns.',
    route: '/dashboard/emails/template-builder',
  },
  whatsapp_flows: {
    label: 'WhatsApp Flows',
    category: 'Automation',
    description: 'Flow definitions, publish state, previews, and captured flow submissions.',
    route: '/dashboard/automations/flows',
  },
  automations: {
    label: 'Automation Rules',
    category: 'Automation',
    description: 'Keyword triggers, flow actions, and conversational automation commands.',
    route: '/dashboard/automations/triggers',
  },
  developer_tools: {
    label: 'Developer Tools',
    category: 'Developer',
    description: 'Developer API credentials, webhook endpoints, and delivery state.',
    route: '/dashboard/developer/api',
  },
  workspace_team: {
    label: 'Workspace Team',
    category: 'Workspace',
    description: 'Invited and active team members for each customer workspace.',
    route: '/dashboard/settings',
  },
  notifications: {
    label: 'Notification Preferences',
    category: 'Workspace',
    description: 'Per-workspace notification channels, sound settings, and alert preferences.',
    route: '/dashboard/settings',
  },
};

const clientFeatureKeys = Object.keys(clientFeatureCatalog) as ClientFeatureKey[];

const clientFeatureStatusControls: Partial<
  Record<ClientFeatureKey, { table: string; statuses: string[]; userColumn?: string }>
> = {
  whatsapp: { table: 'meta_channels', statuses: ['connected', 'error', 'disconnected'] },
  instagram: { table: 'instagram_channels', statuses: ['connected', 'error', 'disconnected'] },
  messenger: { table: 'messenger_channels', statuses: ['connected', 'error', 'disconnected'] },
  meta_ads: { table: 'meta_ads_integrations', statuses: ['ready', 'draft', 'error', 'disabled'] },
  meta_lead_capture: { table: 'meta_lead_capture_configs', statuses: ['active', 'draft', 'error', 'disabled'] },
  email: { table: 'email_connections', statuses: ['connected', 'error', 'disconnected'] },
  woocommerce: { table: 'woocommerce_connections', statuses: ['connected', 'error', 'disconnected'] },
  notifications: { table: 'user_notification_preferences', statuses: ['enabled', 'disabled'] },
};

function normalizeClientFeatureKey(value: unknown): ClientFeatureKey | null {
  const key = normalizeString(value) as ClientFeatureKey | null;
  return key && clientFeatureKeys.includes(key) ? key : null;
}

function groupRowsByOwner(rows: JsonRecord[], ownerResolver: (row: JsonRecord) => string | null = rowOwnerUserId) {
  const groups = new Map<string, JsonRecord[]>();
  for (const row of rows) {
    const ownerId = ownerResolver(row);
    if (!ownerId) continue;
    groups.set(ownerId, [...(groups.get(ownerId) || []), row]);
  }
  return groups;
}

function collectGroupOwnerIds(...groups: Array<Map<string, JsonRecord[]>>) {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const id of group.keys()) {
      ids.add(id);
    }
  }
  return [...ids];
}

function getWorkspaceIdentity(
  userId: string,
  profileById: Map<string, JsonRecord>,
  authById: Map<string, User>,
) {
  const profile = profileById.get(userId);
  const authUser = authById.get(userId);
  return {
    organizationName:
      normalizeString(profile?.company_name) ||
      normalizeString(profile?.full_name) ||
      normalizeString(authUser?.email) ||
      compactUserId(userId),
    ownerName: userDisplayName(profile, authUser),
    ownerEmail: normalizeString(profile?.email) || authUser?.email || null,
  };
}

function compactUserId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function getFeatureSeverity(status: unknown, rows: JsonRecord[] = []): LivePayload['severity'] {
  const text = [
    status,
    ...rows.flatMap((row) => [
      row.status,
      row.processing_status,
      row.last_error,
      row.error_message,
      row.webhook_last_error,
      row.failure_reason,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/fail|error|disconnect|revoked|rejected|timeout|declin|past_due|cancel/.test(text)) {
    return 'critical';
  }

  if (/draft|pending|paused|disabled|inactive|missing|partial|invited/.test(text)) {
    return 'warning';
  }

  if (/active|connected|ready|enabled|published|verified|subscribed|sent/.test(text)) {
    return 'success';
  }

  return 'info';
}

function isHealthyFeatureStatus(status: unknown) {
  return getFeatureSeverity(status) === 'success';
}

function collectFeatureRisks(rows: JsonRecord[], status?: unknown, extras: string[] = []) {
  const risks = new Set<string>();
  const severity = getFeatureSeverity(status, rows);
  if (severity === 'critical') {
    risks.add('Error or disconnected signal');
  }
  if (severity === 'warning') {
    risks.add('Needs setup or review');
  }

  for (const row of rows) {
    const lastError =
      normalizeString(row.last_error) ||
      normalizeString(row.error_message) ||
      normalizeString(row.webhook_last_error) ||
      normalizeString(row.failure_reason);
    if (lastError) {
      risks.add(lastError);
    }
  }

  for (const extra of extras) {
    if (extra) {
      risks.add(extra);
    }
  }

  return [...risks].slice(0, 4);
}

function countRowsWithStatus(rows: JsonRecord[], pattern: RegExp) {
  return rows.filter((row) => pattern.test(String(row.status || row.processing_status || row.state || ''))).length;
}

function latestByUpdatedAt(rows: JsonRecord[]) {
  return rows
    .slice()
    .sort(
      (left, right) =>
        Date.parse(String(right.updated_at || right.created_at || right.submitted_at || 0)) -
        Date.parse(String(left.updated_at || left.created_at || left.submitted_at || 0)),
    )[0] || null;
}

function buildClientFeatureOperations(core: Awaited<ReturnType<typeof loadCoreData>>, authUsers: User[]) {
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const profileById = new Map(core.profiles.map((profile) => [String(profile.user_id), profile]));
  const workspaceIds = new Set<string>([
    ...authUsers.map((user) => user.id),
    ...core.profiles.map((profile) => String(profile.user_id)),
  ]);

  const records: Array<{
    id: string;
    featureKey: ClientFeatureKey;
    featureLabel: string;
    category: string;
    userId: string;
    organizationName: string;
    ownerName: string;
    ownerEmail: string | null;
    status: string;
    severity: LivePayload['severity'];
    detail: string;
    route: string;
    updatedAt: string | null;
    metrics: Array<{ label: string; value: string | number }>;
    risks: string[];
    canUpdateStatus: boolean;
    allowedStatuses: string[];
    raw: unknown;
  }> = [];

  const addRecord = (input: {
    featureKey: ClientFeatureKey;
    userId: string;
    status: string;
    detail: string;
    rows?: JsonRecord[];
    metrics?: Array<{ label: string; value: string | number }>;
    risks?: string[];
    canUpdateStatus?: boolean;
    updatedAt?: string | null;
    raw?: unknown;
  }) => {
    const catalog = clientFeatureCatalog[input.featureKey];
    const identity = getWorkspaceIdentity(input.userId, profileById, authById);
    const rows = input.rows || [];
    const control = clientFeatureStatusControls[input.featureKey];
    const severity = getFeatureSeverity(input.status, rows);
    records.push({
      id: `${input.featureKey}:${input.userId}`,
      featureKey: input.featureKey,
      featureLabel: catalog.label,
      category: catalog.category,
      userId: input.userId,
      organizationName: identity.organizationName,
      ownerName: identity.ownerName,
      ownerEmail: identity.ownerEmail,
      status: input.status,
      severity,
      detail: input.detail,
      route: catalog.route,
      updatedAt: input.updatedAt ?? latestTimestamp(rows),
      metrics: input.metrics || [],
      risks: input.risks || collectFeatureRisks(rows, input.status),
      canUpdateStatus: Boolean(input.canUpdateStatus ?? control),
      allowedStatuses: control?.statuses || [],
      raw: input.raw || (rows.length === 1 ? rows[0] : rows),
    });
    workspaceIds.add(input.userId);
  };

  for (const row of core.metaChannels) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    addRecord({
      featureKey: 'whatsapp',
      userId,
      status: normalizeString(row.status) || 'connected',
      detail:
        normalizeString(row.display_phone_number) ||
        normalizeString(row.verified_name) ||
        normalizeString(row.phone_number_id) ||
        'WhatsApp channel connected',
      rows: [row],
      metrics: [
        { label: 'Templates', value: core.templates.filter((item) => rowOwnerUserId(item) === userId).length },
        { label: 'Messages', value: core.messages.filter((item) => rowOwnerUserId(item) === userId).length },
        { label: 'Calls', value: core.callSessions.filter((item) => rowOwnerUserId(item) === userId).length },
      ],
    });
  }

  for (const row of core.instagramChannels) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    addRecord({
      featureKey: 'instagram',
      userId,
      status: normalizeString(row.status) || 'connected',
      detail: normalizeString(row.instagram_username) || normalizeString(row.page_name) || 'Instagram channel connected',
      rows: [row],
      metrics: [
        { label: 'Page', value: normalizeString(row.page_name) || 'Connected' },
        { label: 'Token', value: normalizeString(row.page_access_token_last4) ? `...${row.page_access_token_last4}` : 'Stored' },
      ],
    });
  }

  for (const row of core.messengerChannels) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    const fields = Array.isArray(row.webhook_fields) ? row.webhook_fields.length : 0;
    addRecord({
      featureKey: 'messenger',
      userId,
      status: normalizeString(row.status) || (row.webhook_subscribed ? 'connected' : 'pending'),
      detail: normalizeString(row.page_name) || normalizeString(row.page_id) || 'Messenger Page connected',
      rows: [row],
      metrics: [
        { label: 'Webhook fields', value: fields },
        { label: 'Subscribed', value: row.webhook_subscribed ? 'Yes' : 'No' },
      ],
    });
  }

  for (const row of core.metaAdsIntegrations) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    addRecord({
      featureKey: 'meta_ads',
      userId,
      status: normalizeString(row.status) || 'draft',
      detail:
        normalizeString(row.ad_account_name) ||
        normalizeString(row.ad_account_id) ||
        normalizeString(row.page_name) ||
        'Meta Ads integration saved',
      rows: [row],
      metrics: [
        { label: 'Currency', value: normalizeString(row.currency) || 'N/A' },
        { label: 'Permissions', value: Array.isArray(row.permissions) ? row.permissions.length : 0 },
      ],
    });
  }

  for (const row of core.metaLeadCaptureConfigs) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    const events = core.leadEvents.filter((event) => rowOwnerUserId(event) === userId);
    addRecord({
      featureKey: 'meta_lead_capture',
      userId,
      status: normalizeString(row.status) || 'draft',
      detail: `${Array.isArray(row.page_ids) ? row.page_ids.length : 0} Page IDs, ${Array.isArray(row.form_ids) ? row.form_ids.length : 0} form filters`,
      rows: [row, ...events],
      metrics: [
        { label: 'Events', value: events.length },
        { label: 'Failed', value: events.filter(isFailedRow).length },
        { label: 'Auto create', value: row.auto_create_leads === false ? 'No' : 'Yes' },
      ],
    });
  }

  const paymentEventsByUser = groupRowsByOwner(core.paymentEvents);
  for (const [userId, rows] of paymentEventsByUser) {
    const latest = latestByUpdatedAt(rows);
    addRecord({
      featureKey: 'whatsapp_payments',
      userId,
      status: normalizeString(latest?.status) || 'recorded',
      detail:
        normalizeString(latest?.configuration_name) ||
        normalizeString(latest?.provider_name) ||
        'WhatsApp payment configuration events recorded',
      rows,
      metrics: [
        { label: 'Events', value: rows.length },
        { label: 'Failed', value: rows.filter(isFailedRow).length },
        { label: 'Providers', value: new Set(rows.map((row) => normalizeString(row.provider_name)).filter(Boolean)).size },
      ],
      canUpdateStatus: false,
    });
  }

  for (const row of core.woocommerceConnections) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    const automations = Array.isArray(row.automations) ? row.automations.filter(isRecord) : [];
    addRecord({
      featureKey: 'woocommerce',
      userId,
      status: normalizeString(row.status) || 'connected',
      detail: normalizeString(row.store_name) || normalizeString(row.store_url) || 'WooCommerce store connected',
      rows: [row],
      metrics: [
        { label: 'Automations', value: automations.length },
        { label: 'Enabled', value: automations.filter((item) => Boolean(item.enabled)).length },
        { label: 'Verified', value: normalizeString(row.last_verified_at) ? 'Yes' : 'No' },
      ],
    });
  }

  const emailConnectionsByUser = groupRowsByOwner(core.emailConnections);
  const emailTemplatesByUser = groupRowsByOwner(core.emailTemplates);
  const emailCampaignsByUser = groupRowsByOwner(core.emailCampaigns);
  for (const userId of collectGroupOwnerIds(emailConnectionsByUser, emailTemplatesByUser, emailCampaignsByUser)) {
    const connections = emailConnectionsByUser.get(userId) || [];
    const templates = emailTemplatesByUser.get(userId) || [];
    const campaigns = emailCampaignsByUser.get(userId) || [];
    const latestConnection = latestByUpdatedAt(connections);
    addRecord({
      featureKey: 'email',
      userId,
      status: normalizeString(latestConnection?.status) || (campaigns.length || templates.length ? 'activity_only' : 'not_configured'),
      detail:
        normalizeString(latestConnection?.email_address) ||
        `${templates.length} templates and ${campaigns.length} campaigns without a saved mailbox`,
      rows: [...connections, ...campaigns],
      metrics: [
        { label: 'Connections', value: connections.length },
        { label: 'Campaigns', value: campaigns.length },
        { label: 'Failures', value: campaigns.filter(isFailedRow).length },
      ],
      canUpdateStatus: connections.length > 0,
    });

    if (templates.length > 0) {
      addRecord({
        featureKey: 'email_templates',
        userId,
        status: 'configured',
        detail: `${templates.length} email templates saved`,
        rows: templates,
        metrics: [
          { label: 'Templates', value: templates.length },
          { label: 'Campaigns', value: campaigns.length },
        ],
        canUpdateStatus: false,
      });
    }
  }

  const flowsByUser = groupRowsByOwner(core.metaFlows);
  const submissionsByUser = groupRowsByOwner(core.flowSubmissions);
  for (const userId of collectGroupOwnerIds(flowsByUser, submissionsByUser)) {
    const flows = flowsByUser.get(userId) || [];
    const submissions = submissionsByUser.get(userId) || [];
    const published = countRowsWithStatus(flows, /published/i);
    addRecord({
      featureKey: 'whatsapp_flows',
      userId,
      status: published > 0 ? 'published' : flows.length > 0 ? 'draft' : 'submissions_only',
      detail: `${flows.length} flows, ${submissions.length} submissions`,
      rows: [...flows, ...submissions],
      metrics: [
        { label: 'Flows', value: flows.length },
        { label: 'Published', value: published },
        { label: 'Submissions', value: submissions.length },
      ],
      canUpdateStatus: false,
    });
  }

  const automationRulesByUser = groupRowsByOwner(core.automationRules);
  const conversationalByUser = groupRowsByOwner(core.conversationalAutomationConfigs);
  for (const userId of collectGroupOwnerIds(automationRulesByUser, conversationalByUser)) {
    const rules = automationRulesByUser.get(userId) || [];
    const configs = conversationalByUser.get(userId) || [];
    const enabledRules = rules.filter((row) => Boolean(row.is_enabled));
    const welcomeEnabled = configs.some((row) => Boolean(row.enable_welcome_message));
    addRecord({
      featureKey: 'automations',
      userId,
      status: enabledRules.length > 0 || welcomeEnabled ? 'enabled' : 'configured',
      detail: `${enabledRules.length}/${rules.length} rules enabled${welcomeEnabled ? ', welcome automation on' : ''}`,
      rows: [...rules, ...configs],
      metrics: [
        { label: 'Rules', value: rules.length },
        { label: 'Enabled', value: enabledRules.length },
        { label: 'Commands', value: configs.reduce((total, row) => total + (Array.isArray(row.commands) ? row.commands.length : 0), 0) },
      ],
      canUpdateStatus: false,
    });
  }

  const developerCredentialsByUser = groupRowsByOwner(core.developerApiCredentials);
  const developerWebhooksByUser = groupRowsByOwner(core.developerWebhookEndpoints);
  for (const userId of collectGroupOwnerIds(developerCredentialsByUser, developerWebhooksByUser)) {
    const credentials = developerCredentialsByUser.get(userId) || [];
    const webhooks = developerWebhooksByUser.get(userId) || [];
    const activeCredentials = credentials.filter((row) => String(row.status || '').toLowerCase() === 'active');
    const activeWebhooks = webhooks.filter((row) => String(row.status || '').toLowerCase() === 'active');
    addRecord({
      featureKey: 'developer_tools',
      userId,
      status: activeCredentials.length > 0 || activeWebhooks.length > 0 ? 'active' : 'inactive',
      detail: `${credentials.length} API credentials, ${webhooks.length} webhook endpoints`,
      rows: [...credentials, ...webhooks],
      metrics: [
        { label: 'API keys', value: credentials.length },
        { label: 'Active keys', value: activeCredentials.length },
        { label: 'Webhooks', value: webhooks.length },
      ],
      canUpdateStatus: false,
    });
  }

  const teamMembersByOwner = groupRowsByOwner(core.workspaceTeamMembers, (row) => normalizeString(row.workspace_owner_user_id));
  for (const [userId, rows] of teamMembersByOwner) {
    const active = rows.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
    const invited = rows.filter((row) => String(row.status || '').toLowerCase() === 'invited').length;
    addRecord({
      featureKey: 'workspace_team',
      userId,
      status: active > 0 ? 'active' : invited > 0 ? 'invited' : 'configured',
      detail: `${rows.length} team members`,
      rows,
      metrics: [
        { label: 'Members', value: rows.length },
        { label: 'Active', value: active },
        { label: 'Invited', value: invited },
      ],
      canUpdateStatus: false,
    });
  }

  for (const row of core.notificationPreferences) {
    const userId = rowOwnerUserId(row);
    if (!userId) continue;
    const enabledEvents = [
      row.incoming_message_enabled,
      row.incoming_email_enabled,
      row.template_review_enabled,
      row.missed_call_enabled,
      row.lead_enabled,
      row.campaign_sent_enabled,
      row.email_campaign_enabled,
      row.display_name_approved_enabled,
      row.team_joined_enabled,
    ].filter(Boolean).length;
    addRecord({
      featureKey: 'notifications',
      userId,
      status: row.enabled === false ? 'disabled' : 'enabled',
      detail: `${enabledEvents} notification event types enabled`,
      rows: [row],
      metrics: [
        { label: 'Events enabled', value: enabledEvents },
        { label: 'Sound', value: row.sound_enabled === false ? 'Off' : 'On' },
        { label: 'Volume', value: normalizeString(row.volume) || '0.8' },
      ],
    });
  }

  const workspaceCount = Math.max(workspaceIds.size, core.profiles.length);
  const featureSummaries = clientFeatureKeys.map((featureKey) => {
    const catalog = clientFeatureCatalog[featureKey];
    const featureRecords = records.filter((record) => record.featureKey === featureKey);
    const configuredWorkspaceCount = new Set(featureRecords.map((record) => record.userId)).size;
    const activeCount = featureRecords.filter((record) => isHealthyFeatureStatus(record.status)).length;
    const criticalCount = featureRecords.filter((record) => record.severity === 'critical').length;
    const warningCount = featureRecords.filter((record) => record.severity === 'warning').length;
    const attentionCount = criticalCount + warningCount;
    const missingCount = Math.max(workspaceCount - configuredWorkspaceCount, 0);
    const severity: LivePayload['severity'] =
      criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : configuredWorkspaceCount > 0 ? 'success' : 'warning';

    return {
      key: featureKey,
      label: catalog.label,
      category: catalog.category,
      description: catalog.description,
      route: catalog.route,
      status: configuredWorkspaceCount === 0 ? 'not configured' : attentionCount > 0 ? 'needs review' : 'healthy',
      severity,
      metrics: [
        { label: 'Configured', value: configuredWorkspaceCount },
        { label: 'Active', value: activeCount },
        { label: 'Attention', value: attentionCount },
        { label: 'Missing', value: missingCount },
      ],
      risks: featureRecords.flatMap((record) => record.risks).slice(0, 5),
    };
  });

  const severityRank: Record<LivePayload['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  return {
    generatedAt: nowIso(),
    summary: {
      workspaces: workspaceCount,
      featureFamilies: clientFeatureKeys.length,
      configuredRecords: records.length,
      attentionRecords: records.filter((record) => record.severity === 'critical' || record.severity === 'warning').length,
      controllableRecords: records.filter((record) => record.canUpdateStatus).length,
    },
    features: featureSummaries,
    records: records.sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) return severityDelta;
      return Date.parse(String(right.updatedAt || 0)) - Date.parse(String(left.updatedAt || 0));
    }),
    recentActivity: buildTimeline(core).slice(0, 80),
    warnings: core.errors,
  };
}

async function updateClientFeatureStatus(
  admin: AdminContext | undefined,
  featureKey: ClientFeatureKey,
  userId: string,
  status: string,
  notifyUser: boolean,
) {
  const control = clientFeatureStatusControls[featureKey];
  if (!control) {
    throw new Error('This client feature does not support direct status changes from the Admin app.');
  }

  if (!control.statuses.includes(status)) {
    throw new Error(`Status must be one of: ${control.statuses.join(', ')}.`);
  }

  if (featureKey === 'notifications') {
    const { error } = await adminSupabase.from('user_notification_preferences').upsert(
      {
        user_id: userId,
        enabled: status === 'enabled',
        updated_at: nowIso(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      throw error;
    }
  } else {
    const { data, error } = await adminSupabase
      .from(control.table)
      .update({
        status,
        updated_at: nowIso(),
      })
      .eq(control.userColumn || 'user_id', userId)
      .select('user_id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('No matching client feature record was found for this workspace.');
    }
  }

  if (notifyUser) {
    await adminSupabase.from('user_notifications').insert({
      user_id: userId,
      type: 'lead_created',
      title: 'Workspace feature status updated',
      body: `${clientFeatureCatalog[featureKey].label} was marked ${status} by Connektly support.`,
      target_path: clientFeatureCatalog[featureKey].route,
      metadata: { source: 'owner_dashboard', featureKey, status },
    });
  }

  await recordAdminAudit(admin, 'UPDATE_CLIENT_FEATURE_STATUS', userId, { featureKey, status, notifyUser });
}

type WebsiteBlogPost = {
  id: string;
  title: string;
  author: string;
  excerpt: string;
  content: string;
  coverImage: string;
  date: string;
  updatedAt?: string | null;
};

type WebsiteHelpArticle = {
  id: string;
  title: string;
  author: string;
  category: string;
  excerpt: string;
  content: string;
  date: string;
  updatedAt?: string | null;
};

const websiteBlogsFile = path.join(websiteContentRoot, 'data', 'blogs.json');
const websiteHelpFile = path.join(websiteContentRoot, 'data', 'help.json');
const websiteUploadsDir = path.join(websiteContentRoot, 'uploads');
const defaultHelpCategories = ['Connektly Overview', 'Get Started', 'Connect Your Number', 'Privacy & Security'];

async function readWebsiteJsonArray(filePath: string) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeWebsiteJsonArray(filePath: string, rows: JsonRecord[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

function normalizeWebsiteDate(value: unknown) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : nowIso();
}

function websiteAssetUrl(value: unknown) {
  const asset = normalizeString(value);
  if (!asset) return null;
  if (/^https?:\/\//i.test(asset)) return asset;
  return `${websitePublicBaseUrl}${asset.startsWith('/') ? asset : `/${asset}`}`;
}

function normalizeWebsiteBlog(row: JsonRecord): WebsiteBlogPost {
  return {
    id: normalizeString(row.id) || Date.now().toString(),
    title: normalizeString(row.title) || 'Untitled',
    author: normalizeString(row.author) || 'Anonymous',
    excerpt: normalizeString(row.excerpt) || '',
    content: typeof row.content === 'string' ? row.content : '',
    coverImage: normalizeString(row.coverImage) || '',
    date: normalizeWebsiteDate(row.date),
    updatedAt: normalizeString(row.updatedAt),
  };
}

function normalizeWebsiteHelpArticle(row: JsonRecord): WebsiteHelpArticle {
  return {
    id: normalizeString(row.id) || `help-${Date.now()}`,
    title: normalizeString(row.title) || 'Untitled',
    author: normalizeString(row.author) || 'Support Team',
    category: normalizeString(row.category) || 'General',
    excerpt: normalizeString(row.excerpt) || '',
    content: typeof row.content === 'string' ? row.content : '',
    date: normalizeWebsiteDate(row.date),
    updatedAt: normalizeString(row.updatedAt),
  };
}

async function loadWebsiteContent() {
  const [blogRows, helpRows] = await Promise.all([
    readWebsiteJsonArray(websiteBlogsFile),
    readWebsiteJsonArray(websiteHelpFile),
  ]);
  const blogs = blogRows
    .map(normalizeWebsiteBlog)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const helpArticles = helpRows
    .map(normalizeWebsiteHelpArticle)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const categories = [...new Set([...defaultHelpCategories, ...helpArticles.map((article) => article.category).filter(Boolean)])];

  return {
    generatedAt: nowIso(),
    publicBaseUrl: websitePublicBaseUrl,
    summary: {
      blogs: blogs.length,
      helpArticles: helpArticles.length,
      helpCategories: categories.length,
      mediaRootConfigured: true,
    },
    categories,
    blogs,
    helpArticles,
    warnings: [] as string[],
  };
}

function requireWebsiteTitle(value: unknown, label: string) {
  const title = normalizeString(value);
  if (!title) {
    throw new Error(`${label} title is required.`);
  }
  return title;
}

function normalizeBlogPayload(body: JsonRecord, existing?: WebsiteBlogPost): WebsiteBlogPost {
  const timestamp = nowIso();
  return {
    id: existing?.id || Date.now().toString(),
    title: requireWebsiteTitle(body.title ?? existing?.title, 'Blog post'),
    author: normalizeString(body.author ?? existing?.author) || 'Anonymous',
    excerpt: normalizeString(body.excerpt ?? existing?.excerpt) || '',
    content: typeof body.content === 'string' ? body.content : existing?.content || '',
    coverImage: normalizeString(body.coverImage ?? existing?.coverImage) || '',
    date: existing?.date || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeHelpPayload(body: JsonRecord, existing?: WebsiteHelpArticle): WebsiteHelpArticle {
  const timestamp = nowIso();
  return {
    id: existing?.id || `help-${Date.now()}`,
    title: requireWebsiteTitle(body.title ?? existing?.title, 'Help article'),
    author: normalizeString(body.author ?? existing?.author) || 'Support Team',
    category: normalizeString(body.category ?? existing?.category) || defaultHelpCategories[0],
    excerpt: normalizeString(body.excerpt ?? existing?.excerpt) || '',
    content: typeof body.content === 'string' ? body.content : existing?.content || '',
    date: existing?.date || timestamp,
    updatedAt: timestamp,
  };
}

function sortWebsiteRows<T extends { date: string; updatedAt?: string | null }>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      Date.parse(String(right.updatedAt || right.date || 0)) - Date.parse(String(left.updatedAt || left.date || 0)),
  );
}

async function saveWebsiteBlog(admin: AdminContext | undefined, body: JsonRecord, id?: string) {
  const blogs = (await readWebsiteJsonArray(websiteBlogsFile)).map(normalizeWebsiteBlog);
  const index = id ? blogs.findIndex((blog) => blog.id === id) : -1;
  if (id && index === -1) {
    throw new Error('Blog post was not found.');
  }

  const nextBlog = normalizeBlogPayload(body, index >= 0 ? blogs[index] : undefined);
  const nextBlogs = index >= 0 ? blogs.map((blog, blogIndex) => (blogIndex === index ? nextBlog : blog)) : [nextBlog, ...blogs];
  await writeWebsiteJsonArray(websiteBlogsFile, sortWebsiteRows(nextBlogs) as unknown as JsonRecord[]);
  await recordAdminAudit(admin, index >= 0 ? 'UPDATE_WEBSITE_BLOG' : 'CREATE_WEBSITE_BLOG', null, {
    id: nextBlog.id,
    title: nextBlog.title,
  });
  return loadWebsiteContent();
}

async function deleteWebsiteBlog(admin: AdminContext | undefined, id: string) {
  const blogs = (await readWebsiteJsonArray(websiteBlogsFile)).map(normalizeWebsiteBlog);
  const existing = blogs.find((blog) => blog.id === id);
  if (!existing) {
    throw new Error('Blog post was not found.');
  }

  await writeWebsiteJsonArray(websiteBlogsFile, blogs.filter((blog) => blog.id !== id) as unknown as JsonRecord[]);
  await recordAdminAudit(admin, 'DELETE_WEBSITE_BLOG', null, { id, title: existing.title });
  return loadWebsiteContent();
}

async function saveWebsiteHelpArticle(admin: AdminContext | undefined, body: JsonRecord, id?: string) {
  const articles = (await readWebsiteJsonArray(websiteHelpFile)).map(normalizeWebsiteHelpArticle);
  const index = id ? articles.findIndex((article) => article.id === id) : -1;
  if (id && index === -1) {
    throw new Error('Help article was not found.');
  }

  const nextArticle = normalizeHelpPayload(body, index >= 0 ? articles[index] : undefined);
  const nextArticles = index >= 0
    ? articles.map((article, articleIndex) => (articleIndex === index ? nextArticle : article))
    : [nextArticle, ...articles];
  await writeWebsiteJsonArray(websiteHelpFile, sortWebsiteRows(nextArticles) as unknown as JsonRecord[]);
  await recordAdminAudit(admin, index >= 0 ? 'UPDATE_WEBSITE_HELP_ARTICLE' : 'CREATE_WEBSITE_HELP_ARTICLE', null, {
    id: nextArticle.id,
    title: nextArticle.title,
    category: nextArticle.category,
  });
  return loadWebsiteContent();
}

async function deleteWebsiteHelpArticle(admin: AdminContext | undefined, id: string) {
  const articles = (await readWebsiteJsonArray(websiteHelpFile)).map(normalizeWebsiteHelpArticle);
  const existing = articles.find((article) => article.id === id);
  if (!existing) {
    throw new Error('Help article was not found.');
  }

  await writeWebsiteJsonArray(websiteHelpFile, articles.filter((article) => article.id !== id) as unknown as JsonRecord[]);
  await recordAdminAudit(admin, 'DELETE_WEBSITE_HELP_ARTICLE', null, { id, title: existing.title });
  return loadWebsiteContent();
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return null;
}

function sanitizeUploadBaseName(fileName: unknown) {
  const normalized = normalizeString(fileName) || 'website-media';
  const base = path.parse(normalized).name || 'website-media';
  return base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'website-media';
}

async function saveWebsiteMedia(admin: AdminContext | undefined, body: JsonRecord) {
  const dataUrl = normalizeString(body.dataUrl);
  if (!dataUrl) {
    throw new Error('Image data is required.');
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Only base64 PNG, JPEG, WEBP, or GIF images can be uploaded.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = extensionForMime(mimeType);
  if (!extension) {
    throw new Error('Unsupported image type.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }

  await fs.mkdir(websiteUploadsDir, { recursive: true });
  const fileName = `${Date.now()}-${crypto.randomInt(100000000, 999999999)}-${sanitizeUploadBaseName(body.fileName)}.${extension}`;
  const uploadPath = path.join(websiteUploadsDir, fileName);
  await fs.writeFile(uploadPath, buffer);
  const location = `/uploads/${fileName}`;
  await recordAdminAudit(admin, 'UPLOAD_WEBSITE_MEDIA', null, {
    fileName,
    mimeType,
    size: buffer.byteLength,
  });

  return {
    location,
    publicUrl: websiteAssetUrl(location),
    contentType: mimeType,
    size: buffer.byteLength,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'connektly-owner-dashboard', uptimeSeconds: Math.round(process.uptime()) });
});

app.get('/api/public/pricing-plans', async (_req, res) => {
  try {
    const settings = await loadPlatformSettings();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      plans: buildPublicPricingPlans(settings.rawSettings),
      generatedAt: nowIso(),
      warning: settings.warning,
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/me', requireAdmin, (req: AdminRequest, res) => {
  res.json({
    admin: {
      id: req.admin?.id,
      email: req.admin?.email,
      access: req.admin?.access,
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

app.patch('/api/admin/settings/account', requireAdmin, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const loginEmail = Object.prototype.hasOwnProperty.call(req.body, 'loginEmail') ? normalizeEmail(req.body.loginEmail) : null;
    const newPassword = normalizeString(req.body.newPassword);
    const authUpdates: JsonRecord = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'loginEmail')) {
      if (!loginEmail) {
        throw new Error('Enter a valid login email.');
      }
      authUpdates.email = loginEmail;
      authUpdates.email_confirm = true;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      authUpdates.password = newPassword;
    }

    if (Object.keys(authUpdates).length === 0) {
      throw new Error('Enter a new login email or password to update.');
    }

    const { data, error } = await adminSupabase.auth.admin.updateUserById(admin.id, authUpdates as any);
    if (error) {
      throw error;
    }

    if (loginEmail) {
      await upsertOwnerProfile({ ...admin, email: loginEmail }, { email: loginEmail });
      await adminSupabase
        .from('owner_admin_users')
        .update({ email: loginEmail, updated_at: nowIso() })
        .eq('auth_user_id', admin.id)
        .then((result) => {
          if (result.error && !isMissingRelationError(result.error)) {
            throw result.error;
          }
        });
    }

    await recordAdminAudit(admin, 'UPDATE_OWNER_ACCOUNT', null, {
      loginEmailChanged: Boolean(loginEmail),
      passwordChanged: Boolean(newPassword),
    });

    const { row, warning } = await getOwnerProfileRow(admin.id);
    res.json(buildOwnerSettings({ ...admin, email: normalizeEmail(data.user?.email) || admin.email, user: data.user || admin.user }, row, warning, data.user || admin.user));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/admin-users', requireAdmin, requirePrimaryOwner, async (_req, res) => {
  try {
    const { admins, warning } = await loadDashboardAdmins();
    res.json({
      admins,
      permissions: adminPermissionCatalog,
      primaryOwnerEmail,
      warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/admin-users/invite', requireAdmin, requirePrimaryOwner, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw new Error('Enter a valid email address.');
    }
    if (email === primaryOwnerEmail) {
      throw new Error(`${primaryOwnerEmail} is already the primary owner.`);
    }

    const fullName = normalizeString(req.body.fullName) || email.split('@')[0];
    const roleTitle = normalizeString(req.body.roleTitle) || 'Admin';
    const permissions = normalizeInvitePermissions(req.body.permissions);
    let authUser = await findAuthUserByEmail(email);
    let inviteError: string | null = null;

    if (!authUser) {
      const options: JsonRecord = {
        data: {
          full_name: fullName,
          role_title: roleTitle,
          invited_by_admin: admin.email,
        },
      };
      if (adminInviteRedirectUrl) {
        options.redirectTo = adminInviteRedirectUrl;
      }

      const { data, error } = await (adminSupabase.auth.admin as any).inviteUserByEmail(email, options);
      if (error) {
        const message = error.message.toLowerCase();
        if (!message.includes('already') && !message.includes('registered')) {
          throw error;
        }
        inviteError = error.message;
        authUser = await findAuthUserByEmail(email);
      } else {
        authUser = data?.user || null;
      }
    }

    const payload = {
      auth_user_id: authUser?.id || null,
      email,
      full_name: fullName,
      role_title: roleTitle,
      role: 'admin',
      status: authUser ? 'active' : 'invited',
      permissions,
      invited_by: admin.id,
      invited_at: nowIso(),
      updated_at: nowIso(),
    };

    const { error } = await adminSupabase.from('owner_admin_users').upsert(payload, { onConflict: 'email' });
    if (error) {
      if (isMissingRelationError(error)) {
        throw new Error('Apply supabase/admin_dashboard.sql before inviting dashboard admins.');
      }
      throw error;
    }

    await recordAdminAudit(admin, 'INVITE_DASHBOARD_ADMIN', authUser?.id || null, { email, permissions });
    const { admins, warning } = await loadDashboardAdmins();
    res.json({
      admins,
      permissions: adminPermissionCatalog,
      primaryOwnerEmail,
      warning: warning || inviteError,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/admin-users/:id', requireAdmin, requirePrimaryOwner, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Admin user id is required.');
    }

    const { data: existing, error: existingError } = await adminSupabase.from('owner_admin_users').select('*').eq('id', id).maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (!isRecord(existing)) {
      res.status(404).json({ error: 'Dashboard admin not found.' });
      return;
    }
    if (normalizeAdminRole(existing.role) === 'primary_owner') {
      throw new Error('The primary owner cannot be edited from this list.');
    }

    const updates: JsonRecord = { updated_at: nowIso() };
    if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) {
      updates.full_name = normalizeString(req.body.fullName) || '';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'roleTitle')) {
      updates.role_title = normalizeString(req.body.roleTitle) || 'Admin';
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      updates.status = normalizeAdminStatus(req.body.status);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'permissions')) {
      updates.permissions = normalizeInvitePermissions(req.body.permissions);
    }

    const { error } = await adminSupabase.from('owner_admin_users').update(updates).eq('id', id);
    if (error) {
      throw error;
    }

    await recordAdminAudit(admin, 'UPDATE_DASHBOARD_ADMIN', normalizeString(existing.auth_user_id), { adminRowId: id, updates: Object.keys(updates) });
    const { admins, warning } = await loadDashboardAdmins();
    res.json({
      admins,
      permissions: adminPermissionCatalog,
      primaryOwnerEmail,
      warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.delete('/api/admin/admin-users/:id', requireAdmin, requirePrimaryOwner, async (req: AdminRequest, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error('Admin context was not initialized.');
    }

    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Admin user id is required.');
    }

    const { data: existing, error: existingError } = await adminSupabase.from('owner_admin_users').select('*').eq('id', id).maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (!isRecord(existing)) {
      res.status(404).json({ error: 'Dashboard admin not found.' });
      return;
    }
    if (normalizeAdminRole(existing.role) === 'primary_owner') {
      throw new Error('The primary owner cannot be removed.');
    }

    const { error } = await adminSupabase.from('owner_admin_users').delete().eq('id', id);
    if (error) {
      throw error;
    }

    await recordAdminAudit(admin, 'REMOVE_DASHBOARD_ADMIN', normalizeString(existing.auth_user_id), { adminRowId: id });
    const { admins, warning } = await loadDashboardAdmins();
    res.json({
      admins,
      permissions: adminPermissionCatalog,
      primaryOwnerEmail,
      warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/platform-settings', requireAdmin, requireAdminPermission('platform_settings'), async (_req, res) => {
  try {
    const settings = await loadPlatformSettings();
    res.json({
      settings: settings.settings,
      warning: settings.warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/plans', requireAdmin, requireAdminPermission('plan_management'), async (_req, res) => {
  try {
    const settings = await loadPlatformSettings();
    res.json({
      plans: settings.settings.pricing_plans.plans,
      warning: settings.warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.put('/api/admin/plans', requireAdmin, requireAdminPermission('plan_management'), async (req: AdminRequest, res) => {
  try {
    const saved = await savePlatformSettingsSection(req.admin, 'pricing_plans', {
      plans: Array.isArray(req.body.plans) ? req.body.plans : [],
    });
    res.json({
      plans: saved.settings.pricing_plans.plans,
      warning: saved.warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/platform-settings/:section', requireAdmin, requireAdminPermission('platform_settings'), async (req: AdminRequest, res) => {
  try {
    const section = normalizePlatformSection(req.params.section);
    if (!section) {
      res.status(400).json({ error: 'Unsupported platform settings section.' });
      return;
    }

    const settings = await savePlatformSettingsSection(req.admin, section, req.body);
    res.json({
      settings: settings.settings,
      warning: settings.warning,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/bootstrap', requireAdmin, requireAdminPermission('command_center'), async (_req, res) => {
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

app.get(
  '/api/admin/logs',
  requireAdmin,
  requireAnyAdminPermission(['logs_monitoring', 'webhooks', 'server_status', 'security_audit']),
  async (_req, res) => {
    try {
      const [clientHealth, core] = await Promise.all([
        checkClientApiHealth(),
        loadCoreData(),
      ]);
      const health = summarizeHealth(null, clientHealth);
      res.json(buildLogsMonitoring(core, health));
    } catch (error) {
      sendError(res, 500, error);
    }
  },
);

app.get('/api/admin/integrations', requireAdmin, requireAdminPermission('global_integrations'), async (_req, res) => {
  try {
    const [clientHealth, core] = await Promise.all([
      checkClientApiHealth(),
      loadCoreData(),
    ]);
    res.json(buildGlobalIntegrations(core, clientHealth));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/client-features', requireAdmin, requireAdminPermission('global_integrations'), async (_req, res) => {
  try {
    const [authUsers, core] = await Promise.all([
      listAuthUsers().catch(() => []),
      loadCoreData(),
    ]);
    res.json(buildClientFeatureOperations(core, authUsers));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/client-features/:featureKey/:userId/status', requireAdmin, requireAdminPermission('global_integrations'), async (req: AdminRequest, res) => {
  try {
    const featureKey = normalizeClientFeatureKey(req.params.featureKey);
    const userId = normalizeString(req.params.userId);
    const status = normalizeString(req.body.status);

    if (!featureKey || !userId || !status) {
      throw new Error('Feature, workspace, and status are required.');
    }

    await updateClientFeatureStatus(req.admin, featureKey, userId, status, Boolean(req.body.notifyUser));
    const [authUsers, core] = await Promise.all([
      listAuthUsers().catch(() => []),
      loadCoreData(),
    ]);

    res.json(buildClientFeatureOperations(core, authUsers));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/website-content', requireAdmin, requireAdminPermission('website_management'), async (_req, res) => {
  try {
    res.json(await loadWebsiteContent());
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/website-content/media', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    res.status(201).json(await saveWebsiteMedia(req.admin, req.body));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/website-content/blogs', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    res.status(201).json(await saveWebsiteBlog(req.admin, req.body));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/website-content/blogs/:id', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Blog post id is required.');
    }
    res.json(await saveWebsiteBlog(req.admin, req.body, id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.delete('/api/admin/website-content/blogs/:id', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Blog post id is required.');
    }
    res.json(await deleteWebsiteBlog(req.admin, id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/admin/website-content/help', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    res.status(201).json(await saveWebsiteHelpArticle(req.admin, req.body));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/website-content/help/:id', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Help article id is required.');
    }
    res.json(await saveWebsiteHelpArticle(req.admin, req.body, id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.delete('/api/admin/website-content/help/:id', requireAdmin, requireAdminPermission('website_management'), async (req: AdminRequest, res) => {
  try {
    const id = normalizeString(req.params.id);
    if (!id) {
      throw new Error('Help article id is required.');
    }
    res.json(await deleteWebsiteHelpArticle(req.admin, id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/organizations', requireAdmin, requireAdminPermission('organizations'), async (req, res) => {
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

app.get('/api/admin/organizations/:orgId', requireAdmin, requireAdminPermission('organizations'), async (req, res) => {
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

app.post('/api/admin/organizations/:orgId/action', requireAdmin, requireAdminPermission('organizations'), async (req: AdminRequest, res) => {
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
    } else if (['check_webhook', 'activate_webhook', 'deactivate_webhook', 'unsubscribe_webhook'].includes(action)) {
      await runWhatsAppWebhookAction(orgId, action, req);
      await recordAdminAudit(req.admin, `WHATSAPP_${action.toUpperCase()}`, orgId);
    } else if (action === 'disconnect_waba') {
      const { error: templatesError } = await adminSupabase.from('meta_templates').delete().eq('user_id', orgId);
      if (templatesError) {
        throw templatesError;
      }
      const { error: channelError } = await adminSupabase.from('meta_channels').delete().eq('user_id', orgId);
      if (channelError) {
        throw channelError;
      }
      await recordAdminAudit(req.admin, 'WHATSAPP_DISCONNECT_WABA', orgId);
    } else if (action === 'request_phone_code') {
      const codeMethod = String(req.body.codeMethod || '').toUpperCase() === 'VOICE' ? 'VOICE' : 'SMS';
      const language = normalizeString(req.body.language) || 'en_US';
      await requestWhatsAppVerificationCode(orgId, codeMethod, language);
      await recordAdminAudit(req.admin, 'WHATSAPP_REQUEST_PHONE_CODE', orgId, { codeMethod, language });
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

app.get('/api/admin/users', requireAdmin, requireAdminPermission('global_users'), async (req, res) => {
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

app.get('/api/admin/users/:userId', requireAdmin, requireAdminPermission('global_users'), async (req, res) => {
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
    const loginActivity = await loadUserLoginActivity(userId, authUser);
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
        loginActivity,
      },
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.patch('/api/admin/users/:userId/profile', requireAdmin, requireAdminPermission('global_users'), async (req: AdminRequest, res) => {
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

app.post('/api/admin/users/:userId/credits', requireAdmin, requireAdminPermission('global_users'), async (req: AdminRequest, res) => {
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
        currency: normalizeString(req.body.currency) || 'INR',
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

app.post('/api/admin/users/:userId/notice', requireAdmin, requireAdminPermission('global_users'), async (req: AdminRequest, res) => {
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

app.post('/api/admin/users/:userId/auth', requireAdmin, requireAdminPermission('global_users'), async (req: AdminRequest, res) => {
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

app.get('/api/admin/payments', requireAdmin, requireAdminPermission('payments'), async (_req, res) => {
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

    const enrichedProfiles = await enrichProfilesWithPaymentMethods(profiles.rows);

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
      profiles: enrichedProfiles,
      creditLedger: creditLedger.rows,
      paymentEvents: paymentEvents.rows,
      generatedAt: nowIso(),
    });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/admin/webhooks', requireAdmin, requireAdminPermission('webhooks'), async (_req, res) => {
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

app.get('/api/admin/server', requireAdmin, requireAdminPermission('server_status'), async (_req, res) => {
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

app.get('/api/admin/audit', requireAdmin, requireAdminPermission('security_audit'), async (_req, res) => {
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
