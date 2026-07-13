// ════════════════════════════════════════════════════════════════════════════
//  sieg-pull — CAPTURA de NF-e via SIEG (API "Sistema Externo", modelo PULL)
//  Fluxo: create-jwt (X-Client-Id + X-Secret-Key) → JWT 24h → Bearer nos endpoints
//  Modos (body.mode):
//    'diag'  (padrão) → gera JWT + conta XMLs. NÃO baixa/grava nada. Teste seguro.
//    'pull'           → baixa os XMLs do período e grava em nfe_recebidas + nfe_itens.
//  Reusa: destino nfe_recebidas+nfe_itens (fonte='sieg'), roteamento por CNPJ do
//  destinatário (acha a loja), auto-vínculo por CNPJ emitente + código (= nfe-webhook),
//  idempotente por chave. Gate por WEBHOOK_SECRET.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TENANT_DEFAULT = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5' // Sushi PN (piloto)
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') || ''
const SIEG_BASE = 'https://api.sieg.com'
const SIEG_CLIENT_ID = Deno.env.get('SIEG_CLIENT_ID') || ''
const SIEG_SECRET_KEY = Deno.env.get('SIEG_SECRET_KEY') || ''
const SIEG_API_KEY = Deno.env.get('SIEG_API_KEY') || '' // Chave API (Pxvw) — hedge, caso o baixar peça

const XML_TYPE_NFE = 1 // 1 = NF-e (confirmar códigos de NFC-e/NFS-e/eventos na doc)

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false })
const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x])
const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })

