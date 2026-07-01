import { useMemo, useState } from 'react'
import './monitorvendas.css'

// TELA MOCK — dados de exemplo em memória (não usa Supabase).
// CONCEITO (confirmado com o usuário, espelha o Monitor de Transações do Everest):
//  - Esta tela é o MONITOR DE ARQUIVOS de importação do PDV (os .txt exportados).
//  - NÃO mostra faturamento/desconto/valores — isso é a OUTRA tela (Vendas), que lê os arquivos processados.
//  - Cada linha = 1 arquivo, com Situação, Loja, PDV, Tipo, Data do movimento, nome do Arquivo, datas e Visualizar (conteúdo cru).
//  - Erros possíveis: produto SEM CADASTRO e produto SEM FICHA TÉCNICA. Arquivo que não chega = NÃO RECEBIDO (preto).
// Quando o Saipos/iComanda entrar, troca a fonte por uma tabela real, mantendo este layout.

type Situacao = 'com_erros' | 'nao_recebido' | 'aguardando' | 'em_processamento' | 'processado'
type ErroLinha = { erro: string; msg: string }
type Arquivo = {
  id: string; situacao: Situacao; loja: string; pdv: string; tipo: string
  dMovimento: string; arquivo: string; dExecucao: string; dIntegracao: string
  conteudo: string; erros: ErroLinha[]
}

const SIT_META: Record<Situacao, { nome: string; dot: string; pill: string }> = {
  com_erros: { nome: 'Com Erros', dot: '#ef4444', pill: 'p-err' },
  nao_recebido: { nome: 'Não Recebido', dot: '#111827', pill: 'p-naorec' },
  aguardando: { nome: 'Aguardando', dot: '#f59e0b', pill: 'p-pend' },
  em_processamento: { nome: 'Em Processamento', dot: '#3b82f6', pill: 'p-emproc' },
  processado: { nome: 'Processado', dot: '#16a34a', pill: 'p-proc' },
}
const ORDER: Situacao[] = ['com_erros', 'nao_recebido', 'aguardando', 'em_processamento', 'processado']

const CONTEUDO = `R01|20260629|113|113|15939,85|0,00|1358,73|1078,23|15939,85|
R02|1311|GISELE PN|376706|1|18:05|18:05||144,80|0,00|1||
R03|1311|GISELE PN|376706|18:05|3187|035 - COMBO PHILADELFIA|1|0|1|94,9|1|0|0||249|
R03|1311|GISELE PN|376706|18:05|4000|036 - COMBO BUTTERFLY - F. CAMARÃO|1|0|1|49,9|1|0|0||249|
R05|1120|VITORIA PANTOJA|376706|18:14|727|4-PIX|144,8|
R02|1271|JOSIANE PN|376708|2|18:07|18:07||49,48|7,58|1||
R03|1271|JOSIANE PN|376708|18:07|1896|19 - TEMAKI HOT PHILADÉLFIA|1|0|1|75,8|2|33,9|0||249|
R03|1271|JOSIANE PN|376709|18:13|4193|501 - POKE YUME - SALMAO, CAMARAO EMPANADO|1|0|1|105,8|2|0|0||249|
R03|1271|JOSIANE PN|376709|18:13|3392|070 - RODÍZIO DE SUSHI|1|0|1|0|0|0|0||249|
R03|1271|JOSIANE PN|376709|18:13|2554|010 - HOT BOLL|1|0|1|32,9|1|0|0||249|
R05|1120|VITORIA PANTOJA|376709|19:39|687|3-CARTÃO CRÉDITO|545,71|`

const CONTEUDO_OK = `R01|20260628|98|98|13420,50|0,00|1102,00|940,10|13420,50|
R02|1301|MARIA PN|375510|1|19:12|19:12||212,40|0,00|1||
R03|1301|MARIA PN|375510|19:12|3187|035 - COMBO PHILADELFIA|1|0|1|94,9|1|0|0||249|
R05|1120|CAIXA 01|375510|19:40|727|4-PIX|212,4|`

