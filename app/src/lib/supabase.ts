import { createClient } from '@supabase/supabase-js'

const SUPA_URL = import.meta.env.VITE_SUPA_URL as string
const SUPA_KEY = import.meta.env.VITE_SUPA_KEY as string

// Cliente Supabase compartilhado (mesma base/RLS do app atual).
export const supabase = createClient(SUPA_URL, SUPA_KEY)