// ── 1) create-jwt: troca ClientId+SecretKey por um JWT (vale 24h) ─────────────
async function criarJwt(): Promise<{ ok: boolean; jwt?: string; status: number; raw: string }> {
  const res = await fetch(`${SIEG_BASE}/api/v1/create-jwt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': SIEG_CLIENT_ID,
      'X-Secret-Key': SIEG_SECRET_KEY,
    },
    // manda também no corpo (fallback, caso a API espere no body em vez de header)
    body: JSON.stringify({ clientId: SIEG_CLIENT_ID, secretKey: SIEG_SECRET_KEY, ClientId: SIEG_CLIENT_ID, SecretKey: SIEG_SECRET_KEY }),
  })
  const raw = await res.text()
  let jwt: string | undefined
  if (res.ok) {
    const t = raw.trim()
    if (t.startsWith('{')) {
      try { const j = JSON.parse(t); jwt = j.jwt || j.token || j.access_token || j.Jwt || j.Token || j.accessToken } catch { /* ignore */ }
    } else {
      const clean = t.replace(/^"|"$/g, '')
      if (clean.split('.').length === 3) jwt = clean // JWT puro
    }
  }
  return { ok: !!jwt, jwt, status: res.status, raw: raw.substring(0, 600) }
}

// ── headers autenticados p/ os endpoints de dados ────────────────────────────
function authHeaders(jwt: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  if (SIEG_API_KEY) h['X-Api-Key'] = SIEG_API_KEY // hedge (ignorado se não precisar)
  return h
}

// ── contar-xmls: quantas notas tem no período (teste seguro, não baixa) ───────
async function contarXmls(jwt: string, dataIni: string, dataFim: string): Promise<{ status: number; raw: string }> {
  const body = { XmlType: XML_TYPE_NFE, DataEmissaoInicio: dataIni, DataEmissaoFim: dataFim }
  const res = await fetch(`${SIEG_BASE}/api/v1/contar-xmls`, { method: 'POST', headers: authHeaders(jwt), body: JSON.stringify(body) })
  const raw = await res.text()
  return { status: res.status, raw: raw.substring(0, 600) }
}

// ── baixar-xmls: traz os XMLs em lote (Take/Skip). Retorna lista de XML strings ─
async function baixarXmls(jwt: string, dataIni: string, dataFim: string, skip: number, take = 50): Promise<{ status: number; xmls: string[]; rawHead: string }> {
  const body = { XmlType: XML_TYPE_NFE, Take: take, Skip: skip, DataEmissaoInicio: dataIni, DataEmissaoFim: dataFim, Downloadevent: false }
  const res = await fetch(`${SIEG_BASE}/api/v1/baixar-xmls`, { method: 'POST', headers: authHeaders(jwt), body: JSON.stringify(body) })
  const raw = await res.text()
  if (!res.ok) return { status: res.status, xmls: [], rawHead: raw.substring(0, 400) }
  // formato pode ser: array de XML strings, array base64, ou envelope {xmls:[...]}
  let data: unknown
  try { data = JSON.parse(raw) } catch { return { status: res.status, xmls: [], rawHead: raw.substring(0, 400) } }
  const lista = Array.isArray(data) ? data : ((data as any)?.xmls ?? (data as any)?.Xmls ?? (data as any)?.xmlS ?? [])
  const xmls = (lista as string[]).map((x) => {
    const s = String(x || '')
    if (s.trimStart().startsWith('<')) return s
    try { return atob(s) } catch { return s }
  }).filter(Boolean)
  return { status: res.status, xmls, rawHead: raw.substring(0, 200) }
}

// ── parse do XML da NF-e ─────────────────────────────────────────────────────
function parseNfe(xml: string) {
  const doc: any = parser.parse(xml)
  const inf = doc?.nfeProc?.NFe?.infNFe ?? doc?.NFe?.infNFe ?? doc?.infNFe
  if (!inf) return null
  const chave = onlyDigits(inf['@_Id']).slice(-44)
  if (chave.length !== 44) return null
  const ide = inf.ide || {}, emit = inf.emit || {}, total = inf.total?.ICMSTot || {}
  return {
    chave,
    numero: String(ide.nNF ?? chave.substring(25, 34).replace(/^0+/, '') || '0'),
    serie: String(ide.serie ?? chave.substring(22, 25)),
    cnpjEmit: onlyDigits(emit.CNPJ),
    nomeEmit: String(emit.xNome ?? ''),
    cnpjDest: onlyDigits(inf.dest?.CNPJ),
    dataEmissao: String(ide.dhEmi ?? ide.dEmi ?? new Date().toISOString()),
    valorTotal: parseFloat(total.vNF ?? '0') || 0,
    itens: arr<any>(inf.det).map((d) => {
      const p = d.prod || {}
      return {
        descricao: String(p.xProd ?? '').toUpperCase(),
        codigo: String(p.cProd ?? ''),
        unidade: String(p.uCom ?? 'UN').toUpperCase(),
        quantidade: parseFloat(p.qCom ?? '0') || 0,
        valorUnit: parseFloat(p.vUnCom ?? '0') || 0,
        valorTotal: parseFloat(p.vProd ?? '0') || (parseFloat(p.qCom ?? '0') * parseFloat(p.vUnCom ?? '0')) || 0,
      }
    }),
  }
}

// ── MODO PULL: baixa + grava (idempotente por chave) ─────────────────────────
async function rodarPull(tenant: string, dias: number, jwt: string) {
  const { data: lojas } = await supabase.from('lojas').select('id,cnpj').eq('tenant_id', tenant)
  const lojaByCnpj: Record<string, string> = {}
  for (const l of lojas || []) { const c = onlyDigits((l as any).cnpj); if (c.length === 14) lojaByCnpj[c] = (l as any).id }

  const { data: fornAll } = await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', tenant)
  const { data: vincAll } = await supabase.from('insumo_fornecedores').select('id,codigo_fornecedor,fornecedor_id').eq('tenant_id', tenant)

  const jaExistem = new Set<string>()
  for (let off = 0; off < 100000; off += 1000) {
    const { data: chs } = await supabase.from('nfe_recebidas').select('chave_acesso').eq('tenant_id', tenant).range(off, off + 999)
    if (!chs?.length) break
    for (const r of chs) jaExistem.add((r as any).chave_acesso)
    if (chs.length < 1000) break
  }

  const fim = new Date().toISOString().substring(0, 19)
  const ini = new Date(Date.now() - dias * 86400000).toISOString().substring(0, 19)

  const inicio = Date.now()
  let baixados = 0, novas = 0, itensGravados = 0, erros = 0
  let ultimoStatus = 0, ultimoRaw = ''
  for (let skip = 0; skip < 5000; skip += 50) {
    if (Date.now() - inicio > 40000) break
    const r = await baixarXmls(jwt, ini, fim, skip, 50)
    ultimoStatus = r.status; ultimoRaw = r.rawHead
    if (!r.xmls.length) break
    baixados += r.xmls.length

    for (const xml of r.xmls) {
      try {
        const nf = parseNfe(xml); if (!nf) continue
        if (jaExistem.has(nf.chave)) continue
        const lojaId = lojaByCnpj[nf.cnpjDest] || null
        const { data: nova, error } = await supabase.from('nfe_recebidas').insert({
          tenant_id: tenant, loja_id: lojaId, numero: nf.numero, serie: nf.serie, chave_acesso: nf.chave,
          cnpj_emitente: nf.cnpjEmit, nome_emitente: nf.nomeEmit, data_emissao: nf.dataEmissao,
          valor_total: nf.valorTotal, status: 'aguard_vinculacao', fonte: 'sieg',
        }).select('id').single()
        if (error) { if ((error as any).code === '23505') { jaExistem.add(nf.chave); continue } erros++; continue }
        jaExistem.add(nf.chave); novas++
        const nfeId = (nova as any).id

        const fornId = (fornAll || []).find((f: any) => onlyDigits(f.cnpj) === nf.cnpjEmit)?.id || null
        const batch = nf.itens.map((it) => {
          const vinc = fornId ? (vincAll || []).find((v: any) => v.codigo_fornecedor === it.codigo && v.fornecedor_id === fornId) : null
          return {
            nfe_id: nfeId, tenant_id: tenant, descricao_nfe: it.descricao, codigo_item_fornecedor: it.codigo,
            quantidade: it.quantidade, unidade_nfe: it.unidade, valor_unitario: it.valorUnit,
            valor_total: it.valorTotal, vinculacao_id: (vinc as any)?.id || null,
          }
        })
        if (batch.length) { const { error: e2 } = await supabase.from('nfe_itens').insert(batch); if (!e2) itensGravados += batch.length }
        const semVinc = batch.filter((b) => !b.vinculacao_id).length
        await supabase.from('nfe_recebidas').update({ status: semVinc === 0 ? 'pronta' : 'aguard_vinculacao' }).eq('id', nfeId)
      } catch (e) { console.error('sieg ingest erro:', (e as Error).message); erros++ }
    }
    if (r.xmls.length < 50) break
  }

  console.log('SIEG pull:', { baixados, novas, itensGravados, erros })
  return json({ ok: true, modo: 'pull', periodo: { ini, fim }, baixados, novas, itensGravados, erros, ultimoStatus, ultimoRaw })
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  const body = await req.json().catch(() => ({}))

  // gate (mesmo segredo dos modos admin do nfe-webhook)
  if (WEBHOOK_SECRET) {
    const provided = new URL(req.url).searchParams.get('secret') || req.headers.get('x-webhook-secret') || (body as any).secret || ''
    if (provided !== WEBHOOK_SECRET) return json({ error: 'não autorizado' }, 401)
  }
  if (!SIEG_CLIENT_ID || !SIEG_SECRET_KEY) return json({ error: 'faltam secrets SIEG_CLIENT_ID / SIEG_SECRET_KEY' }, 400)

  const tenant = (body as any).tenant || TENANT_DEFAULT
  const dias = Number((body as any).dias) || 7
  const modo = (body as any).mode || 'diag'

  // 1) autentica (create-jwt)
  const auth = await criarJwt()
  if (!auth.ok) return json({ etapa: 'create-jwt', ok: false, status: auth.status, raw: auth.raw, dica: 'se status=401/403 revisar ClientId/SecretKey; se "Invalid IP" a trava de IP ainda existe' }, 200)

  const fim = new Date().toISOString().substring(0, 19)
  const ini = new Date(Date.now() - dias * 86400000).toISOString().substring(0, 19)

  // 2) DIAG: só conta (não baixa nem grava)
  if (modo === 'diag') {
    const c = await contarXmls(auth.jwt!, ini, fim)
    return json({ modo: 'diag', jwt_ok: true, jwt_status: auth.status, periodo: { ini, fim }, contar_status: c.status, contar_raw: c.raw })
  }

  // 3) PULL: baixa e grava
  return await rodarPull(tenant, dias, auth.jwt!)
})
