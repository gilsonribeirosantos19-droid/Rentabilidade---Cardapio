import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TENANT = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'          // Sushi PN
const FONES  = ['5592994948230', '5592995194090']             // quem recebe
const GATE   = 'aiko_cron_7Kd2mP9qXr4Lz1'                     // mesmo segredo dos crons

const ZAPI_INSTANCE = '3F5DF875142B614462BE3A5069A7E82E'
const ZAPI_TOKEN    = '3D562E6235E9D24CD65AC7A7'
const ZAPI_CLIENT   = 'F612a663424164fa3bcc571452911217fS'

const pad2 = (n: number) => String(n).padStart(2, '0')
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const kfmt = (n: number) => Math.round(n).toLocaleString('pt-BR')   // 23.999 (ponto de milhar)

function dataManaus(offsetDays = 0) {
  const dt = new Date(Date.now() - 4 * 3600 * 1000 + offsetDays * 86400000)
  const iso = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
  return { iso, dow: dt.getUTCDay(), dd: pad2(dt.getUTCDate()), mm: pad2(dt.getUTCMonth() + 1), hora: dt.getUTCHours() }
}

async function enviarZap(phone: string, message: string) {
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT }, body: JSON.stringify({ phone, message }) })
  const txt = await res.text()
  console.log(`[zap] ${phone} -> HTTP ${res.status} | ${txt.substring(0, 200)}`)
  return res.ok
}

const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  const body = await req.json().catch(() => ({} as any))
  const gate = req.headers.get('x-cron-secret') || body.secret || ''
  if (gate !== GATE) return json({ error: 'não autorizado' }, 401)

  const modo = body.modo === 'fechamento' ? 'fechamento' : 'parcial'
  const { iso, dow, dd, mm, hora } = dataManaus(modo === 'fechamento' ? -1 : 0)

  const { data: lojas } = await supabase.from('lojas').select('id,nome').eq('tenant_id', TENANT).eq('ativo', true).order('nome')
  const { data: metaSem } = await supabase.from('metas_semana').select('loja_id,dia_semana,valor,canal').eq('tenant_id', TENANT)
  const { data: metaExc } = await supabase.from('metas_excecao').select('loja_id,valor').eq('tenant_id', TENANT).eq('data', iso)
  const { data: rec } = await supabase.from('icomanda_recebimento').select('loja_id,faturado,qtd_comandas').eq('tenant_id', TENANT).eq('data', iso).eq('status', 'processado')

  const semMap: Record<string, number> = {}, lojaCanais: Record<string, string[]> = {}
  for (const s of metaSem || []) {
    const c = (s as any).canal || 'total'
    semMap[`${(s as any).loja_id}|${(s as any).dia_semana}|${c}`] = Number((s as any).valor) || 0
    if (c !== 'total' && (Number((s as any).valor) || 0) > 0) { (lojaCanais[(s as any).loja_id] ||= []); if (!lojaCanais[(s as any).loja_id].includes(c)) lojaCanais[(s as any).loja_id].push(c) }
  }
  const excMap: Record<string, number> = {}
  for (const e of metaExc || []) excMap[(e as any).loja_id] = Number((e as any).valor) || 0
  const recMap: Record<string, { fat: number; com: number }> = {}
  for (const r of rec || []) recMap[(r as any).loja_id] = { fat: Number((r as any).faturado) || 0, com: Number((r as any).qtd_comandas) || 0 }

  const metaLoja = (id: string) => { const cs = lojaCanais[id]; if (cs && cs.length) return cs.reduce((a, c) => a + (semMap[`${id}|${dow}|${c}`] ?? 0), 0); return excMap[id] ?? semMap[`${id}|${dow}|total`] ?? 0 }

  type Row = { nome: string; meta: number; real: number; com: number }
  const rows: Row[] = []
  for (const l of lojas || []) { const meta = metaLoja((l as any).id); const r = recMap[(l as any).id] || { fat: 0, com: 0 }; if (meta <= 0 && r.fat <= 0) continue; rows.push({ nome: String((l as any).nome).replace(/^sushi\s+/i, ''), meta, real: r.fat, com: r.com }) }
  rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const T = rows.reduce((a, r) => ({ meta: a.meta + r.meta, real: a.real + r.real, com: a.com + r.com }), { meta: 0, real: 0, com: 0 })
  const pct = (real: number, meta: number) => meta > 0 ? Math.round((real / meta) * 100) : null

  const W = { nome: 11, meta: 7, real: 7, dif: 8 }
  const L = (s: string, n: number) => s.length > n ? s.slice(0, n) : s.padEnd(n)
  const Rp = (s: string, n: number) => s.padStart(n)
  const head = L('Loja', W.nome) + Rp('Meta', W.meta) + Rp('Real', W.real) + Rp('Dif', W.dif)
  const linhas = rows.map((r) => { const dif = r.real - r.meta; return L(r.nome, W.nome) + Rp(kfmt(r.meta), W.meta) + Rp(r.real > 0 ? kfmt(r.real) : '—', W.real) + Rp(r.real > 0 ? (dif >= 0 ? '+' : '') + kfmt(dif) : '—', W.dif) })
  const sep = '─'.repeat(W.nome + W.meta + W.real + W.dif)
  const totalLn = L('REDE', W.nome) + Rp(kfmt(T.meta), W.meta) + Rp(T.real > 0 ? kfmt(T.real) : '—', W.real) + Rp(T.real > 0 ? ((T.real - T.meta >= 0 ? '+' : '') + kfmt(T.real - T.meta)) : '—', W.dif)
  const tabela = '```\n' + [head, ...linhas, sep, totalLn].join('\n') + '\n```'

  const comMeta = rows.filter((r) => r.meta > 0)
  const melhor = comMeta.filter((r) => r.real > 0).sort((a, b) => (b.real / b.meta) - (a.real / a.meta))[0]
  const pior = comMeta.filter((r) => r.real >= 0).sort((a, b) => (a.real / a.meta) - (b.real / b.meta))[0]
  const redePct = pct(T.real, T.meta), ticketRede = T.com > 0 ? T.real / T.com : 0
  const cabeca = modo === 'fechamento' ? `🌙 *Fechamento ${dd}/${mm}*` : `📊 *Metas ${dd}/${mm}* · parcial ${pad2(hora)}h`

  const an: string[] = []
  if (redePct != null) an.push(`📈 *${redePct}% da meta da rede*` + (T.real < T.meta ? ` (faltam ${brl(T.meta - T.real)})` : ` (${brl(T.real - T.meta)} acima)`))
  if (melhor) an.push(`🟢 Destaque: *${melhor.nome}* (${pct(melhor.real, melhor.meta)}%)`)
  if (pior && pior !== melhor && (pct(pior.real, pior.meta) ?? 100) < 100) an.push(`🔴 Atenção: *${pior.nome}* (${pct(pior.real, pior.meta)}%, faltam ${brl(pior.meta - pior.real)})`)
  if (ticketRede > 0) an.push(`🎫 Ticket da rede: ${brl(ticketRede)}`)

  const msg = [cabeca, '', tabela, '', ...an].join('\n')
  if (!rows.length) return json({ ok: true, msg: 'sem lojas com meta/venda no dia', data: iso })

  let enviados = 0
  for (const f of FONES) { if (await enviarZap(f, msg)) enviados++ }
  console.log('metas-alerta:', { modo, data: iso, enviados })
  return json({ ok: true, modo, data: iso, lojas: rows.length, enviados, preview: msg })
})
