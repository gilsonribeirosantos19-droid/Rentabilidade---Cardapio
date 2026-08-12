// DANFE — portado FIEL do utils.js (imprimirDanfe via Focus + gerarDanfeAiko/abrirDanfeAiko interno).
import { supabase } from './supabase'

const NFE_WEBHOOK = 'https://trczpnjidqfippbfxtpe.supabase.co/functions/v1/nfe-webhook'
const esc = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cabeçalhos p/ o webhook: envia o token de login (o webhook confirma, via RLS, que a
// chave é do tenant do usuário antes de devolver a nota completa/DANFE). Sem isto o modo
// completa/danfe responde 401.
async function webhookHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  try { const { data } = await supabase.auth.getSession(); const tk = data.session?.access_token; if (tk) h['Authorization'] = 'Bearer ' + tk } catch { /* sem sessão */ }
  return h
}

// "Imprimir DANFE" — PDF oficial do Focus
export async function imprimirDanfe(chave: string, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  if (!chave) { onMsg('Nota sem chave de acesso.', 'err'); return }
  onMsg('Gerando DANFE…', 'ok')
  try {
    const r = await fetch(NFE_WEBHOOK, { method: 'POST', headers: await webhookHeaders(), body: JSON.stringify({ danfe: true, chave }) })
    const j = await r.json()
    if (j && j.ok && j.url) window.open(j.url, '_blank')
    else onMsg('DANFE indisponível para esta nota (o Focus não tem o PDF dela).', 'err')
  } catch (e: any) { onMsg('Erro ao gerar DANFE: ' + (e && e.message || e), 'err') }
}

// "Ver DANFE" — espelho INTERNO (padrão Aiko) gerado a partir da nota completa do Focus
export async function gerarDanfeAiko(chave: string, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  if (!chave) { onMsg('Nota sem chave de acesso.', 'err'); return }
  onMsg('Gerando…', 'ok')
  try {
    const r = await fetch(NFE_WEBHOOK, { method: 'POST', headers: await webhookHeaders(), body: JSON.stringify({ completa: true, chave }) })
    const j = await r.json()
    if (j && j.ok && j.nota && j.nota.requisicao_nota_fiscal) abrirDanfeAiko(j.nota, onMsg)
    else onMsg('Nota completa indisponível no Focus para gerar o DANFE.', 'err')
  } catch (e: any) { onMsg('Erro ao gerar DANFE: ' + (e && e.message || e), 'err') }
}

