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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })

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

    // Modo BACKFILL (manual): { "backfill": true, "tenant": "<uuid>" } → carimba loja nas notas antigas
    if (body.backfill === true) {
      return await rodarBackfillLoja(body.tenant || TENANT_ID)
    }

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

    // ── 3) Itens ficam em requisicao_nota_fiscal.itens ──
    const itensNfe = nfeCompleta?.requisicao_nota_fiscal?.itens || []
    console.log('Itens encontrados:', itensNfe.length)

    if (itensNfe.length > 0) {
      const { data: vincExist } = await supabase
        .from('insumo_fornecedores')
        .select('id,codigo_fornecedor,insumo_id,qtd_por_embalagem')
        .eq('tenant_id', TENANT_ID)

      const itensBatch = itensNfe.map((item: any) => {
        const codigo = String(item.codigo_produto || '')
        const vinc   = vincExist?.find(v => v.codigo_fornecedor === codigo)
        return {
          nfe_id:                 nfe!.id,
          tenant_id:              TENANT_ID,
          descricao_nfe:          String(item.descricao || '').toUpperCase(),
          codigo_item_fornecedor: codigo,
          quantidade:             parseFloat(item.quantidade_comercial || '0'),
          unidade_nfe:            String(item.unidade_comercial || 'UN').toUpperCase(),
          valor_unitario:         parseFloat(item.valor_unitario_comercial || '0'),
          valor_total:            parseFloat(item.valor_bruto || '0'),
          vinculacao_id:          vinc?.id || null,
        }
      })

      // Grava os itens E CONFERE se deu certo (antes não conferia → erro silencioso)
      const { error: itensErr } = await supabase.from('nfe_itens').insert(itensBatch)
      if (itensErr) {
        console.error('ERRO ao inserir nfe_itens:', JSON.stringify(itensErr))
        console.error('Item de exemplo que tentou inserir:', JSON.stringify(itensBatch[0]))
        // Marca como erro de verdade (não finge que vinculou) para não perder o rastro
        await supabase.from('nfe_recebidas').update({ status: 'com_erro' }).eq('id', nfe.id)
        return new Response(JSON.stringify({ ok: false, erro: 'falha ao gravar itens', detalhe: itensErr.message || itensErr }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        })
      }

      const semVinc    = itensBatch.filter((i: any) => !i.vinculacao_id).length
      const novoStatus = semVinc === 0 ? 'pronta' : 'aguard_vinculacao'
      await supabase.from('nfe_recebidas').update({ status: novoStatus }).eq('id', nfe.id)
      console.log('Status atualizado:', novoStatus, '- itens sem vínculo:', semVinc)
    } else {
      // XML completo ainda não disponível: mantém em_transito.
      // O Focus dispara o webhook de novo quando o XML ficar pronto.
      console.log('Itens ainda indisponíveis (resumo). Aguardando próximo disparo do webhook.')
      await supabase.from('nfe_recebidas').update({ status: 'em_transito' }).eq('id', nfe.id)
    }

    return new Response(JSON.stringify({ ok: true, nfe_id: nfe.id }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Webhook error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 })
  }
})
