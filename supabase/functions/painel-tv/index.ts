// painel-tv — entrega os números do Painel de TV de UMA loja, em JSON, SEM login.
// Protegido pela chave da loja (lojas.painel_chave). Junta metas automáticas
// (dia/semana/mês/ticket, do iComanda) + os indicadores manuais (painel_indicadores)
// + o RANKING DE GARÇONS (ticket do dia e acumulado do mês, ao vivo do iComanda).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// iComanda (mesmos secrets do icomanda-sync/proxy) — pro ranking de garçons
const ICO_BASE = (Deno.env.get('ICOMANDA_BASE') ?? '').replace(/\/+$/, '')
const ICO_TOKEN = Deno.env.get('ICOMANDA_TOKEN') ?? ''

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })
const pad2 = (n: number) => String(n).padStart(2, '0')

function manaus(offset = 0) {
  const d = new Date(Date.now() - 4 * 3600 * 1000 + offset * 86400000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }
}

// ---- casamento loja Aiko ↔ filial iComanda (mesma lógica do icomanda-sync) ----
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(sushi|pn|mao|pvh|unidade|antig[oa]|matriz|lanchonete|restaurante)\b/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['das', 'dos', 'de', 'do', 'da', 'pq', 'e', 'com'])
const toks = (s: string) => norm(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))

type Filial = { id: number; nome: string; faturado: number }
function matchFilial(lojaNome: string, filiais: Filial[]): Filial | null {
  const lt = toks(lojaNome)
  let best: Filial | null = null, bestScore = -1
  for (const f of filiais) {
    const ft = toks(f.nome)
    const common = lt.filter((t) => ft.includes(t))
    const score = common.reduce((a, t) => a + t.length, 0)
    if (!common.some((t) => t.length >= 4)) continue
    const bF = best ? (best.faturado > 0 ? 1 : 0) : -1, cF = f.faturado > 0 ? 1 : 0
    if (cF > bF || (cF === bF && (score > bestScore || (score === bestScore && f.faturado > (best?.faturado || 0))))) { best = f; bestScore = score }
  }
  return best
}

