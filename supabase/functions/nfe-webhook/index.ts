import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const MORI_TENANT_ID = '33e81daf-662f-43d1-8684-0702e959c4f9'  // default p/ compat: webhook do Mori não passa ?tenant
const FOCUS_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN')!
const FOCUS_URL   = 'https://api.focusnfe.com.br'

// FocusNFe usa HTTP Basic Auth: token como usuário, senha vazia → base64("token:")
const FOCUS_AUTH = 'Basic ' + btoa(FOCUS_TOKEN + ':')

// ── SEGURANÇA ──────────────────────────────────────────────────────────────
// Segredo compartilhado que protege APENAS os modos administrativos (pull/backfill/
// reprocessar/amostra) e o cron. A INGESTÃO do Focus NÃO usa o secret (o Focus não
// deixa editar a URL do webhook, então não tem como ele mandar ?secret=). Sem
// WEBHOOK_SECRET setado, o gate fica desligado (compat). O vazamento de dados
// (completa/danfe) é fechado pelo token de login + RLS, não pelo secret.
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') || ''
// Chave PUBLISHABLE (mesma do front) p/ validar o token de login nos modos de leitura
// (completa/danfe). Preferir APP_PUBLISHABLE_KEY; cai pra SUPABASE_ANON_KEY se não setada.
const APP_PUBLISHABLE_KEY = Deno.env.get('APP_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''

// Confere o segredo (query ?secret=, header x-webhook-secret ou body.secret).
// Sem WEBHOOK_SECRET configurado → retorna true (compat, não quebra nada).
function secretOk(req: Request, body: any): boolean {
  if (!WEBHOOK_SECRET) return true
  const provided = new URL(req.url).searchParams.get('secret')
    || req.headers.get('x-webhook-secret')
    || (body && body.secret) || ''
  return provided === WEBHOOK_SECRET
}

// Valida que o token de login (Authorization: Bearer <jwt>) pertence a um usuário
// cujo TENANT é dono da chave informada. Usa um cliente escopado pelo usuário —
// a RLS (get_my_tenant_id) faz o isolamento por tenant automaticamente.
// Fecha o vazamento: sem isto, qualquer um puxaria a nota completa de qualquer chave.
async function tenantOwnsChave(authHeader: string | null, chave: string): Promise<boolean> {
  if (!authHeader || !APP_PUBLISHABLE_KEY || !chave) return false
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return false
  try {
    const uc = createClient(Deno.env.get('SUPABASE_URL')!, APP_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // 1) token tem que ser de um usuário válido
    const { data: { user }, error: uErr } = await uc.auth.getUser(jwt)
    if (uErr || !user) return false
    // 2) a chave tem que existir NO TENANT do usuário (RLS get_my_tenant_id faz o corte)
    const { data } = await uc.from('nfe_recebidas').select('id').eq('chave_acesso', chave).limit(1)
    return !!(data && data.length)
  } catch (e) {
    console.error('tenantOwnsChave erro:', (e as Error).message)
    return false
  }
}

// Manifesta CIÊNCIA da operação na nota recebida.
// Sem isso, a SEFAZ NÃO libera o XML completo com os itens (só o resumo).
// É idempotente do nosso lado: se já estiver manifestada, o Focus retorna erro
// e nós apenas ignoramos e seguimos.
async function manifestarCiencia(chave: string) {
  try {
    const url = `${FOCUS_URL}/v2/nfes_recebidas/${chave}/manifesto`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': FOCUS_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ciencia' }),
    })
    const txt = await res.text()
    console.log('Manifestar ciência - status:', res.status, '- resposta:', txt.substring(0, 300))
    return res.ok
  } catch (e) {
    console.error('Erro manifestarCiencia:', e)
    return false
  }
}

// Busca a NF-e COMPLETA (com itens). Precisa de ".json?completa=1".
// Os itens só vêm depois da manifestação de ciência E quando o XML já foi baixado
// pela SEFAZ — pode não estar pronto na 1ª chamada (vem no 2º disparo do webhook).
async function fetchNfeCompleta(chave: string) {
  try {
    const url = `${FOCUS_URL}/v2/nfes_recebidas/${chave}.json?completa=1`
    console.log('Buscando NF-e completa:', url)
    const res = await fetch(url, { headers: { 'Authorization': FOCUS_AUTH } })
    console.log('Status Focus NFe API:', res.status)
    if (!res.ok) {
      const txt = await res.text()
      console.log('Resposta erro:', txt.substring(0, 500))
      return null
    }
    const data = await res.json()
    console.log('Resposta COMPLETA Focus NFe:', JSON.stringify(data).substring(0, 800))
    return data
  } catch (e) {
    console.error('Erro fetchNfeCompleta:', e)
    return null
  }
}

