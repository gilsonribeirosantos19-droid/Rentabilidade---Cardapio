// ════════════════════════════════════════════════════════════════════════════
//  saipos-sync — CAPTURA de vendas via SAIPOS → CAMADA DE VENDAS GENÉRICA (PULL)
//  Usa DOIS endpoints da API de Consulta de Dados (Bearer <SAIPOS_TOKEN>):
//    • GET /v1/search_sales  → PEDIDOS  → recebimento_vendas (faturamento/turno/pessoas/comandas).
//        faturamento = Σ total_amount (COM taxa de serviço) dos pedidos com canceled='N'. BATE com o painel.
//        turno vem pronto (store_shift.desc_store_shift = 'almoço'/'jantar'), pessoas = customers_on_table.
//    • GET /v1/sales_items   → ITENS    → vendas_produto_dia + vendas_item (produtos p/ CMV/CurvaABC/Engenharia).
//  De-para: produtos.codigo_pdv == item.integration_code → produto → ficha (ficha_id).
//  Loja: no piloto (tenant com 1 loja) usa a única loja ativa.
//  ⚠️ ROBUSTEZ: DIA A DIA (do mais NOVO pro mais antigo), com retry. Se um fetch falhar (504), PULA e
//     PRESERVA o que já existe. Grava dia a dia (progresso não se perde no timeout).
//  Modos (body.mode): 'diag' (só conta, não grava) | 'pull' (grava). body.dias = quantos dias atrás.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TENANT_MORI = '33e81daf-662f-43d1-8684-0702e959c4f9' // piloto Saipos
const SAIPOS_BASE = 'https://data.saipos.io/v1'
const SAIPOS_TOKEN = Deno.env.get('SAIPOS_TOKEN') || ''
const BUDGET_MS = 110000
const CORTE_ALMOCO_H = 17     // fallback de turno se o pedido não trouxer store_shift

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })
const ymd = (d: Date) => d.toISOString().substring(0, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// últimos `dias` dias, do MAIS NOVO pro mais antigo (o cron precisa do dia de ontem primeiro)
function ultimosDias(dias: number): string[] {
  const out: string[] = []
  for (let i = 0; i <= dias; i++) out.push(ymd(new Date(Date.now() - i * 86400000)))
  return out
}

// dias de um intervalo explícito de/ate (p/ backfill de datas específicas). Trava em 90 dias.
function diasNoIntervalo(de: string, ate: string): string[] {
  const out: string[] = []
  const d = new Date(de + 'T00:00:00Z'); const fim = new Date(ate + 'T00:00:00Z')
  while (d <= fim && out.length < 90) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

// GET genérico de um recurso do Saipos p/ UM dia. Até 3 tentativas (504 sob carga).
async function buscar(recurso: string, dia: string, offset: number) {
  const qs = new URLSearchParams({
    p_date_column_filter: 'shift_date',
    p_filter_date_start: `${dia} 00:00:00`,
    p_filter_date_end: `${dia} 23:59:59`,
    p_limit: '1000',
    p_offset: String(offset),
  })
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SAIPOS_BASE}/${recurso}?${qs}`, { headers: { Authorization: `Bearer ${SAIPOS_TOKEN}` } })
      const raw = await res.text()
      if (res.status === 200) {
        let data: unknown = null
        try { data = JSON.parse(raw) } catch { /* ignore */ }
        return { status: 200, rows: Array.isArray(data) ? (data as any[]) : [] }
      }
      if (res.status >= 500 && attempt < 3) { await sleep(2000); continue }
      return { status: res.status, rows: [] as any[] }
    } catch (_e) {
      if (attempt < 3) { await sleep(2000); continue }
      return { status: 0, rows: [] as any[] }
    }
  }
  return { status: 0, rows: [] as any[] }
}

// lê TODAS as páginas de um recurso p/ um dia (respeitando o budget). ok=false se algum fetch falhar.
async function buscarTudo(recurso: string, dia: string, inicio: number) {
  const rows: any[] = []
  let ok = true, status = 0
  for (let off = 0; off < 200000; off += 1000) {
    if (Date.now() - inicio > BUDGET_MS) { ok = false; break }
    const r = await buscar(recurso, dia, off)
    status = r.status
    if (r.status !== 200) { ok = false; break }
    if (!r.rows.length) break
    rows.push(...r.rows)
    if (r.rows.length < 1000) break
  }
  return { ok, status, rows }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  if (!SAIPOS_TOKEN) return json({ error: 'falta o secret SAIPOS_TOKEN' }, 400)

  const body = await req.json().catch(() => ({})) as any
  const tenant = body.tenant || TENANT_MORI
  const dias = Number(body.dias) || 15
  const modo = body.mode || 'diag'
  const corte = Number(body.corte) || CORTE_ALMOCO_H
  // body.de + body.ate ('YYYY-MM-DD') → puxa esse intervalo exato (backfill). Senão, últimos `dias`.
  const de = String(body.de || ''), ate = String(body.ate || '')
  const listaDias = (/^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate)) ? diasNoIntervalo(de, ate) : ultimosDias(dias)

  // de-para p/ os ITENS: codigo_pdv (== integration_code) → produto (id/nome/grupo) → ficha_id
  const { data: prods } = await supabase.from('produtos').select('id,codigo_pdv,nome,grupo').eq('tenant_id', tenant)
  const prodByCod = new Map<string, { id: string; nome: string | null; grupo: string | null }>()
  for (const p of prods || []) { const c = String((p as any).codigo_pdv ?? '').trim(); if (c) prodByCod.set(c, { id: (p as any).id, nome: (p as any).nome ?? null, grupo: (p as any).grupo ?? null }) }
  const { data: fichas } = await supabase.from('fichas_tecnicas').select('id,produto_id').eq('tenant_id', tenant).eq('status', 'ativa')
  const fichaByProduto = new Map<string, string>()
  for (const f of fichas || []) { if ((f as any).produto_id) fichaByProduto.set((f as any).produto_id, (f as any).id) }

  // loja: piloto = tenant com 1 loja ativa
  const { data: lojasRows } = await supabase.from('lojas').select('id').eq('tenant_id', tenant).eq('ativo', true)
  const lojaUnica = (lojasRows && lojasRows.length === 1) ? (lojasRows[0] as any).id as string : null

  const inicio = Date.now()
  const now = new Date().toISOString()
  let faturamentoTotal = 0, comandasTotal = 0, itensLidos = 0, comProduto = 0, semProduto = 0, comFicha = 0
  let gravRec = 0, gravProd = 0, gravItem = 0, diasRec = 0, diasProd = 0, diasPulados = 0, ultimoStatus = 0
  const semProdNomes = new Map<string, number>()

  for (const dia of listaDias) {
    if (Date.now() - inicio > BUDGET_MS) break

    // ═══ 1) PEDIDOS (search_sales) → recebimento_vendas ═══
    const ped = await buscarTudo('search_sales', dia, inicio)
    ultimoStatus = ped.status
    if (ped.ok && ped.rows.length) {
      let fat = 0, almoco = 0, jantar = 0, desconto = 0, taxa = 0, subtotal = 0, pessoas = 0, comandas = 0, canceladas = 0
      for (const v of ped.rows) {
        if (v?.canceled === 'Y' || v?.canceled === true) { canceladas++; continue }   // pedido cancelado → fora
        const tot = Number(v?.total_amount) || 0
        fat += tot; comandas++
        subtotal += Number(v?.total_amount_items) || 0
        desconto += Number(v?.total_discount) || 0
        taxa += Number(v?.table_order?.total_service_charge_amount) || 0
        pessoas += Number(v?.table_order?.customers_on_table) || 0
        const shift = String(v?.store_shift?.desc_store_shift || '').toLowerCase()
        const isAlmoco = shift ? shift.startsWith('almo') : (Number(String(v?.created_at || '').substring(11, 13)) < corte)
        if (isAlmoco) almoco += tot; else jantar += tot
      }
      faturamentoTotal += fat; comandasTotal += comandas
      if (modo === 'pull' && lojaUnica) {
        await supabase.from('recebimento_vendas').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').eq('data', dia)
        const { error } = await supabase.from('recebimento_vendas').insert({
          tenant_id: tenant, loja_id: lojaUnica, data: dia,
          faturado: Number(fat.toFixed(2)), subtotal: Number(subtotal.toFixed(2)),
          desconto: Number(desconto.toFixed(2)), taxa: Number(taxa.toFixed(2)), couvert: 0, qtd_caixas: 0,
          qtd_comandas: comandas, qtd_canceladas: canceladas, pessoas,
          ticket_medio: comandas ? Number((fat / comandas).toFixed(2)) : 0,
          fat_almoco: Number(almoco.toFixed(2)), fat_jantar: Number(jantar.toFixed(2)),
          por_canal: null, status: 'processado', erros: null, fonte: 'saipos',
          data_integracao: now, atualizado_em: now,
        })
        if (!error) { gravRec++; diasRec++ }
      } else if (modo !== 'pull') { diasRec++ }
    } else { diasPulados++ }

    // ═══ 2) ITENS (sales_items) → vendas_produto_dia + vendas_item ═══
    if (Date.now() - inicio > BUDGET_MS) break
    const its = await buscarTudo('sales_items', dia, inicio)
    if (its.ok && its.rows.length) {
      const pd = new Map<number, { produto_nome: string | null; grupo: string | null; ficha_id: string | null; qtd: number; faturado: number }>()
      const itemRows: any[] = []
      for (const venda of its.rows) {
        const items = Array.isArray(venda?.items) ? venda.items : []
        for (const it of items) {
          itensLidos++
          const qtd = Number(it?.quantity) || 0
          const vu = Number(it?.unit_price) || 0
          const vt = Number((qtd * vu).toFixed(2))
          const cod = String(it?.integration_code ?? '').trim()
          const p = cod ? prodByCod.get(cod) : undefined
          if (!p) { semProduto++; const nm = String(it?.desc_sale_item || '(sem nome)'); semProdNomes.set(nm, (semProdNomes.get(nm) || 0) + 1); continue }
          comProduto++
          const fid = fichaByProduto.get(p.id) || null
          if (fid) comFicha++
          itemRows.push({
            tenant_id: tenant, data: dia, ficha_id: fid,
            produto_nome: String(it?.desc_sale_item || '(sem nome)'),
            quantidade: qtd, valor_unitario: vu, valor_total: vt,
            canal: null, pdv_ref: 'saipos:' + (it?.id_sale_item ?? ''),
          })
          const prodNum = /^\d+$/.test(cod) ? Number(cod) : null
          if (prodNum !== null) {
            const a = pd.get(prodNum) || { produto_nome: p.nome, grupo: p.grupo, ficha_id: fid, qtd: 0, faturado: 0 }
            a.qtd += qtd; a.faturado = Number((a.faturado + vt).toFixed(2)); pd.set(prodNum, a)
          }
        }
      }
      if (modo === 'pull' && lojaUnica) {
        await supabase.from('vendas_item').delete().eq('tenant_id', tenant).like('pdv_ref', 'saipos:%').eq('data', dia)
        for (let i = 0; i < itemRows.length; i += 500) { const { error } = await supabase.from('vendas_item').insert(itemRows.slice(i, i + 500)); if (!error) gravItem += Math.min(500, itemRows.length - i) }
        await supabase.from('vendas_produto_dia').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').eq('data', dia)
        const pdRows = [...pd.entries()].map(([produto_id, a]) => ({ tenant_id: tenant, loja_id: lojaUnica, data: dia, produto_id, produto_nome: a.produto_nome, grupo: a.grupo, qtd: a.qtd, faturado: a.faturado, ficha_id: a.ficha_id, fonte: 'saipos', atualizado_em: now }))
        for (let i = 0; i < pdRows.length; i += 500) { const { error } = await supabase.from('vendas_produto_dia').insert(pdRows.slice(i, i + 500)); if (!error) gravProd += Math.min(500, pdRows.length - i) }
        diasProd++
      } else if (modo !== 'pull') { diasProd++ }
    }
  }

  const cobertura = comProduto ? Math.round((comFicha / comProduto) * 100) : 0
  const res: any = {
    ok: true, modo, tenant, dias_recebimento: diasRec, dias_produtos: diasProd, dias_pulados: diasPulados,
    faturamento: Number(faturamentoTotal.toFixed(2)), comandas: comandasTotal,
    itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura,
    gravados_recebimento: gravRec, gravados_produto_dia: gravProd, gravados_item: gravItem, ultimoStatus,
  }
  if (modo !== 'pull') res.topSemProduto = [...semProdNomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([nome, qtd]) => ({ nome, qtd }))
  console.log('saipos', modo, { tenant, diasRec, diasProd, faturamentoTotal, gravRec, gravProd, gravItem })
  return json(res)
})
