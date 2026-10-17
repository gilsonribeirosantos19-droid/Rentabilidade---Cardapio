// Edge Function: provisionar-rede
// Login único (Nível 1) — cria/garante o MESMO usuário nos outros sistemas da rede Aiko
// (Avaliações / Checklist / Manutenção), chamando o endpoint `provisionar-usuario` de cada um
// com o token compartilhado AIKO_PROVISION_TOKEN (guardado SÓ aqui, no servidor do AIKO).
//
// Segurança:
//  • Só ADMINISTRADORES logados podem chamar (mesmo padrão do admin-users).
//  • TETO DE PAPEL = gerente: a rede NUNCA cria admin/diretoria/supervisão nos outros sistemas
//    (papéis altos continuam só na criação manual, dentro de cada sistema).
//  • O token nunca vai pro navegador; fica no secret desta função.
//  • Aditivo e tolerante a falha: se um sistema der erro, os outros seguem; retorna o resultado de cada um.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISION_TOKEN = Deno.env.get('AIKO_PROVISION_TOKEN') || ''

// endpoints `provisionar-usuario` de cada sistema (cada um no seu projeto Supabase)
const SISTEMAS: Record<string, string> = {
  avaliacoes: 'https://ozfpiwoumfivjdpdhjrw.supabase.co/functions/v1/provisionar-usuario',
  checklist:  'https://cuhvqitzaabdyimedleo.supabase.co/functions/v1/provisionar-usuario',
  manutencao: 'https://wbxujcquakjtoyiuhmqy.supabase.co/functions/v1/provisionar-usuario',
}

// Teto de papel: a rede nunca cria acima de gerente. Qualquer coisa fora de garcom/gerente vira gerente.
const capPapel = (p: unknown) => {
  const x = ((p as string) || '').toLowerCase().trim()
  return (x === 'garcom' || x === 'gerente') ? x : 'gerente'
}

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

    // 1) quem chama precisa estar logado...
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'Sem autenticacao' }, 401)
    const { data: ud, error: uErr } = await admin.auth.getUser(jwt)
    if (uErr || !ud?.user) return json({ error: 'Sessao invalida' }, 401)

    // 2) ...e ser ADMINISTRADOR (na tabela usuarios)
    const { data: caller } = await admin.from('usuarios').select('role').eq('id', ud.user.id).maybeSingle()
    if (!((caller?.role || '') + '').toLowerCase().startsWith('admin'))
      return json({ error: 'Apenas administradores podem provisionar a rede' }, 403)

    if (!PROVISION_TOKEN)
      return json({ error: 'AIKO_PROVISION_TOKEN nao configurado no AIKO (secret ausente)' }, 500)

    // 3) dados do provisionamento
    const body = await req.json().catch(() => ({}))
    const email = (body.email || '').trim()
    const nome  = (body.nome || '').trim()
    const senha = (body.senha || '').trim()
    const loja  = (body.loja || '').trim()
    const papel = capPapel(body.papel)
    const alvo: string[] = Array.isArray(body.sistemas) ? body.sistemas : []
    if (!email || !senha) return json({ error: 'email e senha sao obrigatorios' }, 400)

    // 4) chama cada sistema selecionado (um erro NAO derruba os outros)
    const resultados: { sistema: string; ok: boolean; status?: string; erro?: string }[] = []
    for (const sis of alvo) {
      const url = SISTEMAS[sis]
      if (!url) { resultados.push({ sistema: sis, ok: false, erro: 'sistema desconhecido' }); continue }
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: PROVISION_TOKEN, email, nome, senha, papel, loja }),
        })
        const data = await r.json().catch(() => ({ ok: false, erro: 'resposta invalida' }))
        resultados.push({ sistema: sis, ok: !!data.ok, status: data.status, erro: data.erro })
      } catch (e) {
        resultados.push({ sistema: sis, ok: false, erro: (e as Error).message })
      }
    }

    return json({ ok: true, papelEnviado: papel, resultados })
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500)
  }
})
