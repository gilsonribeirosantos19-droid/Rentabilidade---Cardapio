// Supabase Edge Function: icomanda-sync
// Puxa as VENDAS do iComanda de um mês (competência) e grava em public.icomanda_vendas.
// Casa filial(iComanda) ↔ loja(Aiko) pelo NOME. Usa a service role (servidor) p/ gravar.
//
// Secrets (já existem os 2 primeiros; os do Supabase são injetados automaticamente):
//   ICOMANDA_TOKEN, ICOMANDA_BASE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Chamada (POST): { "tenant_id": "uuid", "competencia": "2026-06" }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ICOMANDA_TOKEN = Deno.env.get('ICOMANDA_TOKEN') ?? ''
const ICOMANDA_BASE = (Deno.env.get('ICOMANDA_BASE') ?? '').replace(/\/+$/, '')
const SB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// normaliza nome de loja/filial p/ casar (tira "sushi/pn/mao/pvh/antigo…", acentos, pontuação)
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(sushi|pn|mao|pvh|unidade|antig[oa]|matriz|lanchonete|restaurante)\b/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
// hora de corte entre almoço e jantar: vendas < 17h = almoço, >= 17h = jantar
const CORTE_JANTAR = 17
// palavras-chave do nome (ignora conectores/abreviações e tokens curtos)
const STOP = new Set(['das', 'dos', 'de', 'do', 'da', 'pq', 'e', 'com'])
const toks = (s: string) => norm(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))

// pega o array de OBJETOS de dentro do "dados" (filiais.listar → filiais; top_vendidos → produtos).
// ignora arrays de primitivos como "periodo": ["2026-06-01","2026-06-30"].
const asArray = (d: unknown): any[] => {
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object') {
    const arrs = Object.values(d as Record<string, unknown>).filter((v) => Array.isArray(v)) as any[][]
    return arrs.find((a) => a.length > 0 && typeof a[0] === 'object' && a[0] !== null) || arrs.find((a) => a.length > 0) || []
  }
  return []
}

async function ico(bloco: string, params: Record<string, string>) {
  const q = new URLSearchParams({ bloco, ...params })
  const r = await fetch(`${ICOMANDA_BASE}/?${q.toString()}`, { headers: { Authorization: `Bearer ${ICOMANDA_TOKEN}` } })
  const j = await r.json()
  if (j?.status !== 'ok') throw new Error(`iComanda (${bloco}): ${j?.mensagem || 'erro'}`)
  return j?.blocos?.[bloco]?.dados
}

// casa loja(Aiko) ↔ filial(iComanda) por PALAVRA-CHAVE do nome (usado nos 2 modos: mensal e diário)
function matchLojas(
  lojas: { id: string; nome: string }[],
  filiais: { id: number; nome: string; faturado?: number; qtd_caixas?: number }[],
) {
  const mapa: { loja: { id: string; nome: string }; filial: { id: number; nome: string; faturado: number; qtd_caixas: number } }[] = []
  const naoCasadas: string[] = []
  for (const loja of lojas) {
    const tl = toks(loja.nome)
    const cands = filiais.map((f) => {
      const shared = toks(f.nome).filter((t) => tl.includes(t))
      return { f, score: shared.reduce((a, t) => a + t.length, 0), distintivo: shared.some((t) => t.length >= 4) }
    }).filter((x) => x.distintivo && x.score > 0)
      .sort((a, b) =>
        (((b.f.faturado || 0) > 0 ? 1 : 0) - ((a.f.faturado || 0) > 0 ? 1 : 0)) ||
        (b.score - a.score) ||
        ((b.f.faturado || 0) - (a.f.faturado || 0)))
    if (cands[0]) mapa.push({ loja, filial: { id: cands[0].f.id, nome: cands[0].f.nome, faturado: Number(cands[0].f.faturado) || 0, qtd_caixas: Number(cands[0].f.qtd_caixas) || 0 } })
    else naoCasadas.push(loja.nome)
  }
  return { mapa, naoCasadas }
}