// "Ver DANFE" a partir da NOSSA base (nfe_recebidas + nfe_itens) — funciona pra QUALQUER nota
// (Focus ou SIEG), sem depender do Focus ter o PDF. É um espelho interno com o que temos guardado.
export function gerarDanfeLocal(nfe: any, itens: any[], onMsg: (m: string, t?: 'ok' | 'err') => void) {
  if (!nfe) { onMsg('Nota não encontrada.', 'err'); return }
  const E = (s: any) => esc(s == null ? '' : String(s))
  const v2 = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const vu = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const qt = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const docf = (v: any) => { const s = String(v || '').replace(/\D/g, ''); if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); return v ? String(v) : '—' }
  const dtm = (v: any) => { if (!v) return '—'; const s = String(v); const d = s.slice(0, 10).split('-'); const hm = s.slice(11, 16); return (d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s) + (hm ? ` ${hm}` : '') }
  const chaveF = (c: any) => String(c || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  const its = Array.isArray(itens) ? itens : []
  const totalItens = its.reduce((a, it) => a + Number(it.valor_total || 0), 0)
  const linhas = its.map((it: any) => `<tr><td class="mono">${E(it.codigo_item_fornecedor)}</td><td class="pdesc">${E(it.descricao_nfe)}</td><td class="c">${E((it.unidade_nfe || '').toUpperCase())}</td><td class="r">${qt(it.quantidade)}</td><td class="r">${vu(it.valor_unitario)}</td><td class="r">${v2(it.valor_total)}</td></tr>`).join('')

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;background:#64748b;padding:18px;color:#000}
    .toolbar{max-width:900px;margin:0 auto 12px;display:flex;gap:10px;align-items:center;color:#fff}
    .toolbar .h{font-size:14px;font-weight:700;flex:1}
    .btn{background:#f97316;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .danfe{max-width:900px;margin:0 auto;background:#fff;padding:14px}
    .topo{display:flex;border:1px solid #000}
    .emit{flex:2;padding:12px;border-right:1px solid #000}
    .emit .nome{font-size:15px;font-weight:800;margin-bottom:3px}.emit .l{font-size:10px;color:#333}
    .dbox{flex:1;padding:9px;text-align:center;border-right:1px solid #000}
    .dbox .t{font-size:20px;font-weight:800;letter-spacing:1px}.dbox .s{font-size:8px}.dbox .es{font-size:10px;font-weight:700;margin-top:5px}
    .barra{flex:1.4;padding:9px}
    .bars{height:34px;background:repeating-linear-gradient(90deg,#000 0 1.5px,#fff 1.5px 3px,#000 3px 5px,#fff 5px 7px);margin-bottom:4px}
    .lbl{font-size:8px;color:#333;text-transform:uppercase;display:block;margin-bottom:1px}.center{text-align:center}
    .chave{font-size:11px;font-family:monospace;word-break:break-all;text-align:center;font-weight:700}
    .row{display:flex;border:1px solid #000;border-top:none}
    .cell{padding:4px 8px;flex:1;border-right:1px solid #000}.cell:last-child{border-right:none}
    .val{font-size:12px;font-weight:600}
    .sec{font-size:9px;font-weight:700;text-transform:uppercase;padding:4px 8px;margin-top:8px;background:#f3f4f6;border:1px solid #000}
    table{width:100%;border-collapse:collapse;margin-top:-1px}
    th,td{border:1px solid #000;padding:4px 6px;font-size:10px}
    th{background:#eee;font-size:8px;text-transform:uppercase}
    td.r,th.r{text-align:right}td.c,th.c{text-align:center}.mono{font-family:monospace;font-size:9px;color:#333}
    .pdesc{text-align:left}
    tfoot td{font-weight:700;background:#f8fafc}
    .foot{margin-top:10px;font-size:9.5px;color:#333;border:1px dashed #999;padding:8px}
    @page{size:A4;margin:9mm}
    @media print{body{background:#fff;padding:0}.toolbar{display:none}.danfe{max-width:100%;padding:0}}
  `
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE ${E(nfe.numero)} - ${E(nfe.nome_emitente)}</title><style>${css}</style></head><body>
    <div class="toolbar"><div class="h">DANFE padrão Aiko — Nº ${E(nfe.numero)} · ${E(nfe.nome_emitente)} (espelho interno)</div><button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
    <div class="danfe">
      <div class="topo">
        <div class="emit"><div class="nome">${E(nfe.nome_emitente || '—')}</div><div class="l">CNPJ ${E(docf(nfe.cnpj_emitente))}</div></div>
        <div class="dbox"><div class="t">DANFE</div><div class="s">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div><div class="es">0 - ENTRADA</div><div style="font-weight:700;margin-top:5px">Nº ${E(nfe.numero || '—')}<br>Série ${E(nfe.serie || '1')}</div></div>
        <div class="barra"><div class="bars"></div><div class="lbl center">Chave de acesso</div><div class="chave">${E(chaveF(nfe.chave_acesso))}</div><div class="lbl center" style="margin-top:3px">Consulte pela chave em www.nfe.fazenda.gov.br</div></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Emissão</span><span class="val">${E(dtm(nfe.data_emissao))}</span></div>
        <div class="cell"><span class="lbl">Processada no estoque</span><span class="val">${E(dtm(nfe.processada_em))}</span></div>
        <div class="cell"><span class="lbl">Valor total da nota</span><span class="val">R$ ${v2(nfe.valor_total)}</span></div>
      </div>
      <div class="sec">Produtos / Itens da Nota (${its.length})</div>
      <table>
        <thead><tr><th style="width:80px">Cód.</th><th class="pdesc">Descrição</th><th class="c">Un.</th><th class="r">Qtd.</th><th class="r">V. Unit.</th><th class="r">V. Total</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="6" class="c">Sem itens.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5" class="r">TOTAL</td><td class="r">${v2(totalItens)}</td></tr></tfoot>
      </table>
      <div class="foot"><b>Espelho interno gerado pelo Aiko</b> a partir dos dados capturados da NF-e. Para fins fiscais, vale o DANFE oficial da SEFAZ (consulta pela chave de acesso).</div>
    </div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { onMsg('Permita pop-ups para abrir o DANFE.', 'err'); return }
  w.document.write(html); w.document.close()
}

// "Imprimir DANFE" = a NOTA ORIGINAL. Ordem: (1) XML guardado (SIEG) → DANFE oficial completa;
// (2) PDF do Focus (notas antigas); (3) espelho interno. Nunca dá erro/beco sem saída.
export async function imprimirDanfeOuLocal(nfe: any, itens: any[], xml: string | null | undefined, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  if (xml) { gerarDanfeXml(xml, onMsg); return } // temos a nota original → DANFE oficial do XML
  const chave = nfe?.chave_acesso
  if (chave) {
    onMsg('Buscando DANFE oficial…', 'ok')
    try {
      const r = await fetch(NFE_WEBHOOK, { method: 'POST', headers: await webhookHeaders(), body: JSON.stringify({ danfe: true, chave }) })
      const j = await r.json()
      if (j && j.ok && j.url) { window.open(j.url, '_blank'); return }
    } catch { /* cai no espelho */ }
  }
  onMsg('Nota original ainda não capturada — abrindo o espelho interno (imprimível).', 'ok')
  gerarDanfeLocal(nfe, itens, onMsg)
}

// abre um PDF (base64) numa aba nova
function abrePdfBase64(b64: string, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const w = window.open(url, '_blank')
    if (!w) { onMsg('Permita pop-ups para abrir a DANFE.', 'err'); return }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (e: any) { onMsg('Erro ao abrir o PDF: ' + (e && e.message || e), 'err') }
}

// "Imprimir DANFE" = a DANFE completa gerada do XML autêntico da nota (todos os campos fiscais).
// Se a nota ainda não tem XML capturado, cai no espelho interno. Não depende de serviço externo.
export function imprimirDanfeOficial(nfe: any, itens: any[], xml: string | null | undefined, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  if (xml) { gerarDanfeXml(xml, onMsg); return }
  gerarDanfeLocal(nfe, itens, onMsg)
}

// Baixa o XML original da nota (arquivo .xml) — a "nota original" de verdade.
export function baixarXml(xml: string, nomeArquivo: string) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nomeArquivo.endsWith('.xml') ? nomeArquivo : nomeArquivo + '.xml'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// DANFE OFICIAL a partir do XML guardado — lê o XML da NF-e e reaproveita o layout completo (abrirDanfeAiko).
export function gerarDanfeXml(xml: string, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido')
    const first = (root: Element | Document | null, tag: string): Element | null => ((root || doc).getElementsByTagName(tag)[0] || null)
    const g = (root: Element | Document | null, tag: string): string => { const el = first(root, tag); return el ? (el.textContent || '').trim() : '' }
    const infNFe = first(doc, 'infNFe')
    const ide = first(doc, 'ide'), emit = first(doc, 'emit'), dest = first(doc, 'dest')
    const enderEmit = first(emit, 'enderEmit'), enderDest = first(dest, 'enderDest')
    const tot = first(doc, 'ICMSTot'), transp = first(doc, 'transp'), vol = first(transp, 'vol')
    const cobr = first(doc, 'cobr'), fat = first(cobr, 'fat'), infAdic = first(doc, 'infAdic'), infProt = first(doc, 'infProt')
    const chave = String(infNFe?.getAttribute('Id') || '').replace(/\D/g, '').slice(-44)
    const dups = Array.from(cobr?.getElementsByTagName('dup') || []).map((d) => ({ numero: g(d, 'nDup'), data_vencimento: g(d, 'dVenc'), valor: g(d, 'vDup') }))
    const itens = Array.from(doc.getElementsByTagName('det')).map((d) => {
      const prod = first(d, 'prod'), icms = first(d, 'ICMS')
      return {
        codigo_produto: g(prod, 'cProd'), descricao: g(prod, 'xProd'), codigo_ncm: g(prod, 'NCM'), cfop: g(prod, 'CFOP'),
        unidade_comercial: g(prod, 'uCom'), quantidade_comercial: g(prod, 'qCom'), valor_unitario_comercial: g(prod, 'vUnCom'), valor_bruto: g(prod, 'vProd'),
        icms_origem: g(icms, 'orig'), icms_situacao_tributaria: g(icms, 'CST') || g(icms, 'CSOSN'),
      }
    })
    const req = {
      numero: g(ide, 'nNF'), serie: g(ide, 'serie'), natureza_operacao: g(ide, 'natOp'), data_emissao: g(ide, 'dhEmi') || g(ide, 'dEmi'), tipo_documento: g(ide, 'tpNF'),
      nome_emitente: g(emit, 'xNome'), cnpj_emitente: g(emit, 'CNPJ'), inscricao_estadual_emitente: g(emit, 'IE'),
      logradouro_emitente: g(enderEmit, 'xLgr'), numero_emitente: g(enderEmit, 'nro'), complemento_emitente: g(enderEmit, 'xCpl'), bairro_emitente: g(enderEmit, 'xBairro'), municipio_emitente: g(enderEmit, 'xMun'), uf_emitente: g(enderEmit, 'UF'), cep_emitente: g(enderEmit, 'CEP'), telefone_emitente: g(enderEmit, 'fone'),
      nome_destinatario: g(dest, 'xNome'), cnpj_destinatario: g(dest, 'CNPJ') || g(dest, 'CPF'), inscricao_estadual_destinatario: g(dest, 'IE'),
      logradouro_destinatario: g(enderDest, 'xLgr'), numero_destinatario: g(enderDest, 'nro'), complemento_destinatario: g(enderDest, 'xCpl'), bairro_destinatario: g(enderDest, 'xBairro'), municipio_destinatario: g(enderDest, 'xMun'), uf_destinatario: g(enderDest, 'UF'), cep_destinatario: g(enderDest, 'CEP'),
      numero_fatura: g(fat, 'nFat'), valor_original_fatura: g(fat, 'vOrig'), valor_desconto_fatura: g(fat, 'vDesc'), valor_liquido_fatura: g(fat, 'vLiq'), duplicatas: dups,
      icms_base_calculo: g(tot, 'vBC'), icms_valor_total: g(tot, 'vICMS'), icms_base_calculo_st: g(tot, 'vBCST'), icms_valor_total_st: g(tot, 'vST'), valor_frete: g(tot, 'vFrete'), valor_seguro: g(tot, 'vSeg'), valor_produtos: g(tot, 'vProd'), valor_desconto: g(tot, 'vDesc'), valor_outras_despesas: g(tot, 'vOutro'), valor_ipi: g(tot, 'vIPI'), valor_pis: g(tot, 'vPIS'), valor_cofins: g(tot, 'vCOFINS'), valor_total: g(tot, 'vNF'),
      modalidade_frete: g(transp, 'modFrete'), volumes: vol ? [{ quantidade: g(vol, 'qVol'), especie: g(vol, 'esp'), peso_bruto: g(vol, 'pesoB'), peso_liquido: g(vol, 'pesoL') }] : [],
      informacoes_adicionais_contribuinte: g(infAdic, 'infCpl'), observacoes_contribuinte: g(infAdic, 'obsCont'), chave_nfe: chave, itens,
    }
    const nota = { requisicao_nota_fiscal: req, protocolo_nota_fiscal: infProt ? { numero_protocolo: g(infProt, 'nProt'), data_recebimento: g(infProt, 'dhRecbto') } : null, chave_nfe: chave, valor_total: g(tot, 'vNF') }
    abrirDanfeAiko(nota, onMsg)
  } catch (e: any) { onMsg('Erro ao ler o XML da nota: ' + (e && e.message || e), 'err') }
}

function abrirDanfeAiko(nota: any, onMsg: (m: string, t?: 'ok' | 'err') => void) {
  const req = nota.requisicao_nota_fiscal || {}
  const its = req.itens || []
  const E = (s: any) => esc(s == null ? '' : String(s))
  const v2 = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const vu = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const qt = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  const docf = (v: any) => { const s = String(v || '').replace(/\D/g, ''); if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); return v ? String(v) : '—' }
  const dt = (v: any) => { if (!v) return ''; const s = String(v).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(v) }
  const cepf = (v: any) => { const s = String(v || '').replace(/\D/g, ''); return s.length === 8 ? s.replace(/(\d{5})(\d{3})/, '$1-$2') : (v || '') }
  const chaveF = (c: any) => String(c || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  const FRETE: Record<string, string> = { '0': '0 - Emitente', '1': '1 - Destinatário', '2': '2 - Terceiros', '3': '3 - Próprio (Rem.)', '4': '4 - Próprio (Dest.)', '9': '9 - Sem Frete' }
  const vol = (req.volumes && req.volumes[0]) || {}
  const dups = Array.isArray(req.duplicatas) ? req.duplicatas : (req.duplicatas ? [req.duplicatas] : [])
  const tipo = String(req.tipo_documento) === '0' ? '0 - ENTRADA' : '1 - SAÍDA'
  const endE = [req.logradouro_emitente, req.numero_emitente, req.complemento_emitente, req.bairro_emitente].filter(Boolean).join(', ')
  const endD = [req.logradouro_destinatario, req.numero_destinatario, req.complemento_destinatario].filter(Boolean).join(', ')
  const pr = nota.protocolo_nota_fiscal
  const protTxt = (pr && typeof pr === 'object') ? `${pr.numero_protocolo || ''}${pr.data_recebimento ? ' - ' + dt(pr.data_recebimento) + ' ' + String(pr.data_recebimento).slice(11, 19) : ''}`.trim() : (pr || '—')

  const linhas = its.map((it: any) => {
    const cst = String(it.icms_origem || '') + String(it.icms_situacao_tributaria || '')
    return `<tr><td>${E(it.codigo_produto)}</td><td class="pdesc">${E(it.descricao)}</td><td class="c">${E(it.codigo_ncm)}</td><td class="c">${E(cst)}</td><td class="c">${E(it.cfop)}</td><td class="c">${E(it.unidade_comercial)}</td><td class="r">${qt(it.quantidade_comercial)}</td><td class="r">${vu(it.valor_unitario_comercial)}</td><td class="r">0,00</td><td class="r">${v2(it.valor_bruto)}</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="c">0,00</td><td class="c">0,00</td></tr>`
  }).join('')
  const dupTxt = dups.length ? dups.map((d: any) => `${E(d.numero || '')} · venc ${dt(d.data_vencimento)} · R$ ${v2(d.valor)}`).join(' &nbsp;|&nbsp; ') : '—'

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{font-family:Arial,Helvetica,sans-serif;background:#64748b;padding:18px;color:#000}
    .toolbar{max-width:1000px;margin:0 auto 12px;display:flex;gap:10px;align-items:center;color:#fff}
    .toolbar .h{font-size:14px;font-weight:700;flex:1}
    .btn{background:#f97316;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .danfe{max-width:1000px;margin:0 auto;background:#fff;padding:10px;font-size:10px;line-height:1.35;color:#000}
    .bx{border:1px solid #000}.row{display:flex}
    .cell{border:1px solid #000;padding:3px 7px;flex:1;min-width:0}
    .lbl{font-size:7.5px;color:#333;text-transform:uppercase;display:block;margin-bottom:1px}
    .val{font-size:11px;font-weight:600}.b{font-weight:700}.center{text-align:center}
    .sec{font-size:8.5px;font-weight:700;text-transform:uppercase;padding:3px 7px;margin-top:5px;background:#f3f4f6}
    .receb{display:flex;border:1px solid #000;font-size:9px}.receb>div{padding:5px 7px;border-right:1px solid #000}
    .receb .canhoto{width:58%}.receb .sig{flex:1}.receb .nf{width:96px;border-right:none;text-align:center}
    .tracejado{border-top:1px dashed #000;margin:4px 0}
    .topo{display:flex}.emit{flex:2;border:1px solid #000;padding:10px;text-align:center}
    .emit .nome{font-size:15px;font-weight:800;margin-bottom:4px}
    .dbox{flex:1.05;border:1px solid #000;border-left:none;padding:7px;text-align:center}
    .dbox .t{font-size:19px;font-weight:800;letter-spacing:1px}.dbox .s{font-size:7.5px}.dbox .es{font-size:9.5px;margin-top:4px}
    .barra{flex:1.5;border:1px solid #000;border-left:none;padding:7px}
    .bars{height:36px;background:repeating-linear-gradient(90deg,#000 0 1.5px,#fff 1.5px 3px,#000 3px 5px,#fff 5px 7px);margin-bottom:4px}
    .chave{font-size:10.5px;font-family:monospace;word-break:break-all;text-align:center;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:3px}
    th,td{border:1px solid #000;padding:3px 4px;font-size:9px}
    th{background:#eee;font-size:7.5px;text-transform:uppercase}
    td.r,th.r{text-align:right}td.c,th.c{text-align:center}
    .prodtbl th,.prodtbl td{font-size:7.6px;padding:2px 3px;white-space:nowrap}
    .prodtbl th{font-size:6.8px}
    .prodtbl .pdesc{min-width:240px;white-space:normal;text-align:left}
    .dados-add{margin-top:8px}
    @page{size:A4;margin:8mm}
    @media print{html,body{height:auto}body{background:#fff;padding:0}.toolbar{display:none}.danfe{max-width:100%;padding:0 0 86px}.dados-add{position:fixed;left:0;right:0;bottom:0;background:#fff;margin:0}}
  `

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE ${E(req.numero)} - ${E(req.nome_emitente)}</title><style>${css}</style></head><body>
    <div class="toolbar"><div class="h">DANFE padrão Aiko — Nº ${E(req.numero)} · ${E(req.nome_emitente)} (documento interno)</div><button class="btn" onclick="window.print()">🖨️ Imprimir</button></div>
    <div class="danfe">
      <div class="receb">
        <div class="canhoto"><span class="lbl">Recebemos de ${E(req.nome_emitente)} os produtos constantes da Nota Fiscal indicada ao lado</span></div>
        <div class="sig"><span class="lbl">Data de recebimento</span><br><span class="lbl">Identificação e assinatura do recebedor</span></div>
        <div class="nf"><b>NF-e</b><br>Nº ${E(req.numero)}<br>Série ${E(req.serie)}</div>
      </div>
      <div class="tracejado"></div>
      <div class="topo">
        <div class="emit">
          <div class="nome">${E(req.nome_emitente)}</div>
          <div>${E(endE)}<br>${E(req.municipio_emitente)} / ${E(req.uf_emitente)} — CEP ${E(cepf(req.cep_emitente))}<br>Fone: ${E(req.telefone_emitente || '—')}</div>
        </div>
        <div class="dbox">
          <div class="t">DANFE</div><div class="s">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div>
          <div class="es">${E(tipo)}</div>
          <div class="b" style="margin-top:4px">Nº ${E(req.numero)}<br>Série ${E(req.serie)}</div>
        </div>
        <div class="barra">
          <div class="bars"></div>
          <div class="lbl center">Chave de acesso</div>
          <div class="chave">${E(chaveF(req.chave_nfe || nota.chave_nfe))}</div>
          <div class="lbl center" style="margin-top:3px">Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br) ou no site da Sefaz</div>
        </div>
      </div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Natureza da operação</span><span class="val">${E(req.natureza_operacao)}</span></div>
        <div class="cell" style="flex:1.6"><span class="lbl">Protocolo de autorização de uso</span><span class="val">${E(protTxt)}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">${E(req.inscricao_estadual_emitente || '—')}</span></div>
        <div class="cell"><span class="lbl">CNPJ Emitente</span><span class="val">${E(docf(req.cnpj_emitente))}</span></div>
      </div>
      <div class="sec">Destinatário / Remetente</div>
      <div class="row">
        <div class="cell" style="flex:2.4"><span class="lbl">Nome / Razão Social</span><span class="val">${E(req.nome_destinatario)}</span></div>
        <div class="cell"><span class="lbl">CNPJ / CPF</span><span class="val">${E(docf(req.cnpj_destinatario || nota.cnpj_destinatario || nota.cpf_destinatario))}</span></div>
        <div class="cell"><span class="lbl">Data da Emissão</span><span class="val">${E(dt(req.data_emissao || nota.data_emissao))}</span></div>
      </div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Endereço</span><span class="val">${E(endD)}</span></div>
        <div class="cell"><span class="lbl">Bairro</span><span class="val">${E(req.bairro_destinatario || '—')}</span></div>
        <div class="cell"><span class="lbl">CEP</span><span class="val">${E(cepf(req.cep_destinatario))}</span></div>
        <div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">${E(req.inscricao_estadual_destinatario || '—')}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Município</span><span class="val">${E(req.municipio_destinatario)}</span></div>
        <div class="cell"><span class="lbl">UF</span><span class="val">${E(req.uf_destinatario)}</span></div>
      </div>
      <div class="sec">Fatura / Duplicatas</div>
      <div class="row">
        <div class="cell"><span class="lbl">Nº Fatura</span><span class="val">${E(req.numero_fatura || '—')}</span></div>
        <div class="cell"><span class="lbl">Valor Original</span><span class="val">${v2(req.valor_original_fatura)}</span></div>
        <div class="cell"><span class="lbl">Valor Desconto</span><span class="val">${v2(req.valor_desconto_fatura)}</span></div>
        <div class="cell"><span class="lbl">Valor Líquido</span><span class="val">${v2(req.valor_liquido_fatura)}</span></div>
        <div class="cell" style="flex:2"><span class="lbl">Duplicatas</span><span class="val">${dupTxt}</span></div>
      </div>
      <div class="sec">Cálculo do Imposto</div>
      <div class="row">
        <div class="cell"><span class="lbl">Base ICMS</span><span class="val">${v2(req.icms_base_calculo)}</span></div>
        <div class="cell"><span class="lbl">Valor ICMS</span><span class="val">${v2(req.icms_valor_total)}</span></div>
        <div class="cell"><span class="lbl">Base ICMS ST</span><span class="val">${v2(req.icms_base_calculo_st)}</span></div>
        <div class="cell"><span class="lbl">Valor ICMS ST</span><span class="val">${v2(req.icms_valor_total_st)}</span></div>
        <div class="cell"><span class="lbl">Valor Frete</span><span class="val">${v2(req.valor_frete)}</span></div>
        <div class="cell"><span class="lbl">Valor Seguro</span><span class="val">${v2(req.valor_seguro)}</span></div>
        <div class="cell"><span class="lbl">Total Produtos</span><span class="val">${v2(req.valor_produtos)}</span></div>
      </div>
      <div class="row">
        <div class="cell"><span class="lbl">Desconto</span><span class="val">${v2(req.valor_desconto)}</span></div>
        <div class="cell"><span class="lbl">Outras Despesas</span><span class="val">${v2(req.valor_outras_despesas)}</span></div>
        <div class="cell"><span class="lbl">Valor IPI</span><span class="val">${v2(req.valor_ipi)}</span></div>
        <div class="cell"><span class="lbl">Valor PIS</span><span class="val">${v2(req.valor_pis)}</span></div>
        <div class="cell"><span class="lbl">Valor COFINS</span><span class="val">${v2(req.valor_cofins)}</span></div>
        <div class="cell" style="background:#f3f4f6;flex:2"><span class="lbl">Valor Total da Nota</span><span class="val b" style="font-size:11px">${v2(req.valor_total || nota.valor_total)}</span></div>
      </div>
      <div class="sec">Transportador / Volumes</div>
      <div class="row">
        <div class="cell" style="flex:2"><span class="lbl">Modalidade do Frete</span><span class="val">${E(FRETE[String(req.modalidade_frete)] || req.modalidade_frete || '—')}</span></div>
        <div class="cell"><span class="lbl">Qtd. Volumes</span><span class="val">${E(vol.quantidade || '—')}</span></div>
        <div class="cell"><span class="lbl">Espécie</span><span class="val">${E(vol.especie || '—')}</span></div>
        <div class="cell"><span class="lbl">Peso Bruto</span><span class="val">${E(vol.peso_bruto || '0,000')}</span></div>
        <div class="cell"><span class="lbl">Peso Líquido</span><span class="val">${E(vol.peso_liquido || '0,000')}</span></div>
      </div>
      <div class="sec">Dados dos Produtos / Serviços</div>
      <table class="prodtbl">
        <thead>
          <tr>
            <th rowspan="2" style="width:70px">Cód. Prod.</th>
            <th rowspan="2" class="pdesc">Descrição do Produto / Serviço</th>
            <th rowspan="2" class="c">NCM/SH</th><th rowspan="2" class="c">CST</th><th rowspan="2" class="c">CFOP</th>
            <th rowspan="2" class="c">Un.</th><th rowspan="2" class="r">Quant.</th><th rowspan="2" class="r">Valor Unitário</th>
            <th rowspan="2" class="r">Valor Desconto</th><th rowspan="2" class="r">Valor Total</th>
            <th rowspan="2" class="r">B. Cálc. ICMS</th><th rowspan="2" class="r">B. Cálc. ICMS ST</th>
            <th rowspan="2" class="r">Valor ICMS</th><th rowspan="2" class="r">Valor ICMS ST</th><th rowspan="2" class="r">Valor IPI</th>
            <th colspan="2" class="c">Alíquota %</th>
          </tr>
          <tr><th class="c">ICMS</th><th class="c">IPI</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="dados-add">
        <div class="sec">Dados Adicionais</div>
        <div class="bx" style="padding:8px;min-height:78px;font-size:9.5px;line-height:1.4">${E(req.informacoes_adicionais_contribuinte || req.observacoes_contribuinte || '—')}<br><br><b>Espelho interno gerado pelo Aiko</b> — para fins fiscais, vale o DANFE oficial (SEFAZ).</div>
      </div>
    </div>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) { onMsg('Permita pop-ups para abrir o DANFE.', 'err'); return }
  w.document.write(html); w.document.close()
}