// valor_total do item: usa o valor_bruto da NF-e (vProd); se vier ausente/zerado,
// cai pra quantidade × valor unitário (nunca grava 0 por falta do campo).
function valTotalItem(item: any): number {
  return parseFloat(item.valor_bruto || '0')
    || (parseFloat(item.quantidade_comercial || '0') * parseFloat(item.valor_unitario_comercial || '0'))
}

// Extrai a data de vencimento + valor do título das duplicatas da nota completa do Focus.
// duplicatas: 1 parcela vem como objeto; várias vêm como array. Pega a parcela de vencimento mais próximo.
function extrairVencimento(completa: any) {
  const req = completa?.requisicao_nota_fiscal || {}
  let dups = req.duplicatas
  if (!dups) return { data_vencimento: null, valor_titulo: null }
  if (!Array.isArray(dups)) dups = [dups]
  dups = dups.filter((d: any) => d && d.data_vencimento)
  if (!dups.length) return { data_vencimento: null, valor_titulo: null }
  dups.sort((a: any, b: any) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))
  const primeira = dups[0]
  // valor DO TÍTULO = valor da parcela de vencimento mais próximo (não o total da fatura);
  // em nota parcelada, casar o valor com a data faz o financeiro bater. Fallback: líquido da fatura.
  const valor = parseFloat(primeira.valor || req.valor_liquido_fatura || '0')
  return { data_vencimento: primeira.data_vencimento || null, valor_titulo: valor || null }
}

// ── BACKFILL: carimba loja_id nas notas antigas (loja_id null) pelo CNPJ do destinatário ──
// Roda em lote, com orçamento de tempo (~110s) por chamada. Reinvocar até restantes=0.
async function rodarBackfillLoja(tenant: string) {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

  const _uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!_uuid.test(tenant)) return json({ error: 'backfill: informe "tenant" (uuid) no corpo' }, 400)

  const { data: lojas } = await supabase.from('lojas').select('id,nome,cnpj').eq('tenant_id', tenant)
  const lojasCnpj = (lojas || [])
    .map((l: any) => ({ id: l.id, nome: l.nome, cnpj: String(l.cnpj || '').replace(/\D/g, '') }))
    .filter((l: any) => l.cnpj.length === 14)
  if (!lojasCnpj.length) return json({ error: 'backfill: nenhuma loja com CNPJ cadastrado (preencha o CNPJ das lojas)' }, 400)

  const { data: notas } = await supabase
    .from('nfe_recebidas')
    .select('id,chave_acesso')
    .eq('tenant_id', tenant)
    .is('loja_id', null)
    .limit(300)

  const inicio = Date.now()
  let processadas = 0, fixadas = 0, semXml = 0, semMatch = 0
  for (const n of notas || []) {
    if (Date.now() - inicio > 110000) break  // orçamento de tempo
    processadas++
    await manifestarCiencia(n.chave_acesso)
    const completa = await fetchNfeCompleta(n.chave_acesso)
    if (!completa) { semXml++; continue }
    const raw = JSON.stringify(completa)
    const loja = lojasCnpj.find((l: any) => raw.includes(l.cnpj))
    if (!loja) { semMatch++; continue }
    await supabase.from('nfe_recebidas').update({ loja_id: loja.id }).eq('id', n.id)
    fixadas++
  }

  const { count: restantes } = await supabase
    .from('nfe_recebidas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant)
    .is('loja_id', null)

  console.log('Backfill:', { processadas, fixadas, semXml, semMatch, restantes })
  return json({ ok: true, processadas, fixadas, semXml, semMatch, restantes })
}

// ── BACKFILL VENCIMENTO: preenche data_vencimento/valor_titulo nas notas sem (busca duplicatas no Focus) ──
async function rodarBackfillVenc(tenant: string) {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
  const _uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!_uuid.test(tenant)) return json({ error: 'backfill_venc: informe "tenant" (uuid) no corpo' }, 400)

  const { data: notas } = await supabase
    .from('nfe_recebidas')
    .select('id,chave_acesso')
    .eq('tenant_id', tenant)
    .is('data_vencimento', null)
    .limit(300)

  const inicio = Date.now()
  let processadas = 0, fixadas = 0, semXml = 0, semVenc = 0
  for (const n of notas || []) {
    if (Date.now() - inicio > 110000) break
    processadas++
    const completa = await fetchNfeCompleta(n.chave_acesso)
    if (!completa) { semXml++; continue }
    const venc = extrairVencimento(completa)
    if (!venc.data_vencimento) { semVenc++; continue }   // nota à vista / sem duplicata = sem vencimento (normal)
    await supabase.from('nfe_recebidas')
      .update({ data_vencimento: venc.data_vencimento, valor_titulo: venc.valor_titulo })
      .eq('id', n.id)
    fixadas++
  }
  const { count: restantes } = await supabase
    .from('nfe_recebidas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant)
    .is('data_vencimento', null)
  console.log('BackfillVenc:', { processadas, fixadas, semXml, semVenc, restantes })
  return json({ ok: true, processadas, fixadas, semXml, semVenc, restantes })
}

