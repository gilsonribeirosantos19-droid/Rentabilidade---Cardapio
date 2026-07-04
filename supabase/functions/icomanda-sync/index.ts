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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ status: 'erro', mensagem: 'Use POST.' }, 405)
  try {
    if (!ICOMANDA_TOKEN || !ICOMANDA_BASE || !SB_URL || !SB_SERVICE) throw new Error('Config ausente (secrets).')
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const tenant_id = String((body as Record<string, unknown>).tenant_id || '')
    const competencia = String((body as Record<string, unknown>).competencia || '')
    if (!tenant_id) throw new Error('Informe tenant_id.')
    if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Informe competencia no formato YYYY-MM.')

    const [y, m] = competencia.split('-').map(Number)
    const data_ini = `${competencia}-01`
    const data_fim = new Date(y, m, 0).toISOString().slice(0, 10)

    const sb = createClient(SB_URL, SB_SERVICE)

    // 1) lojas do Aiko (deste tenant)
    const { data: lojas, error: eL } = await sb.from('lojas').select('id,nome').eq('tenant_id', tenant_id).eq('ativo', true)
    if (eL) throw eL
    if (!lojas?.length) throw new Error('Nenhuma loja ativa neste tenant.')

    // 2) filiais do iComanda no período (id, nome, faturado)
    const filiais = asArray(await ico('filiais.listar', { data_ini, data_fim })) as { id: number; nome: string; faturado?: number }[]

    // 3) casa filial ↔ loja por PALAVRA-CHAVE do nome (ex.: "Parque Laranjeiras" ↔ "PQ DAS LARANJEIRAS"
    //    casam por "laranjeiras"). Pontua pela soma do tamanho dos tokens em comum; exige ao menos 1
    //    token distintivo (≥4 letras) p/ evitar falso positivo.
    //    ORDEM: 1º quem TEM venda no período (uma filial ativa vence sempre um cadastro "Antigo" zerado),
    //    depois maior pontuação de nome, depois maior faturamento.
    const mapa: { loja: { id: string; nome: string }; filial: { id: number; nome: string } }[] = []
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
      if (cands[0]) mapa.push({ loja, filial: { id: cands[0].f.id, nome: cands[0].f.nome } })
      else naoCasadas.push(loja.nome)
    }

    // 4) puxa produtos por filial casada e grava (regrava a competência de cada loja)
    let totalProdutos = 0, totalFaturado = 0
    const detalhe: { loja: string; filial: string; produtos: number; faturado: number }[] = []
    for (const { loja, filial } of mapa) {
      const prods = asArray(await ico('produtos.top_vendidos', { data_ini, data_fim, filial_id: String(filial.id), limit: '1000', ordenar_por: 'faturado' })) as any[]
      const rows = prods
        .filter((p) => p && p.produto_id != null)
        .map((p) => ({
          tenant_id, loja_id: loja.id, competencia, produto_id: Number(p.produto_id),
          produto_nome: String(p.nome || '').trim() || null, grupo: String(p.grupo || '').trim() || null,
          qtd: Number(p.qtd) || 0, faturado: Number(p.faturado) || 0, atualizado_em: new Date().toISOString(),
        }))
      // regrava a competência dessa loja (remove o antigo p/ não sobrar produto que saiu)
      await sb.from('icomanda_vendas').delete().eq('tenant_id', tenant_id).eq('loja_id', loja.id).eq('competencia', competencia)
      if (rows.length) { const { error } = await sb.from('icomanda_vendas').insert(rows); if (error) throw error }
      const fat = rows.reduce((a, r) => a + r.faturado, 0)
      totalProdutos += rows.length; totalFaturado += fat
      detalhe.push({ loja: loja.nome, filial: filial.nome, produtos: rows.length, faturado: +fat.toFixed(2) })
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
