// Edge Function: admin-users
// Gerencia usuários (criar / atualizar senha) com a chave admin no SERVIDOR.
// Só ADMINISTRADORES logados conseguem chamar. A chave service_role NUNCA vai pro navegador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Prefere a SECRET KEY nova (env APP_SERVICE_KEY); cai pra legacy service_role só durante a transição.
const SERVICE_KEY  = Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'Metodo nao permitido' }, 405)

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 1) Identifica quem esta chamando (precisa estar logado)
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'Sem autenticacao' }, 401)
    const { data: ud, error: uErr } = await admin.auth.getUser(jwt)
    if (uErr || !ud?.user) return json({ error: 'Sessao invalida' }, 401)

    // 2) Confere se eh administrador (na tabela usuarios)
    const { data: caller } = await admin.from('usuarios')
      .select('role, tenant_id').eq('id', ud.user.id).maybeSingle()
    const role = ((caller?.role || '') + '').toLowerCase()
    if (!role.startsWith('admin'))
      return json({ error: 'Apenas administradores podem gerenciar usuarios' }, 403)

    // 3) Executa a acao pedida
    const body = await req.json().catch(() => ({}))

    if (body.action === 'create') {
      if (!body.email || !body.password) return json({ error: 'E-mail e senha sao obrigatorios' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email, password: body.password, email_confirm: true,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ id: data.user.id })
    }

    if (body.action === 'update_password') {
      if (!body.userId || !body.password) return json({ error: 'userId e senha sao obrigatorios' }, 400)
      // o usuario-alvo TEM que ser do mesmo tenant do admin que chamou (senao um admin de um
      // cliente resetaria a senha de usuario de outro cliente)
      const { data: alvo } = await admin.from('usuarios').select('tenant_id').eq('id', body.userId).maybeSingle()
      if (!alvo || alvo.tenant_id !== caller?.tenant_id)
        return json({ error: 'Usuario nao pertence ao seu tenant' }, 403)
      const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'delete') {
      if (!body.userId) return json({ error: 'userId obrigatorio' }, 400)
      if (body.userId === ud.user.id) return json({ error: 'Voce nao pode remover a si mesmo' }, 400)
      // o alvo tem que ser do mesmo tenant do admin que chamou
      const { data: alvo } = await admin.from('usuarios').select('tenant_id').eq('id', body.userId).maybeSingle()
      if (!alvo || alvo.tenant_id !== caller?.tenant_id)
        return json({ error: 'Usuario nao pertence ao seu tenant' }, 403)
      // apaga o PERFIL e a CONTA DE LOGIN (senao a conta de auth fica orfa)
      await admin.from('usuarios').delete().eq('id', body.userId)
      const { error } = await admin.auth.admin.deleteUser(body.userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acao desconhecida' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
