// ════════════════════════════════════════════════════════════════════════════
//  saipos-sync — CAPTURA de vendas via SAIPOS (API de Consulta de Dados, PULL)
//  Fonte: GET https://data.saipos.io/v1/sales_items (Bearer <SAIPOS_TOKEN>)
//  Destino: vendas_item (tenant-level; a tabela NÃO tem loja_id nem produto_id).
//  De-para: produtos.codigo_pdv == item.integration_code → produto → ficha (ficha_id).
//  Modos (body.mode):
//    'diag' (padrão) → conta itens + cobertura (quantos mapeiam p/ ficha). NÃO grava.
//    'pull'          → apaga os itens Saipos do período (pdv_ref 'saipos:%') e reinsere.
//  Idempotente por período (delete-then-insert). Multi-tenant via body.tenant.
//  ⚠️ máx 15 dias por consulta (limite da API) → quebra em janelas.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TENANT_MORI = '33e81daf-662f-43d1-8684-0702e959c4f9' // piloto Saipos
const SAIPOS_BASE = 'https://data.saipos.io/v1'
const SAIPOS_TOKEN = Deno.env.get('SAIPOS_TOKEN') || ''
const JANELA_DIAS = 15        // máximo por consulta na API do Saipos
const BUDGET_MS = 110000

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })
const ymd = (d: Date) => d.toISOString().substring(0, 10)

// janelas de <= 15 dias cobrindo os últimos `dias`
function janelas(dias: number): Array<{ ini: string; fim: string }> {
  const out: Array<{ ini: string; fim: string }> = []
  const fimTotal = Date.now()
  let cur = fimTotal - dias * 86400000
  while (cur <= fimTotal) {
    const jf = Math.min(cur + JANELA_DIAS * 86400000, fimTotal)
    out.push({ ini: ymd(new Date(cur)), fim: ymd(new Date(jf)) })
    cur = jf + 86400000
  }
  return out
}

// GET sales_items (uma página de VENDAS; cada venda tem items[])
async function buscarVendas(ini: string, fim: string, limit: number, offset: number) {
  const qs = new URLSearchParams({
    p_date_column_filter: 'shift_date',
    p_filter_date_start: `${ini} 00:00:00`,
    p_filter_date_end: `${fim} 23:59:59`,
    p_limit: String(limit),
    p_offset: String(offset),
  })
  const res = await fetch(`${SAIPOS_BASE}/sales_items?${qs}`, { headers: { Authorization: `Bearer ${SAIPOS_TOKEN}` } })
  const raw = await res.text()
  let data: unknown = null
  try { data = JSON.parse(raw) } catch { /* ignore */ }
  return { status: res.status, sales: Array.isArray(data) ? (data as any[]) : [], rawHead: raw.substring(0, 300) }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  if (!SAIPOS_TOKEN) return json({ error: 'falta o secret SAIPOS_TOKEN' }, 400)

  const body = await req.json().catch(() => ({})) as any
  const tenant = body.tenant || TENANT_MORI
  const dias = Number(body.dias) || 30
  const modo = body.mode || 'diag'

  // de-para: codigo_pdv (== integration_code) → produto_id → ficha_id
  const { data: prods } = await supabase.from('produtos').select('id,codigo_pdv').eq('tenant_id', tenant)
  const prodByCod = new Map<string, string>()
  for (const p of prods || []) { const c = String((p as any).codigo_pdv ?? '').trim(); if (c) prodByCod.set(c, (p as any).id) }
  const { data: fichas } = await supabase.from('fichas_tecnicas').select('id,produto_id').eq('tenant_id', tenant).eq('status', 'ativa')
  const fichaByProduto = new Map<string, string>()
  for (const f of fichas || []) { if ((f as any).produto_id) fichaByProduto.set((f as any).produto_id, (f as any).id) }

  const wins = janelas(dias)
  const inicio = Date.now()
  let itensLidos = 0, comProduto = 0, semProduto = 0, comFicha = 0, gravados = 0, ultimoStatus = 0, ultimoRaw = ''
  const rows: any[] = []
  const semProdNomes = new Map<string, number>()   // ranking dos nomes que NÃO bateram (só diag)

  for (const w of wins) {
    for (let off = 0; off < 200000; off += 1000) {
      if (Date.now() - inicio > BUDGET_MS) break
      const r = await buscarVendas(w.ini, w.fim, 1000, off)
      ultimoStatus = r.status; ultimoRaw = r.rawHead
      if (r.status !== 200) break
      if (!r.sales.length) break
      for (const venda of r.sales) {
        const dia = String(venda?.shift_date || '').substring(0, 10) || null
        const items = Array.isArray(venda?.items) ? venda.items : []
        for (const it of items) {
          if (it?.deleted === 'Y' || it?.deleted === true) continue   // item CANCELADO (Saipos usa 'Y'/'N')
          itensLidos++
          const cod = String(it?.integration_code ?? '').trim()
          const pid = cod ? prodByCod.get(cod) : undefined
          if (!pid) {   // não é produto cadastrado (inclusão de rodízio, etc.) → ignora
            semProduto++
            const nm = String(it?.desc_sale_item || '(sem nome)')
            semProdNomes.set(nm, (semProdNomes.get(nm) || 0) + 1)
            continue
          }
          comProduto++
          const fid = fichaByProduto.get(pid)
          if (fid) comFicha++
          const qtd = Number(it?.quantity) || 0
          const vu = Number(it?.unit_price) || 0
          rows.push({
            tenant_id: tenant, data: dia, ficha_id: fid || null,
            produto_nome: String(it?.desc_sale_item || '(sem nome)'),
            quantidade: qtd, valor_unitario: vu, valor_total: Number((qtd * vu).toFixed(2)),
            canal: null, pdv_ref: 'saipos:' + (it?.id_sale_item ?? ''),
          })
        }
      }
      if (r.sales.length < 1000) break
    }
    if (Date.now() - inicio > BUDGET_MS) break
  }

  const cobertura = comProduto ? Math.round((comFicha / comProduto) * 100) : 0

  // DIAG: só conta (não grava). topSemProduto = os 30 nomes que MAIS aparecem sem bater produto.
  if (modo !== 'pull') {
    const topSemProduto = [...semProdNomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([nome, qtd]) => ({ nome, qtd }))
    return json({ modo: 'diag', tenant, janelas: wins.length, itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura, topSemProduto, ultimoStatus })
  }

  // PULL: apaga os itens Saipos do período e reinsere (idempotente)
  const dataMin = ymd(new Date(Date.now() - dias * 86400000))
  await supabase.from('vendas_item').delete().eq('tenant_id', tenant).like('pdv_ref', 'saipos:%').gte('data', dataMin)
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).filter((r) => r.data)
    if (!chunk.length) continue
    const { error } = await supabase.from('vendas_item').insert(chunk)
    if (!error) gravados += chunk.length
  }

  console.log('saipos pull:', { tenant, itensLidos, comProduto, comFicha, gravados })
  return json({ ok: true, modo: 'pull', tenant, janelas: wins.length, itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura, gravados, ultimoStatus })
})
