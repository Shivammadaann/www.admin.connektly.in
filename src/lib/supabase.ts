import { createClient, type Session } from '@supabase/supabase-js';
import { clientConfig } from './config';

export const supabase = createClient(
  clientConfig.supabaseUrl || 'https://placeholder.supabase.co',
  clientConfig.supabaseAnonKey || 'placeholder-key',
);

let cachedSession: Session | null | undefined;
let sessionPromise: Promise<Session | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
});

export async function getCachedSession() {
  if (cachedSession !== undefined) {
    return cachedSession;
  }

  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          throw error;
        }

        if (data.session) {
          const { error: userError } = await supabase.auth.getUser(data.session.access_token);
          if (userError) {
            await supabase.auth.signOut();
            cachedSession = null;
            return null;
          }
        }

        cachedSession = data.session;
        return data.session;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }

  return sessionPromise;
}
