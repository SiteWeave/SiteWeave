import { createSupabaseClient } from './utils/supabaseClient.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  const isProduction = import.meta.env.PROD
  const errorMsg = isProduction
    ? 'Missing Supabase environment variables. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment platform (Netlify environment variables).'
    : 'Missing Supabase environment variables. Please create apps/web/.env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  throw new Error(errorMsg)
}

export const supabase = createSupabaseClient(url, anon)


