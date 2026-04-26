const DEFAULT_TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '0x4AAAAAAC9513RDryb1Cua4';
const LOCAL_TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_LOCAL_SITE_KEY?.trim() || '';
const HOSTNAME =
  typeof window !== 'undefined' ? window.location.hostname.trim().toLowerCase() : '';
const IS_LOCALHOST =
  HOSTNAME === 'localhost' ||
  HOSTNAME === '127.0.0.1' ||
  HOSTNAME === '0.0.0.0' ||
  HOSTNAME === '::1' ||
  HOSTNAME === '[::1]';
const TURNSTILE_SITE_KEY = IS_LOCALHOST
  ? LOCAL_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY
  : DEFAULT_TURNSTILE_SITE_KEY;

export const clientConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  adminApiBaseUrl: import.meta.env.VITE_ADMIN_API_BASE_URL || '/api/admin',
  turnstile: {
    siteKey: TURNSTILE_SITE_KEY,
    isLocalhost: IS_LOCALHOST,
    usingLocalOverride: Boolean(IS_LOCALHOST && LOCAL_TURNSTILE_SITE_KEY),
  },
};

export function hasSupabaseConfig() {
  return Boolean(clientConfig.supabaseUrl && clientConfig.supabaseAnonKey);
}

export const hasTurnstileSiteKey = Boolean(TURNSTILE_SITE_KEY);
