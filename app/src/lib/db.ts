import { supabase } from './supabase'

// busca paginada (equivalente ao apiAll do utils.js — vence o limite de 1000 do PostgREST)
export async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []; let from = 0; const size = 1000
  for (;;) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]; out.push(...rows)
    if (rows.length < size) break
    from += size
  }
  return out
}

export { supabase }
