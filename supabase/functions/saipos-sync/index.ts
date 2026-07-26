// ════════════════════════════════════════════════════════════════════════════
//  saipos-sync — CAPTURA de vendas via SAIPOS → CAMADA DE VENDAS GENÉRICA (PULL)
//  Fonte: GET https://data.saipos.io/v1/sales_items (Bearer <SAIPOS_TOKEN>)
//  Grava em (todas com fonte='saipos'):
//    • recebimento_vendas  → portão/totais por loja×dia (faturado, comandas, turno, status='processado')
//    • vendas_produto_dia  → produtos vendidos por loja×dia (qtd, faturado, ficha_id) — alimenta CMV/CurvaABC/Engenharia
//    • vendas_item         → detalhe item-a-item (usado pela tela Divergências)
//  De-para: produtos.codigo_pdv == item.integration_code → produto → ficha.
//    produto_id gravado em vendas_produto_dia = o próprio código (== codigo_pdv), pra casar com o de-para das telas.
//  Turno: o Saipos NÃO manda turno → separa almoço/jantar pela HORA do created_at da venda (< CORTE = almoço).
//  Loja: mapeia por id_store; no piloto (tenant com 1 loja) usa a única loja ativa.
//  ⚠️ ROBUSTEZ: puxa DIA A DIA (requisição pequena, com retry) — se um dia falhar (504), PULA esse dia e
//     PRESERVA o que já existe (não zera, não deixa parcial). Grava dia a dia (progresso não se perde no timeout).
//  Modos (body.mode): 'diag' (padrão, só conta) | 'pull' (grava). body.dias = quantos dias atrás (máx útil 15).
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
const CORTE_ALMOCO_H = 16     // hora local < 16h = almoço; senão jantar (Saipos não manda turno)

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })
const ymd = (d: Date) => d.toISOString().substring(0, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// lista dos últimos `dias` dias (inclui hoje) — do mais antigo pro mais novo
function ultimosDias(dias: number): string[] {
  const out: string[] = []
  for (let i = dias; i >= 0; i--) out.push(ymd(new Date(Date.now() - i * 86400000)))
  return out
}

// GET sales_items de UM DIA (cada venda tem items[] + id_sale + created_at). Até 3 tentativas (504 sob carga).
async function buscarDia(dia: string, offset: number) {
  const qs = new URLSearchParams({
    p_date_column_filter: 'shift_date',
    p_filter_date_start: `${dia} 00:00:00`,
    p_filter_date_end: `${dia} 23:59:59`,
    p_limit: '1000',
    p_offset: String(offset),
  })
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SAIPOS_BASE}/sales_items?${qs}`, { headers: { Authorization: `Bearer ${SAIPOS_TOKEN}` } })
      const raw = await res.text()
      if (res.status === 200) {
        let data: unknown = null
        try { data = JSON.parse(raw) } catch { /* ignore */ }
        return { status: 200, sales: Array.isArray(data) ? (data as any[]) : [], rawHead: raw.substring(0, 300) }
      }
      if (res.status >= 500 && attempt < 3) { await sleep(2000); continue }
      return { status: res.status, sales: [] as any[], rawHead: raw.substring(0, 300) }
    } catch (e) {
      if (attempt < 3) { await sleep(2000); continue }
      return { status: 0, sales: [] as any[], rawHead: String(e).substring(0, 300) }
    }
  }
  return { status: 0, sales: [] as any[], rawHead: 'sem resposta' }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  if (!SAIPOS_TOKEN) return json({ error: 'falta o secret SAIPOS_TOKEN' }, 400)

  const body = await req.json().catch(() => ({})) as any
  const tenant = body.tenant || TENANT_MORI
  const dias = Number(body.dias) || 15
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

  const inicio = Date.now()
  const now = new Date().toISOString()
  let itensLidos = 0, comProduto = 0, semProduto = 0, comFicha = 0
  let gravItem = 0, gravProd = 0, gravRec = 0, diasGravados = 0, diasPulados = 0, ultimoStatus = 0, ultimoRaw = ''
  const semProdNomes = new Map<string, number>()               // ranking dos nomes que NÃO bateram (diag)

  // ── LOOP DIA A DIA (cada dia é atômico: se falhar, pula e preserva o existente) ──
  for (const dia of ultimosDias(dias)) {
    if (Date.now() - inicio > BUDGET_MS) break

    const rec = { fat: 0, almoco: 0, jantar: 0, comandas: new Set<any>() }
    const pd = new Map<number, { produto_nome: string | null; grupo: string | null; ficha_id: string | null; qtd: number; faturado: number }>()
    const itemRows: any[] = []
    let lidosDia = 0
    let okDia = true

    for (let off = 0; off < 200000; off += 1000) {
      if (Date.now() - inicio > BUDGET_MS) { okDia = false; break }
      const r = await buscarDia(dia, off)
      ultimoStatus = r.status; ultimoRaw = r.rawHead
      if (r.status !== 200) { okDia = false; break }   // dia falhou → NÃO mexe nesse dia
      if (!r.sales.length) break
      for (const venda of r.sales) {
        const hora = Number(String(venda?.created_at || '').substring(11, 13))
        const turno = (hora >= 0 && hora < corte) ? 'almoco' : 'jantar'
        const items = Array.isArray(venda?.items) ? venda.items : []
        let teve = false
        for (const it of items) {
          if (it?.deleted === 'Y' || it?.deleted === true) continue   // item CANCELADO (Saipos usa 'Y'/'N')
          itensLidos++; lidosDia++
          const qtd = Number(it?.quantity) || 0
          const vu = Number(it?.unit_price) || 0
          const vt = Number((qtd * vu).toFixed(2))
          const cod = String(it?.integration_code ?? '').trim()
          // portão: soma TODOS os itens (é o faturamento real do dia)
          rec.fat += vt; if (turno === 'almoco') rec.almoco += vt; else rec.jantar += vt; teve = true
          const p = cod ? prodByCod.get(cod) : undefined
          if (!p) {   // não é produto cadastrado (inclusão de rodízio etc.)
            semProduto++
            const nm = String(it?.desc_sale_item || '(sem nome)')
            semProdNomes.set(nm, (semProdNomes.get(nm) || 0) + 1)
            continue
          }
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
            a.qtd += qtd; a.faturado = Number((a.faturado + vt).toFixed(2))
            pd.set(prodNum, a)
          }
        }
        if (teve) rec.comandas.add(venda?.id_sale)
      }
      if (r.sales.length < 1000) break
    }

    if (!okDia) { diasPulados++; continue }        // dia falhou (504/timeout) → preserva o existente
    if (lidosDia === 0) { diasPulados++; continue } // dia sem venda → NÃO apaga (preserva)
    if (modo !== 'pull') { diasGravados++; continue } // diag: só conta
    if (!lojaUnica) { diasPulados++; continue }     // sem loja definida → não grava

    // ── grava SÓ esse dia (idempotente por dia; NÃO toca no que é fonte='icomanda') ──
    await supabase.from('vendas_item').delete().eq('tenant_id', tenant).like('pdv_ref', 'saipos:%').eq('data', dia)
    for (let i = 0; i < itemRows.length; i += 500) {
      const { error } = await supabase.from('vendas_item').insert(itemRows.slice(i, i + 500))
      if (!error) gravItem += Math.min(500, itemRows.length - i)
    }

    await supabase.from('vendas_produto_dia').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').eq('data', dia)
    const pdRows = [...pd.entries()].map(([produto_id, a]) => ({
      tenant_id: tenant, loja_id: lojaUnica, data: dia, produto_id,
      produto_nome: a.produto_nome, grupo: a.grupo, qtd: a.qtd, faturado: a.faturado,
      ficha_id: a.ficha_id, fonte: 'saipos', atualizado_em: now,
    }))
    for (let i = 0; i < pdRows.length; i += 500) {
      const { error } = await supabase.from('vendas_produto_dia').insert(pdRows.slice(i, i + 500))
      if (!error) gravProd += Math.min(500, pdRows.length - i)
    }

    await supabase.from('recebimento_vendas').delete().eq('tenant_id', tenant).eq('fonte', 'saipos').eq('data', dia)
    const com = rec.comandas.size
    const { error: eR } = await supabase.from('recebimento_vendas').insert({
      tenant_id: tenant, loja_id: lojaUnica, data: dia,
      faturado: Number(rec.fat.toFixed(2)), subtotal: Number(rec.fat.toFixed(2)),
      desconto: 0, taxa: 0, couvert: 0, qtd_caixas: 0,
      qtd_comandas: com, qtd_canceladas: 0, pessoas: 0,
      ticket_medio: com ? Number((rec.fat / com).toFixed(2)) : 0,
      fat_almoco: Number(rec.almoco.toFixed(2)), fat_jantar: Number(rec.jantar.toFixed(2)),
      por_canal: null, status: 'processado', erros: null, fonte: 'saipos',
      data_integracao: now, atualizado_em: now,
    })
    if (!eR) gravRec++
    diasGravados++
  }

  const cobertura = comProduto ? Math.round((comFicha / comProduto) * 100) : 0

  if (modo !== 'pull') {
    const topSemProduto = [...semProdNomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([nome, qtd]) => ({ nome, qtd }))
    return json({ modo: 'diag', tenant, dias_ok: diasGravados, dias_pulados: diasPulados, itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura, loja_unica: lojaUnica, topSemProduto, ultimoStatus })
  }

  console.log('saipos pull:', { tenant, diasGravados, diasPulados, itensLidos, comProduto, comFicha, gravItem, gravProd, gravRec })
  return json({
    ok: true, modo: 'pull', tenant, dias_gravados: diasGravados, dias_pulados: diasPulados,
    itensLidos, comProduto, semProduto, comFicha, cobertura_pct: cobertura,
    gravados_item: gravItem, gravados_produto_dia: gravProd, gravados_recebimento: gravRec, ultimoStatus,
  })
})
