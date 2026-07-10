// relatorio-diario — gera o "AIKO Daily" (Relatório Executivo Diário) em PDF e envia
// anexado no WhatsApp (Z-API send-document, base64). Roda no cron das 7h (fechamento de ontem).
// Reaproveita a mesma lógica de meta×realizado do metas-alerta.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { encodeBase64 } from 'https://deno.land/std@0.203.0/encoding/base64.ts'

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

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const pad2 = (n: number) => String(n).padStart(2, '0')
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const nfmt = (n: number) => Math.round(n).toLocaleString('pt-BR')

function manaus(offsetDays = 0) {
  const dt = new Date(Date.now() - 4 * 3600 * 1000 + offsetDays * 86400000)
  return { iso: `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`, dow: dt.getUTCDay(), dia: dt.getUTCDate(), mes: dt.getUTCMonth(), ano: dt.getUTCFullYear() }
}

// status por % da meta
function statusDe(pct: number) {
  if (pct >= 140) return { t: 'Excelente', c: 'g' }
  if (pct >= 100) return { t: 'Acima da Meta', c: 'g' }
  if (pct >= 80) return { t: 'Atenção', c: 'a' }
  return { t: 'Crítico', c: 'r' }
}

// ───────── monta os dados do relatório ─────────
async function montarDados(iso: string, dow: number, dataExtenso: string, hora: string) {
  const { data: lojas } = await supabase.from('lojas').select('id,nome').eq('tenant_id', TENANT).eq('ativo', true)
  const { data: metaSem } = await supabase.from('metas_semana').select('loja_id,dia_semana,valor,canal').eq('tenant_id', TENANT)
  const { data: metaExc } = await supabase.from('metas_excecao').select('loja_id,valor').eq('tenant_id', TENANT).eq('data', iso)
  const { data: rec } = await supabase.from('icomanda_recebimento').select('loja_id,faturado,qtd_comandas,pessoas').eq('tenant_id', TENANT).eq('data', iso).eq('status', 'processado')

  const semMap: Record<string, number> = {}, lojaCanais: Record<string, string[]> = {}
  for (const s of metaSem || []) {
    const c = (s as any).canal || 'total'
    semMap[`${(s as any).loja_id}|${(s as any).dia_semana}|${c}`] = Number((s as any).valor) || 0
    if (c !== 'total' && (Number((s as any).valor) || 0) > 0) { (lojaCanais[(s as any).loja_id] ||= []); if (!lojaCanais[(s as any).loja_id].includes(c)) lojaCanais[(s as any).loja_id].push(c) }
  }
  const excMap: Record<string, number> = {}
  for (const e of metaExc || []) excMap[(e as any).loja_id] = Number((e as any).valor) || 0
  const recMap: Record<string, { fat: number; com: number; pes: number }> = {}
  for (const r of rec || []) recMap[(r as any).loja_id] = { fat: Number((r as any).faturado) || 0, com: Number((r as any).qtd_comandas) || 0, pes: Number((r as any).pessoas) || 0 }

  const metaLoja = (id: string) => { const cs = lojaCanais[id]; if (cs && cs.length) return cs.reduce((a, c) => a + (semMap[`${id}|${dow}|${c}`] ?? 0), 0); return excMap[id] ?? semMap[`${id}|${dow}|total`] ?? 0 }

  const rows = []
  for (const l of lojas || []) {
    const meta = metaLoja((l as any).id)
    const r = recMap[(l as any).id] || { fat: 0, com: 0, pes: 0 }
    if (meta <= 0 && r.fat <= 0) continue
    const pct = meta > 0 ? Math.round((r.fat / meta) * 100) : 0
    rows.push({ nome: String((l as any).nome).replace(/^sushi\s+/i, ''), meta, real: r.fat, com: r.com, pes: r.pes, dif: r.fat - meta, pct, status: statusDe(pct) })
  }
  rows.sort((a, b) => b.pct - a.pct)

  const T = rows.reduce((a, r) => ({ meta: a.meta + r.meta, real: a.real + r.real, com: a.com + r.com, pes: a.pes + r.pes }), { meta: 0, real: 0, com: 0, pes: 0 })
  const atingimento = T.meta > 0 ? Math.round((T.real / T.meta) * 100) : 0
  const ticket = T.com > 0 ? T.real / T.com : 0

  const comReal = rows.filter((r) => r.real > 0)
  const bateram = rows.filter((r) => r.pct >= 100).length
  const abaixo = rows.filter((r) => r.pct < 100)
  const melhor = [...comReal].sort((a, b) => b.pct - a.pct)[0]
  const maiorFat = [...comReal].sort((a, b) => b.real - a.real)[0]
  const maiorCresc = [...comReal].sort((a, b) => b.dif - a.dif)[0]
  const pior = [...rows].sort((a, b) => a.pct - b.pct)[0]

  const destaques: string[] = []
  if (melhor) destaques.push(`Melhor desempenho: ${melhor.nome} (${melhor.pct}%)`)
  if (maiorFat) destaques.push(`Maior faturamento: ${maiorFat.nome} (${brl(maiorFat.real)})`)
  if (maiorCresc) destaques.push(`Maior crescimento: ${maiorCresc.nome} (+${brl(maiorCresc.dif)})`)
  if (abaixo.length) destaques.push(`Lojas abaixo da meta: ${abaixo.map((r) => `${r.nome} (${r.pct}%)`).join(', ')}`)

  const analise = `A rede encerrou o dia com faturamento de ${brl(T.real)}, atingindo ${atingimento}% da meta estabelecida. `
    + `${bateram} de ${rows.length} lojas atingiram ou superaram suas metas. `
    + (melhor ? `${melhor.nome} foi o destaque do dia, com ${melhor.pct}% da meta. ` : '')
    + (abaixo.length && pior ? `${abaixo.map((r) => r.nome).join(' e ')} ficaram abaixo do esperado, sendo a ${pior.nome} a unidade com maior desvio negativo. ` : '')
    + `O ticket médio consolidado da rede foi de ${brl(ticket)}.`

  const alertas: { t: string; c: string }[] = []
  alertas.push(atingimento >= 100 ? { t: 'Rede acima da meta.', c: 'g' } : { t: 'Rede abaixo da meta.', c: 'r' })
  if (bateram) alertas.push({ t: `${bateram} loja${bateram > 1 ? 's' : ''} bateram a meta.`, c: 'g' })
  for (const r of abaixo) alertas.push({ t: `${r.nome} abaixo da meta.`, c: r.pct >= 80 ? 'a' : 'r' })
  if (maiorCresc) alertas.push({ t: `${maiorCresc.nome} impulsionou o resultado da rede.`, c: 'b' })

  return {
    dataExtenso, hora,
    rede: { meta: T.meta, realizado: T.real, dif: T.real - T.meta, atingimento },
    lojas: rows.map((r) => ({ nome: r.nome, meta: r.meta, real: r.real, dif: r.dif, pct: r.pct, status: r.status.t, cor: r.status.c })),
    indicadores: { ticket, clientes: T.pes, comandas: T.com, faturamento: T.real },
    destaques, analise, alertas,
    vazio: rows.length === 0,
  }
}