// ── REPROCESSAR: completa as notas presas em 'em_transito' (manifesta + busca XML + grava itens) ──
// Substitui a função externa "smart-action" (que dependia de chave revogada). Pública, sem chave.
// Body: { "reprocessar": true } (todos os tenants) ou { "reprocessar": true, "tenant": "<uuid>" }.
async function rodarReprocessar(tenant?: string) {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
  const _uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  let q = supabase.from('nfe_recebidas').select('id,chave_acesso,tenant_id,loja_id').eq('status', 'em_transito')
  if (tenant && _uuid.test(tenant)) q = q.eq('tenant_id', tenant)
  const { data: notas } = await q.limit(300)

  const lojasCache: Record<string, any[]> = {}
  const vincCache: Record<string, any[]> = {}
  const fornCache: Record<string, any[]> = {}
  const inicio = Date.now()
  let processadas = 0, completadas = 0, semXml = 0, erros = 0

  for (const n of notas || []) {
    if (Date.now() - inicio > 110000) break
    processadas++
    try {
      await manifestarCiencia(n.chave_acesso)
      const completa = await fetchNfeCompleta(n.chave_acesso)
      const itensNfe: any[] = completa?.requisicao_nota_fiscal?.itens || []
      if (!itensNfe.length) { semXml++; continue }   // XML da SEFAZ ainda não disponível

      // cache por tenant (evita query por nota)
      if (!lojasCache[n.tenant_id]) lojasCache[n.tenant_id] = (await supabase.from('lojas').select('id,cnpj').eq('tenant_id', n.tenant_id)).data || []
      if (!vincCache[n.tenant_id]) vincCache[n.tenant_id] = (await supabase.from('insumo_fornecedores').select('id,codigo_fornecedor,fornecedor_id').eq('tenant_id', n.tenant_id)).data || []
      if (!fornCache[n.tenant_id]) fornCache[n.tenant_id] = (await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', n.tenant_id)).data || []
      // fornecedor da nota pelo CNPJ do emitente (posições 6-20 da chave) — auto-vincula só se for DELE
      const _cnpjEmit = String(n.chave_acesso||'').substring(6,20)
      const _fornNotaId = fornCache[n.tenant_id].find((f:any)=>String(f.cnpj||'').replace(/\D/g,'')===_cnpjEmit)?.id || null

      // descobre loja (se ainda null) pelo CNPJ do destinatário + vencimento
      const upd: any = {}
      if (!n.loja_id) {
        const raw = JSON.stringify(completa)
        const l = lojasCache[n.tenant_id].find((x: any) => { const c = String(x.cnpj || '').replace(/\D/g, ''); return c.length === 14 && raw.includes(c) })
        if (l) upd.loja_id = l.id
      }
      const venc = extrairVencimento(completa)
      if (venc.data_vencimento) { upd.data_vencimento = venc.data_vencimento; upd.valor_titulo = venc.valor_titulo }
      if (Object.keys(upd).length) await supabase.from('nfe_recebidas').update(upd).eq('id', n.id)

      // grava itens (mesma lógica do fluxo normal; índice único protege duplicata)
      const batch = itensNfe.map((item: any) => {
        const codigo = String(item.codigo_produto || '')
        const vinc = _fornNotaId ? vincCache[n.tenant_id].find((v: any) => v.codigo_fornecedor === codigo && v.fornecedor_id === _fornNotaId) : null
        return {
          nfe_id: n.id, tenant_id: n.tenant_id,
          descricao_nfe: String(item.descricao || '').toUpperCase(),
          codigo_item_fornecedor: codigo,
          quantidade: parseFloat(item.quantidade_comercial || '0'),
          unidade_nfe: String(item.unidade_comercial || 'UN').toUpperCase(),
          valor_unitario: parseFloat(item.valor_unitario_comercial || '0'),
          valor_total: valTotalItem(item),
          vinculacao_id: vinc?.id || null,
        }
      })
      const { error: itensErr } = await supabase.from('nfe_itens').insert(batch)
      if (itensErr && itensErr.code === '23505') {
        await supabase.from('nfe_recebidas').update({ status: 'aguard_vinculacao' }).eq('id', n.id)
        completadas++; continue
      }
      if (itensErr) { console.error('reprocessar itens erro:', JSON.stringify(itensErr)); erros++; continue }
      const semVinc = batch.filter((i: any) => !i.vinculacao_id).length
      await supabase.from('nfe_recebidas').update({ status: semVinc === 0 ? 'pronta' : 'aguard_vinculacao' }).eq('id', n.id)
      completadas++
    } catch (e) { console.error('reprocessar nota erro:', (e as Error).message); erros++ }
  }

  let rq = supabase.from('nfe_recebidas').select('id', { count: 'exact', head: true }).eq('status', 'em_transito')
  if (tenant && _uuid.test(tenant)) rq = rq.eq('tenant_id', tenant)
  const { count: restantes } = await rq
  console.log('Reprocessar:', { processadas, completadas, semXml, erros, restantes })
  return json({ ok: true, processadas, completadas, semXml, erros, restantes })
}

// ── PULL: busca no Focus as notas recebidas de cada filial e importa as que faltam no banco ──
// Diagnóstico embutido: devolve amostra da resposta do Focus (lista e completa) pra ajustar se preciso.
async function rodarPullFocus(tenant: string) {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
  const _uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!_uuid.test(tenant)) return json({ error: 'pull: informe "tenant" (uuid) no corpo' }, 400)

  const { data: lojas } = await supabase.from('lojas').select('id,nome,cnpj').eq('tenant_id', tenant)
  const lojasCnpj = (lojas || [])
    .map((l: any) => ({ id: l.id, nome: l.nome, cnpj: String(l.cnpj || '').replace(/\D/g, '') }))
    .filter((l: any) => l.cnpj.length === 14)
  if (!lojasCnpj.length) return json({ error: 'pull: nenhuma loja com CNPJ cadastrado' }, 400)

  const inicio = Date.now()
  const diag: any[] = []
  let amostraLista: any = null, amostraCompleta: any = null
  let encontradas = 0, novas = 0, importadas = 0, erros = 0

  for (const loja of lojasCnpj) {
    if (Date.now() - inicio > 115000) { diag.push({ loja: loja.nome, status: 'pulado-tempo' }); continue }
    // PAGINAÇÃO: o Focus retorna no máx 100 notas por página; pra pegar as próximas
    // passa-se ?versao=<X-Max-Version> (header) até cobrir o X-Total-Count.
    let versao = '', totalFocus = 0, paginas = 0, noFocusLoja = 0, guard = 0
    paginar: while (guard < 100) {
      guard++
      if (Date.now() - inicio > 110000) { diag.push({ loja: loja.nome, status: 'parou-tempo', paginas }); break }
      let res: Response
      try {
        res = await fetch(`${FOCUS_URL}/v2/nfes_recebidas?cnpj=${loja.cnpj}${versao ? `&versao=${versao}` : ''}`, { headers: { 'Authorization': FOCUS_AUTH } })
      } catch (e) { diag.push({ loja: loja.nome, fetchErro: String(e) }); break }
      const txt = await res.text()
      if (!amostraLista) amostraLista = { loja: loja.nome, http: res.status, body: txt.substring(0, 700) }
      if (!res.ok) { diag.push({ loja: loja.nome, http: res.status }); break }
      let lista: any
      try { lista = JSON.parse(txt) } catch { diag.push({ loja: loja.nome, jsonErro: true }); break }
      const arr = Array.isArray(lista) ? lista : (lista?.nfes || lista?.notas || lista?.data || lista?.documentos || [])
      if (!Array.isArray(arr) || arr.length === 0) break
      paginas++; noFocusLoja += arr.length
      const tc = parseInt(res.headers.get('x-total-count') || '0'); if (tc) totalFocus = tc

      for (const it of arr) {
        if (Date.now() - inicio > 110000) break paginar
        const chave = String(it.chave_nfe || it.chave || it.chave_acesso || it.chave_acesso_nfe || '')
        if (chave.length !== 44) continue
        encontradas++
        const { count } = await supabase.from('nfe_recebidas').select('id', { count: 'exact', head: true }).eq('chave_acesso', chave)
        if (count && count > 0) continue
        novas++
        try {
          await manifestarCiencia(chave)
          const completa = await fetchNfeCompleta(chave)
          if (!amostraCompleta && completa) amostraCompleta = JSON.stringify(completa).substring(0, 700)
          const raw = completa ? JSON.stringify(completa) : ''
          const lojaMatch = lojasCnpj.find((l: any) => raw.includes(l.cnpj))
          const req: any = completa?.requisicao_nota_fiscal || {}
          const itensNfe: any[] = req.itens || []
          const numero = chave.substring(25, 34).replace(/^0+/, '') || '0'
          const serie  = chave.substring(22, 25)
          const cnpjEmit = chave.substring(6, 20)
          const { data: nova, error: insErr } = await supabase.from('nfe_recebidas').insert({
            tenant_id: tenant, loja_id: lojaMatch?.id || null, numero, serie, chave_acesso: chave,
            cnpj_emitente: cnpjEmit, nome_emitente: String(req.nome_emitente || it.nome_emitente || ''),
            data_emissao: req.data_emissao || it.data_emissao || new Date().toISOString(),
            valor_total: parseFloat(req.valor_total || it.valor_total || '0'),
            status: itensNfe.length > 0 ? 'aguard_vinculacao' : 'em_transito', fonte: 'pull',
          }).select('id').single()
          if (insErr) { erros++; continue }
          if (itensNfe.length > 0 && nova) {
            const { data: vinc } = await supabase.from('insumo_fornecedores').select('id,codigo_fornecedor,fornecedor_id').eq('tenant_id', tenant)
            // Fornecedor da nota (CNPJ do emitente). SÓ auto-vincula se o vínculo for DESSE fornecedor
            // (código sozinho colide entre fornecedores — códigos genéricos 2000000000xxx).
            const { data: fpull } = await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', tenant)
            const fornNotaId = (fpull || []).find((f: any) => String(f.cnpj || '').replace(/\D/g, '') === cnpjEmit)?.id || null
            const batch = itensNfe.map((item: any) => ({
              nfe_id: nova.id, tenant_id: tenant,
              descricao_nfe: String(item.descricao || '').toUpperCase(),
              codigo_item_fornecedor: String(item.codigo_produto || ''),
              quantidade: parseFloat(item.quantidade_comercial || '0'),
              unidade_nfe: String(item.unidade_comercial || 'UN').toUpperCase(),
              valor_unitario: parseFloat(item.valor_unitario_comercial || '0'),
              valor_total: valTotalItem(item),
              vinculacao_id: fornNotaId ? ((vinc || []).find((v: any) => v.codigo_fornecedor === String(item.codigo_produto || '') && v.fornecedor_id === fornNotaId)?.id || null) : null,
            }))
            const { error: itErr } = await supabase.from('nfe_itens').insert(batch)
            // Se os itens não foram gravados (e não foi duplicata), não deixa a nota presa em
            // 'aguard_vinculacao' sem item: volta para 'em_transito' (Pendente, reprocessável).
            if (itErr && itErr.code !== '23505') {
              await supabase.from('nfe_recebidas').update({ status: 'em_transito' }).eq('id', nova.id)
            }
          }
          importadas++
        } catch (e) { erros++; console.error('pull item erro:', (e as Error).message) }
      }

      // próxima página: usa X-Max-Version (ou o maior "versao" do lote como fallback)
      const hdrMax = res.headers.get('x-max-version')
      const arrMax = arr.reduce((m: number, n: any) => Math.max(m, +n.versao || 0), 0)
      const nextV = (hdrMax && hdrMax !== '0') ? hdrMax : (arrMax > 0 ? String(arrMax) : '')
      if (!nextV || nextV === versao) break            // sem avanço → fim
      versao = nextV
      if (arr.length < 100) break                      // lote incompleto = última página
      if (totalFocus && noFocusLoja >= totalFocus) break
    }
    diag.push({ loja: loja.nome, noFocus: noFocusLoja, totalFocus, paginas })
  }

  console.log('Pull:', { encontradas, novas, importadas, erros })
  return json({ ok: true, encontradas, novas, importadas, erros, amostraLista, amostraCompleta, diag })
}

