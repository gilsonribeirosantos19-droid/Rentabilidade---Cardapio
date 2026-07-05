// Supabase Edge Function: icomanda-proxy
// Proxy SEGURO para a API do iComanda (dashboard v2).
// O token do iComanda fica em variável de ambiente (servidor) — NUNCA no navegador/repo.
// O app Aiko chama esta função; ela chama o iComanda com o Bearer token e devolve o JSON.
//
// Variáveis de ambiente (Supabase → Edge Functions → Secrets):
//   ICOMANDA_TOKEN = (a chave do iComanda — fica só no servidor, nunca no repo)
//   ICOMANDA_BASE  = (a URL base da API do iComanda)

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'

const ICOMANDA_TOKEN = Deno.env.get('ICOMANDA_TOKEN') ?? ''
const ICOMANDA_BASE = (Deno.env.get('ICOMANDA_BASE') ?? '').replace(/\/+$/, '')

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Blocos permitidos (todos são SÓ LEITURA / analytics). Bloqueia qualquer coisa fora da lista.
const BLOCOS_OK = new Set([
  'filiais.listar',
  'faturamento.total', 'faturamento.por_tipo', 'faturamento.por_dia_semana', 'faturamento.por_horario',
  'produtos.top_vendidos', 'produtos.curva_abc', 'produtos.engenharia', 'produtos.cancelados',
  'garcons.ranking', 'garcons.ticket_medio', 'garcons.performance',
  'caixas.lista', 'caixas.formas_pagamento', 'caixas.fechamento', 'caixas.movimentacoes',
  'operacao.mesas_ativas', 'operacao.tempos_mesa', 'operacao.transferencias',
  'clientes.top', 'clientes.detalhe',
  'delivery.por_canal', 'delivery.por_entregador', 'delivery.tempo_entrega',
])

// Parâmetros que repassamos ao iComanda (whitelist — nada além disso).
const PARAMS_OK = ['data_ini', 'data_fim', 'filial_id', 'limit', 'ordenar_por', 'severidade_min', 'max_alertas', 'cliente_id']

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ status: 'erro', mensagem: 'Use POST.' }, 405)

  try {
    if (!ICOMANDA_TOKEN || !ICOMANDA_BASE) throw new Error('Config ausente: defina ICOMANDA_TOKEN e ICOMANDA_BASE.')

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const bloco = String((body as Record<string, unknown>).bloco || '')
    if (!BLOCOS_OK.has(bloco)) throw new Error('Bloco não permitido: ' + (bloco || '(vazio)'))

    const params = new URLSearchParams({ bloco })
    for (const k of PARAMS_OK) {
      const v = (body as Record<string, unknown>)[k]
      if (v != null && v !== '') params.set(k, String(v))
    }

    const url = `${ICOMANDA_BASE}/?${params.toString()}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ICOMANDA_TOKEN}` } })
    const text = await r.text()
    // devolve o JSON do iComanda como veio (mesmo status)
    return new Response(text, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return json({ status: 'erro', mensagem: String((e as Error).message) }, 400)
  }
})
