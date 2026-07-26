// ════════════════════════════════════════════════════════════════════════════
//  saipos-sync — CAPTURA de vendas via SAIPOS → CAMADA DE VENDAS GENÉRICA (PULL)
//  Fonte: GET https://data.saipos.io/v1/sales_items (Bearer <SAIPOS_TOKEN>)
//  Grava em (todas com fonte='saipos', idempotente por período):
//    • recebimento_vendas  → portão/totais por loja×dia (faturado, comandas, turno, status='processado')
//    • vendas_produto_dia  → produtos vendidos por loja×dia (qtd, faturado, ficha_id) — alimenta CMV/CurvaABC/Engenharia
//    • vendas_item         → detalhe item-a-item (usado pela tela Divergências)
//  De-para: produtos.codigo_pdv == item.integration_code → produto → ficha.
//    produto_id gravado em vendas_produto_dia = o próprio código (== codigo_pdv), pra casar com o de-para das telas.
//  Turno: o Saipos NÃO manda turno → separa almoço/jantar pela HORA do created_at da venda (< CORTE = almoço).
//  Loja: mapeia por id_store; no piloto (tenant com 1 loja) usa a única loja ativa.
//  Modos (body.mode): 'diag' (padrão, só conta) | 'pull' (grava).
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
const CORTE_ALMOCO_H = 16     // hora local < 16h = almoço; senão jantar (Saipos não manda turno)

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

