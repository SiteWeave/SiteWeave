import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client instance
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Supabase anonymous key
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client instance
 */
export function createSupabaseClient(supabaseUrl, supabaseAnonKey) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      // One shared socket for all channels; avoids hammering reconnect on boot.
      params: { eventsPerSecond: 10 },
    },
  })
}