async function ico(bloco: string, params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams({ bloco, ...params })
  const r = await fetch(`${ICO_BASE}/?${q}`, { headers: { Authorization: `Bearer ${ICO_TOKEN}` } })
  const j = await r.json()
  return j?.blocos?.[bloco]?.dados || {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const lojaId = url.searchParams.get('loja') || ''
  const chave = url.searchParams.get('chave') || ''

  const { data: loja } = await supabase.from('lojas').select('id,nome,meta_ticket,painel_chave,tenant_id').eq('id', lojaId).maybeSingle()
  if (!loja || !chave || (loja as any).painel_chave !== chave) return json({ error: 'não autorizado' }, 401)
  const tenant = (loja as any).tenant_id

  const t = manaus(0)
  const hoje = `${t.y}-${pad2(t.m)}-${pad2(t.d)}`
  const ini = `${t.y}-${pad2(t.m)}-01`
  const lastDay = new Date(t.y, t.m, 0).getDate()

  const { data: metaSem } = await supabase.from('metas_semana').select('dia_semana,valor,canal').eq('tenant_id', tenant).eq('loja_id', lojaId)
  const { data: metaExc } = await supabase.from('metas_excecao').select('data,valor').eq('tenant_id', tenant).eq('loja_id', lojaId).gte('data', ini).lte('data', hoje)
  const { data: rec } = await supabase.from('icomanda_recebimento').select('data,faturado,pessoas,ticket_medio').eq('tenant_id', tenant).eq('loja_id', lojaId).eq('status', 'processado').gte('data', ini).lte('data', hoje)
  const { data: inds } = await supabase.from('painel_indicadores').select('indicador,valor,meta').eq('tenant_id', tenant).eq('loja_id', lojaId)

  const semMap: Record<string, number> = {}; const canais: string[] = []
  for (const s of metaSem || []) { const c = (s as any).canal || 'total'; semMap[`${(s as any).dia_semana}|${c}`] = Number((s as any).valor) || 0; if (c !== 'total' && (Number((s as any).valor) || 0) > 0 && !canais.includes(c)) canais.push(c) }
  const excMap: Record<string, number> = {}; for (const e of metaExc || []) excMap[(e as any).data] = Number((e as any).valor) || 0
  const recMap: Record<string, { fat: number; pes: number; tk: number }> = {}
  for (const r of rec || []) recMap[(r as any).data] = { fat: Number((r as any).faturado) || 0, pes: Number((r as any).pessoas) || 0, tk: Number((r as any).ticket_medio) || 0 }

  const metaDoDia = (ds: string, dow: number) => canais.length ? canais.reduce((a, c) => a + (semMap[`${dow}|${c}`] ?? 0), 0) : (excMap[ds] ?? semMap[`${dow}|total`] ?? 0)

  // soma meta (todos os dias do intervalo) e realizado (até hoje) — d1..d2 são dias do mês
  const somar = (d1: number, d2: number) => {
    let meta = 0, real = 0
    for (let d = d1; d <= d2; d++) { const ds = `${t.y}-${pad2(t.m)}-${pad2(d)}`; const dow = new Date(t.y, t.m - 1, d).getDay(); meta += metaDoDia(ds, dow); if (d <= t.d) real += recMap[ds]?.fat || 0 }
    return { meta, real }
  }

  // dia
  const metaDia = metaDoDia(hoje, t.dow), realDia = recMap[hoje]?.fat || 0
  // semana = bloco de 7 dias que contém hoje
  const wkIni = Math.floor((t.d - 1) / 7) * 7 + 1, wkFim = Math.min(wkIni + 6, lastDay)
  const sem = somar(wkIni, wkFim)
  // mês (inteiro)
  const mes = somar(1, lastDay)
  // ticket de hoje
  const tk = recMap[hoje]?.tk || (recMap[hoje]?.pes ? recMap[hoje].fat / recMap[hoje].pes : 0)

  const indMap: Record<string, { valor: number | null; meta: number | null }> = {}
  for (const i of inds || []) indMap[(i as any).indicador] = { valor: (i as any).valor, meta: (i as any).meta }
  const clubeMetaAuto = mes.meta * 0.5   // meta do clube = 50% da meta de faturamento do mês

  // ---- RANKING DE GARÇONS (ao vivo do iComanda) — ticket do dia + acumulado do mês ----
  // Se o iComanda falhar ou não casar a filial, devolve lista vazia (o painel mostra "em breve").
  let garcons: { nome: string; tkDia: number; tkMes: number; comDia: number }[] = []
  try {
    if (ICO_BASE && ICO_TOKEN) {
      const filData = await ico('filiais.listar', { data_ini: ini, data_fim: hoje })
      const filiais: Filial[] = (filData.filiais || []).map((f: any) => ({ id: Number(f.id), nome: String(f.nome || ''), faturado: Number(f.faturado) || 0 }))
      const filial = matchFilial((loja as any).nome, filiais)
      if (filial) {
        const [dDia, dMes] = await Promise.all([
          ico('garcons.ranking', { data_ini: hoje, data_fim: hoje, filial_id: String(filial.id) }),
          ico('garcons.ranking', { data_ini: ini, data_fim: hoje, filial_id: String(filial.id) }),
        ])
        const diaMap: Record<string, any> = {}
        for (const g of (dDia.ranking || [])) diaMap[g.usuario_id] = g
        const lista = (dMes.ranking || []).map((g: any) => ({
          nome: String(g.nome || '').trim(),
          tkMes: Number(g.ticket_medio_comanda) || 0,
          tkDia: Number(diaMap[g.usuario_id]?.ticket_medio_comanda) || 0,
          comDia: Number(diaMap[g.usuario_id]?.qtd_comandas) || 0,
        }))
        // ranking do DIA: quem atendeu hoje, ordenado por ticket do dia (sem mínimo).
        const ativosHoje = lista.filter((g) => g.comDia > 0).sort((a, b) => b.tkDia - a.tkDia)
        // se ninguém atendeu ainda hoje, mostra o ranking do mês por ticket do mês
        garcons = (ativosHoje.length ? ativosHoje : lista.sort((a, b) => b.tkMes - a.tkMes)).slice(0, 12)
      }
    }
  } catch (_e) { garcons = [] }

  return json({
    loja: (loja as any).nome,
    atualizado: new Date().toISOString(),
    metas: {
      dia: { real: realDia, meta: metaDia },
      semana: { real: sem.real, meta: sem.meta },
      mes: { real: mes.real, meta: mes.meta },
      ticket: { real: tk, meta: Number((loja as any).meta_ticket) || 0 },
    },
    indicadores: {
      cmv: indMap.cmv || { valor: null, meta: null },
      nps: indMap.nps || { valor: null, meta: null },
      google_nota: indMap.google_nota || { valor: null, meta: null },
      google_avaliacoes: indMap.google_avaliacoes || { valor: null, meta: null },
      clube: { valor: indMap.clube?.valor ?? null, meta: clubeMetaAuto },
      peixe: indMap.peixe || { valor: null, meta: null },
      camarao: indMap.camarao || { valor: null, meta: null },
    },
    garcons,
  })
})