// GET sales_items (uma página de VENDAS; cada venda tem items[] + id_sale + shift_date + created_at)
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
  const corte = Number(body.corte) || CORTE_ALMOCO_H

  // de-para: codigo_pdv (== integration_code) → produto (id/nome/grupo) → ficha_id
  const { data: prods } = await supabase.from('produtos').select('id,codigo_pdv,nome,grupo').eq('tenant_id', tenant)
  const prodByCod = new Map<string, { id: string; nome: string | null; grupo: string | null }>()
  for (const p of prods || []) { const c = String((p as any).codigo_pdv ?? '').trim(); if (c) prodByCod.set(c, { id: (p as any).id, nome: (p as any).nome ?? null, grupo: (p as any).grupo ?? null }) }
  const { data: fichas } = await supabase.from('fichas_tecnicas').select('id,produto_id').eq('tenant_id', tenant).eq('status', 'ativa')
  const fichaByProduto = new Map<string, string>()
  for (const f of fichas || []) { if ((f as any).produto_id) fichaByProduto.set((f as any).produto_id, (f as any).id) }

  // loja: piloto = tenant com 1 loja ativa → usa ela. (multi-loja: mapear id_store → loja depois.)
  const { data: lojasRows } = await supabase.from('lojas').select('id').eq('tenant_id', tenant).eq('ativo', true)
  const lojaUnica = (lojasRows && lojasRows.length === 1) ? (lojasRows[0] as any).id as string : null

  const wins = janelas(dias)
  const inicio = Date.now()
  let itensLidos = 0, comProduto = 0, semProduto = 0, comFicha = 0, semLoja = 0
  let gravItem = 0, gravProd = 0, gravRec = 0, ultimoStatus = 0, ultimoRaw = ''
  const rowsItem: any[] = []
  const semProdNomes = new Map<string, number>()               // ranking dos nomes que NÃO bateram (diag)
  const recMap = new Map<string, { loja_id: string; dia: string; fat: number; almoco: number; jantar: number; comandas: Set<any> }>()
  const pdMap = new Map<string, { loja_id: string; dia: string; produto_id: number; produto_nome: string | null; grupo: string | null; ficha_id: string | null; qtd: number; faturado: number }>()

  for (const w of wins) {
    for (let off = 0; off < 200000; off += 1000) {
      if (Date.now() - inicio > BUDGET_MS) break
      const r = await buscarVendas(w.ini, w.fim, 1000, off)
      ultimoStatus = r.status; ultimoRaw = r.rawHead
      if (r.status !== 200) break
      if (!r.sales.length) break
      for (const venda of r.sales) {
        const dia = String(venda?.shift_date || '').substring(0, 10)
        if (!dia) continue
        const hora = Number(String(venda?.created_at || '').substring(11, 13))
        const turno = (hora >= 0 && hora < corte) ? 'almoco' : 'jantar'  // corte da hora local
        const loja_id = lojaUnica  // piloto: 1 loja
        const items = Array.isArray(venda?.items) ? venda.items : []
        let vendaTeveItem = false
        for (const it of items) {
          if (it?.deleted === 'Y' || it?.deleted === true) continue   // item CANCELADO (Saipos usa 'Y'/'N')
          itensLidos++
          const qtd = Number(it?.quantity) || 0
          const vu = Number(it?.unit_price) || 0
          const vt = Number((qtd * vu).toFixed(2))
          const cod = String(it?.integration_code ?? '').trim()

          // PORTÃO (recebimento): soma TODOS os itens vendidos (mesmo sem ficha) — é o faturamento real do dia.
          if (modo === 'pull') {
            if (!loja_id) { semLoja++ } else {
              const rk = loja_id + '|' + dia
              const rec = recMap.get(rk) || { loja_id, dia, fat: 0, almoco: 0, jantar: 0, comandas: new Set() }
              rec.fat += vt; if (turno === 'almoco') rec.almoco += vt; else rec.jantar += vt
              recMap.set(rk, rec)
              vendaTeveItem = true
            }
          }

          const p = cod ? prodByCod.get(cod) : undefined
          if (!p) {   // não é produto cadastrado (inclusão de rodízio etc.) → não entra em produto/detalhe
            semProduto++
            const nm = String(it?.desc_sale_item || '(sem nome)')
            semProdNomes.set(nm, (semProdNomes.get(nm) || 0) + 1)
            continue
          }
          comProduto++
          const fid = fichaByProduto.get(p.id) || null
          if (fid) comFicha++

          // DETALHE item-a-item (vendas_item) — usado pela Divergências
          rowsItem.push({
            tenant_id: tenant, data: dia, ficha_id: fid,   // vendas_item é tenant-level (NÃO tem loja_id)
            produto_nome: String(it?.desc_sale_item || '(sem nome)'),
            quantidade: qtd, valor_unitario: vu, valor_total: vt,
            canal: null, pdv_ref: 'saipos:' + (it?.id_sale_item ?? ''),
          })

          // PRODUTO por dia (vendas_produto_dia) — agrega por loja×dia×produto. produto_id = código (== codigo_pdv).
          if (modo === 'pull' && loja_id) {
            const prodNum = /^\d+$/.test(cod) ? Number(cod) : null
            if (prodNum !== null) {
              const pk = loja_id + '|' + dia + '|' + prodNum
              const a = pdMap.get(pk) || { loja_id, dia, produto_id: prodNum, produto_nome: p.nome, grupo: p.grupo, ficha_id: fid, qtd: 0, faturado: 0 }
              a.qtd += qtd; a.faturado = Number((a.faturado + vt).toFixed(2))
              pdMap.set(pk, a)
            }
          }
        }
        // comanda = 1 por venda (id_sale), contada uma vez
        if (modo === 'pull' && loja_id && vendaTeveItem) recMap.get(loja_id + '|' + dia)!.comandas.add(venda?.id_sale)
      }
      if (r.sales.length < 1000) break
    }
    if (Date.now() - inicio > BUDGET_MS) break
  }

  const cobertura = comProduto ? Math.round((comFicha / comProduto) * 100) : 0

  // DIAG: só conta (não grava). topSemProduto = os 30 nomes que MAIS aparecem sem bater produto.
  if (modo !== 'pull') {
    const topSemProduto = [...semProdNomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([nome, qtd]) => ({ nome, qtd }))
    return json({ modo: 'diag', tenant, janelas: wins.length, itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura, loja_unica: lojaUnica, topSemProduto, ultimoStatus })
  }

  // ── PULL: grava nas 3 tabelas (idempotente por período, fonte=saipos) ──
  const now = new Date().toISOString()
  const dataMin = ymd(new Date(Date.now() - dias * 86400000))

  // 🛡️ TRAVA ANTI-ZERAGEM: se não leu NADA do Saipos (API vazia / rate-limit / falha), NÃO apaga o que já existe.
  // (mesma lógica do icomanda-sync: "só regrava se veio dado" — evita zerar por resposta transitória)
  if (itensLidos === 0) {
    return json({ ok: false, modo: 'pull', tenant, aviso: 'Nada lido do Saipos (API vazia ou falha) — NAO apaguei/gravei nada.', itensLidos, comProduto, ultimoStatus, ultimoRaw }, 200)
  }

  // 1) DETALHE item-a-item
  await supabase.from('vendas_item').delete().eq('tenant_id', tenant).like('pdv_ref', 'saipos:%').gte('data', dataMin)
  for (let i = 0; i < rowsItem.length; i += 500) {
    const chunk = rowsItem.slice(i, i + 500).filter((r) => r.data)
    if (!chunk.length) continue
    const { error } = await supabase.from('vendas_item').insert(chunk)
    if (!error) gravItem += chunk.length
  }

  // 2) PRODUTO por dia (só as linhas Saipos do período; NÃO toca no que é fonte='icomanda')
  await supabase.from('vendas_produto_dia').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').gte('data', dataMin)
  const pdRows = [...pdMap.values()].map((a) => ({
    tenant_id: tenant, loja_id: a.loja_id, data: a.dia, produto_id: a.produto_id,
    produto_nome: a.produto_nome, grupo: a.grupo, qtd: a.qtd, faturado: a.faturado,
    ficha_id: a.ficha_id, fonte: 'saipos', atualizado_em: now,
  }))
  for (let i = 0; i < pdRows.length; i += 500) {
    const { error } = await supabase.from('vendas_produto_dia').insert(pdRows.slice(i, i + 500))
    if (!error) gravProd += Math.min(500, pdRows.length - i)
  }

  // 3) PORTÃO por loja×dia (status='processado'). Apaga só o Saipos do período e regrava.
  await supabase.from('recebimento_vendas').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').gte('data', dataMin)
  const recRows = [...recMap.values()].map((r) => {
    const com = r.comandas.size
    return {
      tenant_id: tenant, loja_id: r.loja_id, data: r.dia,
      faturado: Number(r.fat.toFixed(2)), subtotal: Number(r.fat.toFixed(2)),
      desconto: 0, taxa: 0, couvert: 0, qtd_caixas: 0,
      qtd_comandas: com, qtd_canceladas: 0, pessoas: 0,
      ticket_medio: com ? Number((r.fat / com).toFixed(2)) : 0,
      fat_almoco: Number(r.almoco.toFixed(2)), fat_jantar: Number(r.jantar.toFixed(2)),
      por_canal: null, status: 'processado', erros: null, fonte: 'saipos',
      data_integracao: now, atualizado_em: now,
    }
  })
  for (let i = 0; i < recRows.length; i += 500) {
    const { error } = await supabase.from('recebimento_vendas').insert(recRows.slice(i, i + 500))
    if (!error) gravRec += Math.min(500, recRows.length - i)
  }

  console.log('saipos pull:', { tenant, itensLidos, comProduto, comFicha, gravItem, gravProd, gravRec })
  return json({
    ok: true, modo: 'pull', tenant, janelas: wins.length,
    itensLidos, comProduto, semProduto, comFicha, semLoja, cobertura_pct: cobertura,
    gravados_item: gravItem, gravados_produto_dia: gravProd, gravados_recebimento: gravRec, ultimoStatus,
  })
})
