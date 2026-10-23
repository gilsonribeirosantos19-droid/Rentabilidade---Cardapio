import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // SECRET nova (APP_SERVICE_KEY) — bypassa RLS. A legacy service_role foi revogada.
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// MULTI-TENANT: resgata as notas 'em_transito' de QUALQUER tenant (Mori, Joya, Sushi PN, novos...).
// Antes o tenant estava FIXO no Mori — por isso as notas da Joya nunca completavam o XML e ficavam
// presas em "Pendente SEFAZ" pra sempre (nada manifestava ciência nem baixava o XML pra elas).
const FOCUS_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')!
const FOCUS_URL   = 'https://api.focusnfe.com.br'
const FOCUS_AUTH  = 'Basic ' + btoa(FOCUS_TOKEN + ':')

// Manifesta ciência. Devolve o HTTP do Focus + o cStat da SEFAZ (status_sefaz) e a mensagem.
// cStat 650 = NF-e Cancelada ou Denegada: a ciência é rejeitada e o XML completo nunca é liberado.
async function manifestarCiencia(chave: string) {
  try {
    const res = await fetch(`${FOCUS_URL}/v2/nfes_recebidas/${chave}/manifesto`, {
      method: 'POST',
      headers: { 'Authorization': FOCUS_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ciencia' }),
    })
    const txt = await res.text()
    console.log(`[manifesto] ${chave} -> HTTP ${res.status} | ${txt.substring(0, 200)}`)
    let cStat: string | null = null, msg = ''
    try { const j = JSON.parse(txt); cStat = (j?.status_sefaz != null ? String(j.status_sefaz) : null); msg = String(j?.mensagem_sefaz ?? '') } catch { /* corpo não-JSON: ignora */ }
    return { http: res.status, cStat, msg }
  } catch (e) {
    console.error(`[manifesto] ${chave} -> ERRO: ${(e as Error).message}`)
    return { http: 0, cStat: null, msg: '' }
  }
}

// Busca a NF-e completa. Loga o status do Focus, a resposta de erro e a qtd de itens.
async function fetchNfeCompleta(chave: string) {
  try {
    const res = await fetch(`${FOCUS_URL}/v2/nfes_recebidas/${chave}.json?completa=1`, {
      headers: { 'Authorization': FOCUS_AUTH },
    })
    const txt = await res.text()
    if (!res.ok) {
      console.log(`[completa] ${chave} -> HTTP ${res.status} (XML indisponivel) | ${txt.substring(0, 250)}`)
      return null
    }
    let data: any = null
    try { data = JSON.parse(txt) } catch { console.error(`[completa] ${chave} -> resposta nao e JSON: ${txt.substring(0,150)}`); return null }
    const n = data?.requisicao_nota_fiscal?.itens?.length || 0
    console.log(`[completa] ${chave} -> HTTP ${res.status} | status_focus=${data?.status || '?'} | itens=${n}`)
    return data
  } catch (e) {
    console.error(`[completa] ${chave} -> ERRO: ${(e as Error).message}`)
    return null
  }
}

// Roda periodicamente (cron). Pega as notas "em_transito", tenta buscar os itens e completa.
Deno.serve(async (_req) => {
  // MULTI-TENANT: pega TODAS as notas presas em 'em_transito' (de qualquer tenant), trazendo o
  // tenant_id de cada uma pra escopar os vínculos/fornecedores corretos por nota.
  const { data: pendentes } = await supabase
    .from('nfe_recebidas')
    .select('id, chave_acesso, numero, tenant_id')
    .eq('status', 'em_transito')
    .limit(300)

  console.log(`[reprocessar] inicio — ${pendentes?.length || 0} nota(s) em transito`)

  if (!pendentes || !pendentes.length) {
    return new Response(JSON.stringify({ ok: true, pendentes: 0, completadas: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Caches POR TENANT: carrega os vínculos e fornecedores de cada tenant uma única vez (evita
  // uma query por nota). Fornecedores servem pra casar o emitente da nota pelo CNPJ e evitar o
  // mis-link: código sozinho (ex.: genéricos 2000000000xxx) colide entre fornecedores — só
  // auto-vincula se o vínculo for DO fornecedor da nota (mesma regra do nfe-webhook).
  const vincCache: Record<string, any[]> = {}
  const fornCache: Record<string, any[]> = {}

  let completadas = 0
  let canceladas = 0

  for (const nfe of pendentes) {
    const TEN = nfe.tenant_id as string
    if (!nfe.chave_acesso) { console.log(`[reprocessar] nota ${nfe.numero} sem chave — pulando`); continue }

    const { count } = await supabase
      .from('nfe_itens')
      .select('id', { count: 'exact', head: true })
      .eq('nfe_id', nfe.id)
    if (count && count > 0) {
      console.log(`[reprocessar] nota ${nfe.numero} ja tinha ${count} itens — corrigindo status`)
      await supabase.from('nfe_recebidas').update({ status: 'aguard_vinculacao' }).eq('id', nfe.id)
      continue
    }

    if (!vincCache[TEN]) vincCache[TEN] = (await supabase.from('insumo_fornecedores').select('id,codigo_fornecedor,insumo_id,qtd_por_embalagem,fornecedor_id').eq('tenant_id', TEN)).data || []
    if (!fornCache[TEN]) fornCache[TEN] = (await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', TEN)).data || []
    const vincExist = vincCache[TEN]
    const fornAll = fornCache[TEN]

    const m = await manifestarCiencia(nfe.chave_acesso)
    // cStat 650 = NF-e CANCELADA ou DENEGADA na SEFAZ. A ciência é rejeitada e o XML completo
    // nunca vem — então tira da fila de pendentes: marca como 'cancelada' (não fica tentando à toa).
    // A chave fica guardada (auditável/reversível). Guiado pela resposta REAL da SEFAZ, nota a nota.
    if (m.cStat === '650') {
      await supabase.from('nfe_recebidas').update({ status: 'cancelada' }).eq('id', nfe.id)
      canceladas++
      console.log(`[reprocessar] nota ${nfe.numero} -> CANCELADA/DENEGADA na SEFAZ (cStat 650) | ${m.msg.substring(0, 120)}`)
      continue
    }
    const completa = await fetchNfeCompleta(nfe.chave_acesso)
    const itensNfe = completa?.requisicao_nota_fiscal?.itens || []
    if (!itensNfe.length) {
      console.log(`[reprocessar] nota ${nfe.numero} -> XML sem itens ainda (manifesto HTTP ${m.http}). Tenta na proxima rodada.`)
      continue
    }

    // fornecedor da nota pelo CNPJ do emitente (posições 6-20 da chave)
    const cnpjEmit  = String(nfe.chave_acesso || '').substring(6, 20)
    const fornNotaId = (fornAll || []).find((f: any) => String(f.cnpj || '').replace(/\D/g, '') === cnpjEmit)?.id || null

    const itensBatch = itensNfe.map((item: any, i: number) => {
      const codigo = String(item.codigo_produto || '')
      // SÓ auto-vincula se o vínculo for do fornecedor DESTA nota (casa código + fornecedor_id)
      const vinc   = fornNotaId ? vincExist?.find(v => v.codigo_fornecedor === codigo && v.fornecedor_id === fornNotaId) : null
      const linha  = Number(item.numero_item) || (i + 1)   // nº da linha do XML (fallback = posição)
      return {
        nfe_id:                 nfe.id,
        tenant_id:              TEN,
        n_item:                 linha,   // trava de banco: índice único (nfe_id,n_item) barra a 2ª cópia
        descricao_nfe:          String(item.descricao || '').toUpperCase(),
        codigo_item_fornecedor: codigo,
        quantidade:             parseFloat(item.quantidade_comercial || '0'),
        unidade_nfe:            String(item.unidade_comercial || 'UN').toUpperCase(),
        valor_unitario:         parseFloat(item.valor_unitario_comercial || '0'),
        valor_total:            parseFloat(item.valor_bruto || '0') || (parseFloat(item.quantidade_comercial || '0') * parseFloat(item.valor_unitario_comercial || '0')),
        vinculacao_id:          vinc?.id || null,
      }
    })

    const { error: itensErr } = await supabase.from('nfe_itens').insert(itensBatch)
    if (itensErr) {
      console.error(`[reprocessar] nota ${nfe.numero} -> ERRO ao gravar itens: ${JSON.stringify(itensErr)}`)
      await supabase.from('nfe_recebidas').update({ status: 'com_erro' }).eq('id', nfe.id)
      continue
    }

    const semVinc    = itensBatch.filter((i: any) => !i.vinculacao_id).length
    const novoStatus = semVinc === 0 ? 'pronta' : 'aguard_vinculacao'
    await supabase.from('nfe_recebidas').update({ status: novoStatus }).eq('id', nfe.id)
    completadas++
    console.log(`[reprocessar] nota ${nfe.numero} -> COMPLETADA (${itensBatch.length} itens) -> ${novoStatus}`)
  }

  console.log(`[reprocessar] fim — ${completadas} completada(s), ${canceladas} cancelada(s) de ${pendentes.length}`)
  return new Response(JSON.stringify({ ok: true, pendentes: pendentes.length, completadas, canceladas }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