const MOCK: Arquivo[] = [
  { id: 'a1', situacao: 'com_erros', loja: 'Sushi Ponta Negra', pdv: 'iComanda', tipo: 'Venda', dMovimento: '29/06/2026', arquivo: 'EXPORTACAO_ICOMANDA_VENDA_17802332000354_20260629_3433.txt', dExecucao: '29/06 20:15', dIntegracao: '29/06 20:16', conteudo: CONTEUDO, erros: [
    { erro: 'Sem ficha técnica', msg: 'Produto 4193 — POKE YUME - SALMAO, CAMARAO EMPANADO: cadastrado, mas sem ficha técnica.' },
    { erro: 'Sem cadastro', msg: 'Produto 070 — RODÍZIO DE SUSHI: não está cadastrado no sistema.' },
  ] },
  { id: 'a2', situacao: 'processado', loja: 'Sushi Ponta Negra', pdv: 'iComanda', tipo: 'Venda', dMovimento: '28/06/2026', arquivo: 'EXPORTACAO_ICOMANDA_VENDA_17802332000354_20260628_3418.txt', dExecucao: '28/06 20:11', dIntegracao: '28/06 20:12', conteudo: CONTEUDO_OK, erros: [] },
  { id: 'a3', situacao: 'processado', loja: 'Sushi Distrito', pdv: 'iComanda', tipo: 'Venda', dMovimento: '28/06/2026', arquivo: 'EXPORTACAO_ICOMANDA_VENDA_17802332000273_20260628_2210.txt', dExecucao: '28/06 20:14', dIntegracao: '28/06 20:15', conteudo: CONTEUDO_OK, erros: [] },
  { id: 'a4', situacao: 'aguardando', loja: 'Sushi Ponta Negra', pdv: 'iComanda', tipo: 'Venda', dMovimento: '29/06/2026', arquivo: 'EXPORTACAO_ICOMANDA_VENDA_17802332000354_20260629_3434.txt', dExecucao: '—', dIntegracao: '—', conteudo: CONTEUDO_OK, erros: [] },
  { id: 'a5', situacao: 'em_processamento', loja: 'Sushi Cidade Nova', pdv: 'iComanda', tipo: 'Venda', dMovimento: '29/06/2026', arquivo: 'EXPORTACAO_ICOMANDA_VENDA_17802332000605_20260629_1188.txt', dExecucao: '29/06 20:16', dIntegracao: '—', conteudo: CONTEUDO_OK, erros: [] },
  { id: 'a6', situacao: 'nao_recebido', loja: 'Sushi Delivery', pdv: 'iComanda', tipo: 'Venda', dMovimento: '29/06/2026', arquivo: '—', dExecucao: '—', dIntegracao: '—', conteudo: '', erros: [{ erro: 'Não recebido', msg: 'O arquivo de vendas de 29/06/2026 não foi recebido do PDV. Verifique a integração / o fechamento do caixa.' }] },
]