Deno.serve(async (req) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('OK', { status: 200, headers: CORS })

  // Multi-empresa: o tenant vem na URL (?tenant=uuid). Sem param = Mori (compat. com o webhook atual).
  const _uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const _params = new URL(req.url).searchParams
  const _tParam = _params.get('tenant') || ''
  const TENANT_ID = _uuid.test(_tParam) ? _tParam : MORI_TENANT_ID
  // loja vem na URL (?loja=uuid) — multi-CNPJ: cada filial manda a nota já amarrada na loja dela
  const _lParam = _params.get('loja') || ''
  const LOJA_ID = _uuid.test(_lParam) ? _lParam : null
  console.log('Webhook para tenant:', TENANT_ID, '| loja:', LOJA_ID)

  try {
    const body = await req.json()
    console.log('Webhook recebido:', JSON.stringify(body).substring(0, 500))

    // Modos administrativos (mexem em massa no Focus/banco de um ou de TODOS os tenants):
    // exigem o segredo compartilhado. Sem WEBHOOK_SECRET configurado, secretOk() é true (compat).
    const _adminMode = body.backfill === true || body.pull === true
      || body.backfill_venc === true || body.reprocessar === true || body.amostra === true
    if (_adminMode && !secretOk(req, body)) {
      return new Response(JSON.stringify({ error: 'não autorizado (segredo inválido)' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // Modo BACKFILL (manual): { "backfill": true, "tenant": "<uuid>" } → carimba loja nas notas antigas
    if (body.backfill === true) {
      return await rodarBackfillLoja(body.tenant || TENANT_ID)
    }

    // Modo PULL (manual): { "pull": true, "tenant": "<uuid>" } → busca no Focus e importa as notas que faltam
    if (body.pull === true) {
      return await rodarPullFocus(body.tenant || TENANT_ID)
    }

    // Modo BACKFILL VENCIMENTO (manual): { "backfill_venc": true, "tenant": "<uuid>" } → preenche data de vencimento das notas antigas
    if (body.backfill_venc === true) {
      return await rodarBackfillVenc(body.tenant || TENANT_ID)
    }

    // Modo REPROCESSAR: { "reprocessar": true } → completa notas presas em 'em_transito' (substitui o cron/smart-action).
    // tenant é OPCIONAL aqui (sem tenant = todos os tenants); o cron chama assim, sem chave.
    if (body.reprocessar === true) {
      return await rodarReprocessar(body.tenant)
    }

    // Modo AMOSTRA (diagnóstico): { "amostra": true, "tenant": "<uuid>" } → devolve UMA nota completa do Focus
    // (pra descobrir onde estão os campos, ex: data de vencimento / duplicatas)
    if (body.amostra === true) {
      const _t = body.tenant || TENANT_ID
      const { data: _ns } = await supabase.from('nfe_recebidas')
        .select('chave_acesso').eq('tenant_id', _t).order('created_at', { ascending: false }).limit(8)
      for (const _n of _ns || []) {
        const _c = await fetchNfeCompleta(_n.chave_acesso)
        if (_c) return new Response(JSON.stringify({ ok: true, chave: _n.chave_acesso, completa: _c }), { headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: false, msg: 'nenhuma nota completa disponível' }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Modo COMPLETA: { "completa": true, "chave": "<44 dígitos>" } → devolve o JSON completo da nota
    // (requisicao_nota_fiscal + itens) p/ gerar o "DANFE padrão Aiko" com todos os campos.
    if (body.completa === true && body.chave) {
      const ch = String(body.chave).replace(/\D/g, '')
      // Só devolve a nota completa se o usuário logado for do tenant dono da chave (RLS).
      if (!(await tenantOwnsChave(req.headers.get('Authorization'), ch))) {
        return new Response(JSON.stringify({ ok: false, msg: 'não autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } })
      }
      const c = await fetchNfeCompleta(ch)
      if (c) return new Response(JSON.stringify({ ok: true, nota: c }), { headers: { 'Content-Type': 'application/json', ...CORS } })
      return new Response(JSON.stringify({ ok: false, msg: 'nota completa indisponível no Focus' }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } })
    }

    // Modo DANFE: { "danfe": true, "chave": "<44 dígitos>" } → devolve a URL do PDF do DANFE.
    // O Focus responde 302 com a URL pré-assinada no header Location; repassamos pro navegador abrir/imprimir.
    if (body.danfe === true && body.chave) {
      const ch = String(body.chave).replace(/\D/g, '')
      // Mesma proteção do modo completa: exige token de login do tenant dono da chave.
      if (!(await tenantOwnsChave(req.headers.get('Authorization'), ch))) {
        return new Response(JSON.stringify({ ok: false, msg: 'não autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } })
      }
      try {
        const res = await fetch(`${FOCUS_URL}/v2/nfes_recebidas/${ch}.pdf`, {
          method: 'GET', headers: { 'Authorization': FOCUS_AUTH }, redirect: 'manual',
        })
        const loc = res.headers.get('location')
        if (loc) return new Response(JSON.stringify({ ok: true, url: loc }), { headers: { 'Content-Type': 'application/json', ...CORS } })
        return new Response(JSON.stringify({ ok: false, status: res.status, msg: 'DANFE indisponível (sem Location)' }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, msg: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } })
      }
    }

    // Ingestão (o Focus chama esta rota). NÃO exige segredo: o Focus não permite editar
    // a URL do webhook (não dá pra ele mandar ?secret=), e o payload é dele. O secret
    // protege só os modos admin (pull/backfill/reprocessar) e o cron, que nós controlamos.
    // Risco residual da ingestão aberta: injeção de "nota fantasma" (sem item, inofensiva) —
    // o vazamento de dados (completa/danfe) já está fechado pelo token de login + RLS.

    const cnpjEmitente = (body.documento_emitente || '').replace(/\D/g, '')
    const nomeEmitente = body.nome_emitente || ''
    const chaveAcesso  = body.chave_nfe || ''
    const valorTotal   = parseFloat(body.valor_total || '0')
    const dataEmissao  = body.data_emissao || new Date().toISOString()

    // Extrai número e série da chave (posições 25-34 = número, 22-24 = série)
    const numero = chaveAcesso.length === 44 ? chaveAcesso.substring(25, 34).replace(/^0+/, '') : '0'
    const serie  = chaveAcesso.length === 44 ? chaveAcesso.substring(22, 25) : '1'

    if (!chaveAcesso) {
      return new Response(JSON.stringify({ error: 'chave_nfe ausente' }), { status: 400 })
    }

    // ── Cabeçalho da NF-e: cria se for novo, ou reaproveita se já existe ──
    // O webhook pode disparar mais de uma vez para a mesma chave (resumo e, depois,
    // quando o XML completo fica pronto). Por isso NÃO ignoramos duplicata: buscamos
    // a nota existente e seguimos para tentar gravar os itens.
    let nfe: { id: string } | null = null

    const { data: nfeNova, error: nfeErr } = await supabase
      .from('nfe_recebidas')
      .insert({
        tenant_id:     TENANT_ID,
        loja_id:       LOJA_ID,
        numero,
        serie,
        chave_acesso:  chaveAcesso,
        cnpj_emitente: cnpjEmitente,
        nome_emitente: nomeEmitente,
        data_emissao:  dataEmissao,
        valor_total:   valorTotal,
        status:        'em_transito',
        fonte:         'webhook',
      })
      .select('id')
      .single()

    if (nfeErr) {
      if (nfeErr.code === '23505') {
        // Já existe: recupera o id para processar os itens neste disparo
        const { data: existente } = await supabase
          .from('nfe_recebidas')
          .select('id')
          .eq('chave_acesso', chaveAcesso)
          .single()
        nfe = existente
        console.log('NF-e já existia, reprocessando itens. id:', nfe?.id)
      } else {
        throw nfeErr
      }
    } else {
      nfe = nfeNova
      console.log('NF-e salva, id:', nfe.id)
    }

    if (!nfe) throw new Error('Não foi possível obter o id da NF-e')

    // ── Se os itens já foram gravados antes, não duplica ──
    const { count: itensExistentes } = await supabase
      .from('nfe_itens')
      .select('id', { count: 'exact', head: true })
      .eq('nfe_id', nfe.id)

    if (itensExistentes && itensExistentes > 0) {
      console.log('Itens já gravados anteriormente, nada a fazer.')
      return new Response(JSON.stringify({ ok: true, nfe_id: nfe.id, msg: 'itens ja existem' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ── 1) Manifesta ciência (libera o XML completo na SEFAZ) ──
    await manifestarCiencia(chaveAcesso)

    // ── 2) Busca a NF-e completa com itens ──
    const nfeCompleta = await fetchNfeCompleta(chaveAcesso)

    // ── 2b) Descobre a LOJA pelo CNPJ do destinatário (a filial que recebeu a nota) ──
    // Robusto: em vez de depender do nome do campo do Focus, casa o CNPJ de cada loja
    // do tenant dentro do JSON da nota. O CNPJ do emitente é do fornecedor (não bate com
    // nenhuma loja), então só o destinatário (a filial) casa. Só roda se ainda não veio
    // loja pela URL (?loja=) e se o XML completo já chegou.
    let lojaFinal = LOJA_ID
    if (!lojaFinal && nfeCompleta) {
      try {
        const { data: lojasTenant } = await supabase
          .from('lojas')
          .select('id,cnpj')
          .eq('tenant_id', TENANT_ID)
        const rawJson = JSON.stringify(nfeCompleta)
        for (const l of lojasTenant || []) {
          const cnpjDigits = String(l.cnpj || '').replace(/\D/g, '')
          if (cnpjDigits.length === 14 && rawJson.includes(cnpjDigits)) { lojaFinal = l.id; break }
        }
        if (lojaFinal) {
          await supabase.from('nfe_recebidas').update({ loja_id: lojaFinal }).eq('id', nfe.id)
          console.log('Loja descoberta pelo CNPJ do destinatário:', lojaFinal)
        } else {
          console.log('Nenhuma loja casou pelo CNPJ do destinatário (verificar cadastro de CNPJ das lojas).')
        }
      } catch (e) {
        console.error('Erro ao descobrir loja pelo destinatário:', (e as Error).message)
      }
    }

    // ── 2c) Data de vencimento + valor do título (duplicatas da nota) ──
    if (nfeCompleta) {
      const venc = extrairVencimento(nfeCompleta)
      if (venc.data_vencimento) {
        await supabase.from('nfe_recebidas')
          .update({ data_vencimento: venc.data_vencimento, valor_titulo: venc.valor_titulo })
          .eq('id', nfe.id)
        console.log('Vencimento gravado:', venc.data_vencimento, '| valor titulo:', venc.valor_titulo)
      }
    }

    // ── 3) Itens ficam em requisicao_nota_fiscal.itens ──
    const itensNfe = nfeCompleta?.requisicao_nota_fiscal?.itens || []
    console.log('Itens encontrados:', itensNfe.length)

    if (itensNfe.length > 0) {
      const { data: vincExist } = await supabase
        .from('insumo_fornecedores')
        .select('id,codigo_fornecedor,insumo_id,qtd_por_embalagem,fornecedor_id')
        .eq('tenant_id', TENANT_ID)

      // Fornecedor da nota pelo CNPJ do emitente. SÓ auto-vincula se o vínculo for DESSE fornecedor:
      // casar só pelo código amarra errado (códigos genéricos 2000000000xxx colidem entre fornecedores).
      const cnpjEmitDigits = (cnpjEmitente || '').replace(/\D/g, '')
      let fornNotaId: string | null = null
      if (cnpjEmitDigits) {
        const { data: fdata } = await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', TENANT_ID)
        fornNotaId = (fdata || []).find((f: any) => String(f.cnpj || '').replace(/\D/g, '') === cnpjEmitDigits)?.id || null
      }

      const itensBatch = itensNfe.map((item: any) => {
        const codigo = String(item.codigo_produto || '')
        const vinc   = fornNotaId ? vincExist?.find((v: any) => v.codigo_fornecedor === codigo && v.fornecedor_id === fornNotaId) : null
        return {
          nfe_id:                 nfe!.id,
          tenant_id:              TENANT_ID,
          descricao_nfe:          String(item.descricao || '').toUpperCase(),
          codigo_item_fornecedor: codigo,
          quantidade:             parseFloat(item.quantidade_comercial || '0'),
          unidade_nfe:            String(item.unidade_comercial || 'UN').toUpperCase(),
          valor_unitario:         parseFloat(item.valor_unitario_comercial || '0'),
          valor_total:            valTotalItem(item),
          vinculacao_id:          vinc?.id || null,
        }
      })

      // Grava os itens. 23505 = índice único ux_nfe_itens_dedup bloqueou duplicata
      // (outra execução já gravou) → NÃO é erro; segue para a reconciliação abaixo.
      const { error: itensErr } = await supabase.from('nfe_itens').insert(itensBatch)
      if (itensErr && itensErr.code !== '23505') {
        console.error('ERRO ao inserir nfe_itens:', JSON.stringify(itensErr))
        console.error('Item de exemplo que tentou inserir:', JSON.stringify(itensBatch[0]))
        // Marca como erro de verdade (não finge que vinculou) para não perder o rastro
        await supabase.from('nfe_recebidas').update({ status: 'com_erro' }).eq('id', nfe.id)
        return new Response(JSON.stringify({ ok: false, erro: 'falha ao gravar itens', detalhe: itensErr.message || itensErr }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        })
      }
    } else {
      // XML completo ainda não disponível (só o resumo). O Focus dispara o webhook de novo quando ficar pronto.
      console.log('Itens ainda indisponíveis (resumo). Aguardando próximo disparo do webhook.')
    }

    // ── Reconcilia o status com a quantidade REAL de itens gravados ──
    // Blinda contra o estado quebrado "aguardando vínculo / com erro" SEM nenhum item:
    // sem item persistido = ainda esperando o XML (em_transito), nunca vermelho. Vale para
    // qualquer caminho (inserção ok, duplicata bloqueada, ou resumo sem itens).
    const { count: itensReais } = await supabase
      .from('nfe_itens').select('id', { count: 'exact', head: true }).eq('nfe_id', nfe.id)
    let statusFinal = 'em_transito'
    if (itensReais && itensReais > 0) {
      const { data: itensDb } = await supabase.from('nfe_itens').select('vinculacao_id').eq('nfe_id', nfe.id)
      const semVinc = (itensDb || []).filter((i: any) => !i.vinculacao_id).length
      statusFinal = semVinc === 0 ? 'pronta' : 'aguard_vinculacao'
    }
    await supabase.from('nfe_recebidas').update({ status: statusFinal }).eq('id', nfe.id)
    console.log('Status reconciliado:', statusFinal, '| itens reais:', itensReais)

    return new Response(JSON.stringify({ ok: true, nfe_id: nfe.id }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Webhook error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})
