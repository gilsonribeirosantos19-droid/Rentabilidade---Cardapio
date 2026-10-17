// Edge Function: sso-emitir
// Entrar direto (SSO-lite): emite um token de USO ÚNICO e curto (60s) pro usuário LOGADO
// entrar num sistema da rede sem digitar senha de novo. O token é consumido pelo sistema-alvo
// via a RPC sso_consumir_token do AIKO.
//
// Segurança:
//  • Só funciona pra quem está logado (o token é emitido pro e-mail do PRÓPRIO chamador).
//  • Token aleatório, curto (60s) e de uso único (ver tabela sso_tokens + a RPC).
//  • O sistema-alvo ainda precisa validar com o AIKO (segredo da ponte) antes de logar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SISTEMAS = new Set(['avaliacoes', 'checklist', 'manutencao'])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function novoToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'Metodo nao permitido' }, 405)

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // quem pede o crachá precisa estar logado — e o crachá é SÓ pro e-mail dele.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!jwt) return json({ ok: false, erro: 'sem autenticacao' }, 401)
    const { data: ud, error: uErr } = await admin.auth.getUser(jwt)
    if (uErr || !ud?.user?.email) return json({ ok: false, erro: 'sessao invalida' }, 401)
    const email = ud.user.email

    const body = await req.json().catch(() => ({}))
    const sistema = (body.sistema || '').toString()
    if (!SISTEMAS.has(sistema)) return json({ ok: false, erro: 'sistema desconhecido' }, 400)

    const token = novoToken()
    const expires = new Date(Date.now() + 60_000).toISOString()  // 60 segundos
    const { error } = await admin.from('sso_tokens').insert({ token, email, sistema, expires_at: expires })
    if (error) return json({ ok: false, erro: error.message }, 500)

    return json({ ok: true, token })
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message || String(e) }, 500)
  }
})