export function MonitorVendas() {
  const [rows, setRows] = useState<Arquivo[]>(MOCK)
  const [chips, setChips] = useState<Set<Situacao>>(new Set(ORDER))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detId, setDetId] = useState<string | null>(null)
  const [verId, setVerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const cnt = useMemo(() => { const c = { com_erros: 0, nao_recebido: 0, aguardando: 0, em_processamento: 0, processado: 0 } as Record<Situacao, number>; rows.forEach((r) => { c[r.situacao]++ }); return c }, [rows])
  const lista = useMemo(() => rows.filter((r) => chips.has(r.situacao)), [rows, chips])

  const toggleChip = (s: Situacao) => setChips((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selErros = [...sel].filter((id) => rows.find((x) => x.id === id)?.situacao === 'com_erros')
  const allChecked = lista.length > 0 && lista.every((r) => sel.has(r.id))
  const toggleAll = (on: boolean) => setSel(on ? new Set(lista.map((r) => r.id)) : new Set())

  const reprocessar = (ids: string[]) => {
    const alvo = ids.filter((id) => rows.find((x) => x.id === id)?.situacao === 'com_erros')
    if (!alvo.length) { showToast('Selecione arquivos Com Erros para reprocessar.', 'err'); return }
    setRows((p) => p.map((r) => alvo.includes(r.id) ? { ...r, situacao: 'processado', erros: [], dIntegracao: '29/06 20:40' } : r))
    setSel((p) => { const n = new Set(p); alvo.forEach((id) => n.delete(id)); return n })
    showToast(`${alvo.length} arquivo(s) reprocessado(s). (demonstração)`, 'ok')
  }

  const det = detId ? rows.find((r) => r.id === detId) : null
  const ver = verId ? rows.find((r) => r.id === verId) : null

  return (
    <div className="mvend-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label><select className="field"><option>Todas as lojas</option><option>Sushi Ponta Negra</option><option>Sushi Distrito</option></select></div>
        <div className="ds-field"><label>PDV</label><select className="field"><option>Todos</option><option>iComanda</option><option>Saipos</option></select></div>
        <div className="ds-field"><label>Tipo</label><select className="field"><option>Venda</option><option>Financeiro</option></select></div>
        <div className="ds-field"><label>Período</label><input type="date" className="field" defaultValue="2026-06-29" /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" defaultValue="2026-06-29" /></div>
        <div className="ds-actions">
          <button className="btn-pri">Filtrar</button>
          <button className="btn-ghost">Limpar</button>
        </div>
      </div>

      <div className="kbar">
        <div className="it"><span className="k">Total de arquivos</span><span className="v">{rows.length}</span></div>
        <div className="it"><span className="k">Processados</span><span className="v ok">{cnt.processado}</span></div>
        <div className="it"><span className="k">Aguardando</span><span className="v">{cnt.aguardando}</span></div>
        <div className="it"><span className="k">Em processamento</span><span className="v">{cnt.em_processamento}</span></div>
        <div className="it"><span className="k">Com erros</span><span className="v err">{cnt.com_erros}</span></div>
        <div className="it"><span className="k">Não recebidos</span><span className="v" style={{ color: '#111827' }}>{cnt.nao_recebido}</span></div>
      </div>

      <div className="sit-row">
        {ORDER.map((s) => (
          <label key={s} className="sit-chip">
            <input type="checkbox" checked={chips.has(s)} onChange={() => toggleChip(s)} />
            <span className="dot" style={{ background: SIT_META[s].dot }} />
            {SIT_META[s].nome} <span className="cnt">({cnt[s]})</span>
          </label>
        ))}
        <span className="mock-tag">⚑ Dados de exemplo — aguardando integração do PDV</span>
      </div>

      {cnt.nao_recebido > 0 && (
        <div className="warn-bar">⚫ <b>{cnt.nao_recebido} arquivo(s) NÃO recebido(s)</b> — o PDV não enviou as vendas desse(s) dia(s). Verifique a integração / o fechamento do caixa.</div>
      )}

      <div className="card">
        <div className="toolbar">
          <button className="btn-ghost btn-sm">↻ Atualizar</button>
          <button className="btn-ghost btn-sm" disabled={sel.size !== 1} onClick={() => { const id = [...sel][0]; if (id) setVerId(id) }}>👁 Visualizar arquivo</button>
          <button className="btn-ghost btn-sm" disabled={!selErros.length} onClick={() => reprocessar(selErros)}>↻ Reprocessar ({selErros.length})</button>
          <div className="sp">Registros por página <select className="field btn-sm" style={{ height: 30 }}><option>100</option><option>50</option></select></div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th>Situação</th><th>Loja</th><th>PDV</th><th>Tipo</th><th>D. Movimento</th><th>Arquivo</th><th>D. Execução</th><th>D. Integração</th><th className="c">Ver</th>
              </tr>
            </thead>
            <tbody>
              {!lista.length
                ? <tr><td colSpan={10} className="empty">Nenhum arquivo neste filtro.</td></tr>
                : lista.map((r) => {
                  const m = SIT_META[r.situacao]
                  return (
                    <tr key={r.id} className={(sel.has(r.id) ? 'sel ' : '') + (r.situacao === 'com_erros' ? 'err' : '')} onClick={() => setDetId(r.id)}>
                      <td className="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                      <td><span className={'pill ' + m.pill}><span className="d" />{m.nome}</span></td>
                      <td>{r.loja}</td>
                      <td>{r.pdv}</td>
                      <td>{r.tipo}</td>
                      <td>{r.dMovimento}</td>
                      <td><span className="arq" title={r.arquivo}>{r.arquivo}</span></td>
                      <td>{r.dExecucao}</td>
                      <td>{r.dIntegracao}</td>
                      <td className="c" onClick={(e) => e.stopPropagation()}>{r.arquivo !== '—' ? <button className="ico-btn" title="Visualizar conteúdo" onClick={() => setVerId(r.id)}>👁</button> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag">
          <span>Mostrando {lista.length} de {rows.length} arquivos</span>
          <span>{sel.size} selecionado(s)</span>
        </div>
      </div>

      <div className="det err-panel">
        <div className="h2">{det && det.erros.length ? `Erros do arquivo — ${det.arquivo !== '—' ? det.arquivo : det.loja + ' · ' + det.dMovimento}` : 'Erros / Mensagens'}</div>
        {!det
          ? <div className="b-empty"><span className="i">i</span> Selecione um arquivo para ver os erros. Só os <b>Com Erros</b> (produto sem cadastro ou sem ficha) exigem ação.</div>
          : det.erros.length === 0
            ? <div className="b-empty"><span className="i" style={{ background: '#ecfdf5', color: '#16a34a' }}>✓</span> Arquivo processado sem erros.</div>
            : (
              <table>
                <thead><tr><th style={{ width: 160 }}>Erro</th><th>Mensagem</th></tr></thead>
                <tbody>
                  {det.erros.map((e, i) => (
                    <tr key={i} className="err">
                      <td><span className={'pill ' + (/cadastro/i.test(e.erro) ? 'p-err' : /ficha/i.test(e.erro) ? 'p-pend' : 'p-naorec')}><span className="d" />{e.erro}</span></td>
                      <td className="msg">{e.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
      </div>

      <div className="footbar">
        <span style={{ fontSize: 12, color: '#64748b' }}>Monitor de arquivos do PDV · os valores (faturamento, itens) ficam na tela <b>Vendas</b>, que lê os arquivos processados</span>
        <div className="foot-r">
          <button className="btn-ghost" disabled={sel.size !== 1} onClick={() => { const id = [...sel][0]; if (id) setVerId(id) }}>👁 Visualizar arquivo</button>
          <button className="btn-green" disabled={!selErros.length} onClick={() => reprocessar(selErros)}>↻ Reprocessar selecionados</button>
        </div>
      </div>

      {ver && (
        <div className="mv-ov" onClick={(e) => { if (e.target === e.currentTarget) setVerId(null) }}>
          <div className="mv-modal">
            <div className="h"><span className="t">{ver.arquivo}</span><button className="x" onClick={() => setVerId(null)}>✕</button></div>
            <pre>{ver.conteudo || '(arquivo não recebido — sem conteúdo)'}</pre>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
