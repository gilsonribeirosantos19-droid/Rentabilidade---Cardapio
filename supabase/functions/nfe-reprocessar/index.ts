import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TENANT_ID   = '33e81daf-662f-43d1-8684-0702e959c4f9'
const FOCUS_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')!
const FOCUS_URL   = 'https://api.focusnfe.com.br'
const FOCUS_AUTH  = 'Basic ' + btoa(FOCUS_TOKEN + ':')

// Manifesta ciência. Loga o status + resposta (pra rastrear se a SEFAZ aceitou).
async function manifestarCiencia(chave: string) {
  try {
    const res = await fetch(`${FOCUS_URL}/v2/nfes_recebidas/${chave}/manifesto`, {
      method: 'POST',
      headers: { 'Authorization': FOCUS_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ciencia' }),
    })
    const txt = await res.text()
    console.log(`[manifesto] ${chave} -> HTTP ${res.status} | ${txt.substring(0, 200)}`)
    return res.status
  } catch (e) {
    console.error(`[manifesto] ${chave} -> ERRO: ${(e as Error).message}`)
    return 0
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
  const { data: pendentes } = await supabase
    .from('nfe_recebidas')
    .select('id, chave_acesso, numero')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'em_transito')

  console.log(`[reprocessar] inicio — ${pendentes?.length || 0} nota(s) em transito`)

  if (!pendentes || !pendentes.length) {
    return new Response(JSON.stringify({ ok: true, pendentes: 0, completadas: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data: vincExist } = await supabase
    .from('insumo_fornecedores')
    .select('id,codigo_fornecedor,insumo_id,qtd_por_embalagem,fornecedor_id')
    .eq('tenant_id', TENANT_ID)

  // Fornecedores do tenant (p/ casar o emitente da nota pelo CNPJ) — evita o mis-link:
  // código sozinho (ex.: genéricos 2000000000xxx) colide entre fornecedores. Só auto-vincula
  // se o vínculo for DO fornecedor da nota (mesma regra do nfe-webhook).
  const { data: fornAll } = await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', TENANT_ID)

  let completadas = 0

  for (const nfe of pendentes) {
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

    const mStatus = await manifestarCiencia(nfe.chave_acesso)
    const completa = await fetchNfeCompleta(nfe.chave_acesso)
    const itensNfe = completa?.requisicao_nota_fiscal?.itens || []
    if (!itensNfe.length) {
      console.log(`[reprocessar] nota ${nfe.numero} -> XML sem itens ainda (manifesto HTTP ${mStatus}). Tenta na proxima rodada.`)
      continue
    }

    // fornecedor da nota pelo CNPJ do emitente (posições 6-20 da chave)
    const cnpjEmit  = String(nfe.chave_acesso || '').substring(6, 20)
    const fornNotaId = (fornAll || []).find((f: any) => String(f.cnpj || '').replace(/\D/g, '') === cnpjEmit)?.id || null

    const itensBatch = itensNfe.map((item: any) => {
      const codigo = String(item.codigo_produto || '')
      // SÓ auto-vincula se o vínculo for do fornecedor DESTA nota (casa código + fornecedor_id)
      const vinc   = fornNotaId ? vincExist?.find(v => v.codigo_fornecedor === codigo && v.fornecedor_id === fornNotaId) : null
      return {
        nfe_id:                 nfe.id,
        tenant_id:              TENANT_ID,
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

  console.log(`[reprocessar] fim — ${completadas} de ${pendentes.length} completada(s)`)
  return new Response(JSON.stringify({ ok: true, pendentes: pendentes.length, completadas }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