// ───────── gera o PDF ─────────
const CL = {
  blue: rgb(0.17, 0.34, 0.65), green: rgb(0.20, 0.66, 0.33), amber: rgb(0.95, 0.62, 0.09),
  red: rgb(0.84, 0.19, 0.19), dark: rgb(0.13, 0.15, 0.18), gray: rgb(0.42, 0.45, 0.5),
  line: rgb(0.80, 0.82, 0.85), head: rgb(0.93, 0.94, 0.96),
}
const corDe = (k: string) => k === 'g' ? CL.green : k === 'a' ? CL.amber : k === 'r' ? CL.red : CL.blue

async function gerarPdf(d: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const F = await pdf.embedFont(StandardFonts.Helvetica)
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 48
  let page = pdf.addPage([W, H]); let y = H - M
  const nl = (n = 14) => { y -= n }
  const need = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M } }
  const txt = (s: string, x: number, size: number, font: any, color: any, yy?: number) => page.drawText(String(s), { x, y: yy ?? y, size, font, color })
  const tw = (s: string, size: number, font: any) => font.widthOfTextAtSize(String(s), size)
  const center = (s: string, size: number, font: any, color: any) => txt(s, (W - tw(s, size, font)) / 2, size, font, color)
  const sec = (t: string) => { need(26); nl(13); txt(t, M, 13, FB, CL.blue); nl(6); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: CL.line }); nl(12) }
  const B = (n: number) => brl(n).replace('R$ ', '')

  center('AIKO DAILY', 20, FB, CL.blue); nl(20)
  center('Relatório Executivo Diário', 12, FB, CL.dark); nl(13)
  center(d.dataExtenso, 11, F, CL.gray); nl(6)

  sec('Resumo da Rede')
  const resumo: [string, string, any][] = [
    ['Meta', brl(d.rede.meta), CL.dark], ['Realizado', brl(d.rede.realizado), CL.dark],
    ['Diferença', (d.rede.dif >= 0 ? '+' : '-') + brl(Math.abs(d.rede.dif)), d.rede.dif >= 0 ? CL.green : CL.red],
    ['Atingimento', d.rede.atingimento + '%', CL.dark],
  ]
  for (const [k, v, c] of resumo) { need(20); txt(k, M + 6, 11, F, CL.dark); txt(v, M + 230, 11, FB, c); nl(16) }

  sec('Desempenho das Lojas')
  const cols = [M + 6, M + 150, M + 235, M + 330, M + 415, M + 470]
  const rowH = 18
  need(rowH); page.drawRectangle({ x: M, y: y - rowH + 6, width: W - 2 * M, height: rowH, color: CL.head })
  ;['Loja', 'Meta', 'Real', 'Diferença', '% Meta', 'Status'].forEach((h, i) => txt(h, cols[i], 9.5, FB, CL.dark, y - 8))
  nl(rowH)
  for (const l of d.lojas) {
    need(rowH)
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.4, color: CL.line })
    const cy = y - 8
    txt(l.nome, cols[0], 9.5, F, CL.dark, cy)
    txt(B(l.meta), cols[1], 9.5, F, CL.dark, cy)
    txt(B(l.real), cols[2], 9.5, F, CL.dark, cy)
    txt((l.dif >= 0 ? '+' : '-') + B(Math.abs(l.dif)), cols[3], 9.5, F, l.dif >= 0 ? CL.green : CL.red, cy)
    txt(l.pct + '%', cols[4], 9.5, FB, CL.dark, cy)
    page.drawCircle({ x: cols[5] + 4, y: cy + 3, size: 3.5, color: corDe(l.cor) })
    txt(l.status, cols[5] + 12, 9.5, F, CL.dark, cy)
    nl(rowH)
  }

  sec('Principais Destaques')
  for (const b of d.destaques) { need(15); page.drawCircle({ x: M + 8, y: y + 3, size: 1.6, color: CL.blue }); txt(b, M + 18, 10, F, CL.dark); nl(14) }

  sec('Indicadores da Rede')
  const inds: [string, string][] = [['Ticket Médio', brl(d.indicadores.ticket)], ['Clientes', nfmt(d.indicadores.clientes)], ['Comandas', nfmt(d.indicadores.comandas)], ['Faturamento', brl(d.indicadores.faturamento)]]
  for (const [k, v] of inds) { need(16); txt(k, M + 6, 10.5, F, CL.dark); txt(v, M + 230, 10.5, FB, CL.dark); nl(15) }

  sec('Análise Automática do AIKO')
  const maxW = W - 2 * M - 6; const words = String(d.analise).split(' '); let line = ''
  for (const w of words) { const t = line ? line + ' ' + w : w; if (tw(t, 10, F) > maxW) { need(15); txt(line, M + 6, 10, F, CL.dark); nl(15); line = w } else line = t }
  if (line) { need(15); txt(line, M + 6, 10, F, CL.dark); nl(15) }

  sec('Alertas do Dia')
  for (const a of d.alertas) { need(14); page.drawCircle({ x: M + 8, y: y + 3, size: 3, color: corDe(a.c) }); txt(a.t, M + 18, 10, F, CL.dark); nl(14) }

  nl(10); center(`Relatório gerado automaticamente pelo AIKO • ${d.hora}`, 8.5, F, CL.gray)
  return await pdf.save()
}

