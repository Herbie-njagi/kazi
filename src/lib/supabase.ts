import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { createMockSupabaseClient } from './mockSupabase';

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const localUrl = typeof window !== 'undefined' ? localStorage.getItem('pos26_supabase_url')?.trim() : null;
const localKey = typeof window !== 'undefined' ? localStorage.getItem('pos26_supabase_anon_key')?.trim() : null;

const supabaseUrl = envUrl || localUrl;
const supabaseAnonKey = envKey || localKey;

export const isUsingMockDatabase = !supabaseUrl || !supabaseAnonKey;

export const supabase: SupabaseClient<Database> =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : (createMockSupabaseClient() as unknown as SupabaseClient<Database>);
