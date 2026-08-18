import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const rawUrl: string | undefined = env.VITE_SUPABASE_URL;
const rawAnonKey: string | undefined = env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const supabaseUrl = isValidUrl(rawUrl) ? rawUrl!.trim() : 'https://placeholder-project.supabase.co';
const supabaseAnonKey = rawAnonKey && typeof rawAnonKey === 'string' && rawAnonKey.trim().length > 0 
  ? rawAnonKey.trim() 
  : 'placeholder-anon-key';

export const isSupabaseConfigured = (): boolean => {
  return (
    isValidUrl(rawUrl) &&
    !rawUrl!.includes('placeholder') &&
    Boolean(rawAnonKey && rawAnonKey.trim().length > 0 && !rawAnonKey.includes('placeholder'))
  );
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