// ───────── envia o PDF no WhatsApp (Z-API send-document base64) ─────────
async function enviarPdf(phone: string, b64: string, fileName: string) {
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-document/pdf`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT },
    body: JSON.stringify({ phone, document: `data:application/pdf;base64,${b64}`, fileName }),
  })
  const txt = await res.text()
  console.log(`[zap-doc] ${phone} -> HTTP ${res.status} | ${txt.substring(0, 200)}`)
  return res.ok
}

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  const body = await req.json().catch(() => ({} as any))
  const gate = req.headers.get('x-cron-secret') || body.secret || ''
  if (gate !== GATE) return json({ error: 'não autorizado' }, 401)

  // relatório do dia fechado = ONTEM (Manaus). body.dia='hoje' força hoje (pra testar).
  const off = body.dia === 'hoje' ? 0 : -1
  const m = manaus(off)
  const dataExtenso = `${pad2(m.dia)} de ${MESES[m.mes]} de ${m.ano}`
  const horaManaus = new Date(Date.now() - 4 * 3600 * 1000).getUTCHours()
  const hora = pad2(horaManaus) + ':00'

  const d = await montarDados(m.iso, m.dow, dataExtenso, hora)
  if (d.vazio) return json({ ok: true, msg: 'sem dados no dia', data: m.iso })

  const pdf = await gerarPdf(d)
  const b64 = encodeBase64(pdf)
  const fileName = `AIKO-Daily-${pad2(m.dia)}-${pad2(m.mes + 1)}.pdf`

  let enviados = 0
  for (const f of FONES) { if (await enviarPdf(f, b64, fileName)) enviados++ }
  console.log('relatorio-diario:', { data: m.iso, enviados, kb: (pdf.length / 1024).toFixed(1) })
  return json({ ok: true, data: m.iso, enviados, pdf_kb: (pdf.length / 1024).toFixed(1) })
})