// lista de dias 'YYYY-MM-DD' de ini a fim (inclusive) — trava de segurança em 62 dias
function daysBetween(ini: string, fim: string): string[] {
  const out: string[] = []
  const d = new Date(ini + 'T00:00:00Z'); const end = new Date(fim + 'T00:00:00Z')
  while (d <= end && out.length < 62) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ status: 'erro', mensagem: 'Use POST.' }, 405)
  try {
    if (!ICOMANDA_TOKEN || !ICOMANDA_BASE || !SB_URL || !SB_SERVICE) throw new Error('Config ausente (secrets).')
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const tenant_id = String((body as Record<string, unknown>).tenant_id || '')
    const competencia = String((body as Record<string, unknown>).competencia || '')
    const dDe = String((body as Record<string, unknown>).data_ini || '')
    const dAte = String((body as Record<string, unknown>).data_fim || '')
    if (!tenant_id) throw new Error('Informe tenant_id.')

    const sb = createClient(SB_URL, SB_SERVICE)

    // lojas do Aiko (deste tenant) — usadas nos dois modos
    const { data: lojas, error: eL } = await sb.from('lojas').select('id,nome').eq('tenant_id', tenant_id).eq('ativo', true)
    if (eL) throw eL
    if (!lojas?.length) throw new Error('Nenhuma loja ativa neste tenant.')

    // ===== MODO DIÁRIO (portão "Recebimento de Vendas"): body {data_ini, data_fim} em YYYY-MM-DD =====
    // Puxa dia a dia o FATURAMENTO por loja e grava em icomanda_recebimento com status.
    // Puxada OK do dia → 'processado' (auto) → entra nos relatórios. Falha → 'com_erro' → bloqueado.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dDe) && /^\d{4}-\d{2}-\d{2}$/.test(dAte)) {
      const filiaisRange = asArray(await ico('filiais.listar', { data_ini: dDe, data_fim: dAte })) as { id: number; nome: string; faturado?: number; qtd_caixas?: number }[]
      const { mapa, naoCasadas } = matchLojas(lojas, filiaisRange)
      const dias = daysBetween(dDe, dAte)
      const now = new Date().toISOString()
      let processados = 0, comErro = 0
      for (const dia of dias) {
        try {
          // pacote completo do dia (faturamento.total já traz TODAS as lojas em por_filial)
          const dados = await ico('faturamento.total', { data_ini: dia, data_fim: dia })
          const pf = (dados && Array.isArray((dados as { por_filial?: unknown }).por_filial) ? (dados as { por_filial: any[] }).por_filial : []) as any[]
          const byId = new Map<number, any>(pf.map((f) => [Number(f.filial_id), f]))
          const linhas = []
          for (const { loja, filial } of mapa) {
            const f = byId.get(filial.id) || {}
            // TURNO: faturamento por hora → soma antes das 17h (almoço) e a partir das 17h (jantar)
            let fatAlmoco = 0, fatJantar = 0
            try {
              const horas = asArray(await ico('faturamento.por_horario', { data_ini: dia, data_fim: dia, filial_id: String(filial.id) })) as any[]
              for (const h of horas) { const hr = Number(h.hora); const v = Number(h.faturado) || 0; if (hr < CORTE_JANTAR) fatAlmoco += v; else fatJantar += v }
            } catch { /* sem por_horario: turno fica 0/0 (a tela cai p/ consolidado) */ }
            // CANAL (salão/delivery/balcão): exato, do faturamento.por_tipo
            let porCanal: any[] | null = null
            try {
              const dt = await ico('faturamento.por_tipo', { data_ini: dia, data_fim: dia, filial_id: String(filial.id) })
              const tipos = (dt && Array.isArray((dt as { tipos?: unknown }).tipos) ? (dt as { tipos: any[] }).tipos : asArray(dt)) as any[]
              const acc: Record<string, any> = {}
              for (const t of tipos) {
                const tc = String(t.tipo_comanda || '').toLowerCase()
                const c = tc === 'mesa' ? 'Salão' : tc === 'delivery' ? 'Delivery' : tc === 'balcao' ? 'Balcão' : 'Outros'
                const a = acc[c] || { canal: c, faturado: 0, comandas: 0, pessoas: 0, desconto: 0, taxa: 0, couvert: 0 }
                a.faturado += Number(t.faturado) || 0; a.comandas += Number(t.qtd_comandas) || 0; a.pessoas += Number(t.pessoas) || 0
                a.desconto += Number(t.desconto) || 0; a.taxa += Number(t.tax) || 0; a.couvert += Number(t.couvert) || 0
                acc[c] = a
              }
              porCanal = Object.values(acc).map((a: any) => ({ canal: a.canal, faturado: +a.faturado.toFixed(2), comandas: a.comandas, pessoas: a.pessoas, desconto: +a.desconto.toFixed(2), taxa: +a.taxa.toFixed(2), couvert: +a.couvert.toFixed(2) }))
            } catch { /* sem por_tipo: canal fica null */ }
            linhas.push({
              tenant_id, loja_id: loja.id, data: dia,
              faturado: Number(f.faturado_caixa_valores) || 0,
              subtotal: Number(f.subtotal) || 0,
              desconto: Number(f.desconto) || 0,
              taxa: Number(f.tax) || 0,
              couvert: Number(f.couvert) || 0,
              qtd_caixas: Number(f.qtd_caixas) || 0,
              qtd_comandas: Number(f.qtd_comandas) || 0,
              qtd_canceladas: Number(f.qtd_comandas_canceladas) || 0,
              pessoas: Number(f.pessoas) || 0,
              ticket_medio: Number(f.ticket_medio_comanda) || 0,
              fat_almoco: +fatAlmoco.toFixed(2), fat_jantar: +fatJantar.toFixed(2),
              por_canal: porCanal,
              status: 'processado', erros: null, data_integracao: now, atualizado_em: now,
            })
          }
          const { error } = await sb.from('icomanda_recebimento').upsert(linhas, { onConflict: 'tenant_id,loja_id,data' })
          if (error) throw error
          processados += linhas.length
        } catch (e) {
          // dia falhou → marca TODAS as lojas do dia como 'com_erro' (não entra em relatório nenhum)
          const linhas = mapa.map(({ loja }) => ({ tenant_id, loja_id: loja.id, data: dia, status: 'com_erro', erros: String((e as Error).message).slice(0, 300), data_integracao: now, atualizado_em: now }))
          await sb.from('icomanda_recebimento').upsert(linhas, { onConflict: 'tenant_id,loja_id,data' })
          comErro += linhas.length
        }
      }
      return json({ status: 'ok', modo: 'dia', data_ini: dDe, data_fim: dAte, dias: dias.length, lojas_casadas: mapa.length, lojas_nao_casadas: naoCasadas, processados, com_erro: comErro })
    }

    // ===== MODO MENSAL (produtos p/ CMV + faturamento cheio): body {competencia} em YYYY-MM =====
    if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Informe competencia (YYYY-MM) ou data_ini+data_fim (YYYY-MM-DD).')
    const [y, m] = competencia.split('-').map(Number)
    const data_ini = `${competencia}-01`
    const data_fim = new Date(y, m, 0).toISOString().slice(0, 10)

    // filiais do iComanda no período (id, nome, faturado AUTORITATIVO = total cheio da loja, qtd_caixas)
    const filiais = asArray(await ico('filiais.listar', { data_ini, data_fim })) as { id: number; nome: string; faturado?: number; qtd_caixas?: number }[]
    const { mapa, naoCasadas } = matchLojas(lojas, filiais)

    // por loja casada: (a) grava o FATURAMENTO CHEIO da loja (bloco filiais — inclui couvert/taxa),
    //    (b) grava os PRODUTOS (top_vendidos) p/ ranking/CMV. A soma dos produtos NÃO bate com o total
    //    (top-500 + só produto) — por isso o faturamento vem do filiais.listar, não da soma.
    let totalProdutos = 0, totalFaturado = 0
    const detalhe: { loja: string; filial: string; produtos: number; faturado: number; faturado_produtos: number }[] = []
    for (const { loja, filial } of mapa) {
      const prods = asArray(await ico('produtos.top_vendidos', { data_ini, data_fim, filial_id: String(filial.id), limit: '1000', ordenar_por: 'faturado' })) as any[]
      const rows = prods
        .filter((p) => p && p.produto_id != null)
        .map((p) => ({
          tenant_id, loja_id: loja.id, competencia, produto_id: Number(p.produto_id),
          produto_nome: String(p.nome || '').trim() || null, grupo: String(p.grupo || '').trim() || null,
          qtd: Number(p.qtd) || 0, faturado: Number(p.faturado) || 0, atualizado_em: new Date().toISOString(),
        }))
      // (b) regrava os produtos da competência dessa loja
      await sb.from('icomanda_vendas').delete().eq('tenant_id', tenant_id).eq('loja_id', loja.id).eq('competencia', competencia)
      if (rows.length) { const { error } = await sb.from('icomanda_vendas').insert(rows); if (error) throw error }
      // (a) grava o faturamento AUTORITATIVO da loja (número cheio, do filiais.listar)
      const { error: eF } = await sb.from('icomanda_faturamento').upsert({
        tenant_id, loja_id: loja.id, competencia,
        faturado: filial.faturado, qtd_caixas: filial.qtd_caixas, filial_nome: filial.nome,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'tenant_id,loja_id,competencia' })
      if (eF) throw eF
      const fatProd = rows.reduce((a, r) => a + r.faturado, 0)
      totalProdutos += rows.length; totalFaturado += filial.faturado
      detalhe.push({ loja: loja.nome, filial: filial.nome, produtos: rows.length, faturado: +filial.faturado.toFixed(2), faturado_produtos: +fatProd.toFixed(2) })
    }

    return json({
      status: 'ok', competencia,
      lojas_casadas: mapa.length, lojas_nao_casadas: naoCasadas,
      produtos_gravados: totalProdutos, faturamento_total: +totalFaturado.toFixed(2),
      detalhe,
    })
  } catch (e) {
    return json({ status: 'erro', mensagem: String((e as Error).message) }, 400)
  }
})
