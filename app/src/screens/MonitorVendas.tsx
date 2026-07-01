import { useMemo, useState } from 'react'
import './monitorvendas.css'

// TELA MOCK — dados de exemplo em memória (não usa Supabase).
// Visual espelha o Monitor de NF-e (chips de status). Quando o Saipos entrar,
// troca a fonte por uma tabela `vendas` real, mantendo este layout.

type Status = 'pendente' | 'processada' | 'erro' | 'cancelada'
type ItemVenda = { produto: string; qtd: number; valor: number }
type Venda = { id: string; dataHora: string; consumo: string; bruto: number; desconto: number; liquido: number; itens: number; status: Status; detalhe: ItemVenda[] }

const STATUS_META: Record<Status, { nome: string; dot: string; pill: string }> = {
  pendente: { nome: 'Pendente', dot: '#f59e0b', pill: 'p-pend' },
  processada: { nome: 'Processada', dot: '#16a34a', pill: 'p-proc' },
  erro: { nome: 'Com erro', dot: '#ef4444', pill: 'p-err' },
  cancelada: { nome: 'Cancelada', dot: '#94a3b8', pill: 'p-canc' },
}
const ORDER: Status[] = ['pendente', 'processada', 'erro', 'cancelada']
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MOCK: Venda[] = [
  { id: 'v128', dataHora: '07/06 22:15', consumo: 'Salão', bruto: 285.60, desconto: 13.20, liquido: 272.40, itens: 18, status: 'pendente', detalhe: [{ produto: 'Temaki Salmão', qtd: 4, valor: 119.60 }, { produto: 'Hot Roll (8un)', qtd: 3, valor: 89.70 }, { produto: 'Refrigerante Lata', qtd: 11, valor: 63.10 }] },
  { id: 'v127', dataHora: '07/06 22:10', consumo: 'Delivery', bruto: 156.40, desconto: 0, liquido: 156.40, itens: 9, status: 'pendente', detalhe: [{ produto: 'Combo Sushi 20 peças', qtd: 1, valor: 98.90 }, { produto: 'Yakisoba Frango', qtd: 1, valor: 42.50 }, { produto: 'Guaraná 1L', qtd: 1, valor: 15.00 }] },
  { id: 'v126', dataHora: '07/06 22:05', consumo: 'Salão', bruto: 362.80, desconto: 17.60, liquido: 345.20, itens: 24, status: 'processada', detalhe: [{ produto: 'Rodízio Adulto', qtd: 4, valor: 320.00 }, { produto: 'Sobremesa', qtd: 4, valor: 42.80 }] },
  { id: 'v125', dataHora: '07/06 21:55', consumo: 'Retirada', bruto: 98.90, desconto: 0, liquido: 98.90, itens: 6, status: 'pendente', detalhe: [{ produto: 'Combo Sushi 20 peças', qtd: 1, valor: 98.90 }] },
  { id: 'v124', dataHora: '07/06 21:50', consumo: 'Salão', bruto: 478.70, desconto: 26.50, liquido: 452.20, itens: 31, status: 'erro', detalhe: [{ produto: 'Produto sem ficha (COD 9912)', qtd: 2, valor: 78.00 }, { produto: 'Temaki Salmão', qtd: 5, valor: 149.50 }, { produto: 'Rodízio Adulto', qtd: 3, valor: 224.70 }] },
  { id: 'v123', dataHora: '07/06 21:40', consumo: 'Delivery', bruto: 224.50, desconto: 0, liquido: 224.50, itens: 14, status: 'pendente', detalhe: [{ produto: 'Barca 40 peças', qtd: 1, valor: 189.90 }, { produto: 'Missoshiru', qtd: 2, valor: 34.60 }] },
  { id: 'v122', dataHora: '07/06 21:35', consumo: 'Salão', bruto: 609.20, desconto: 30.50, liquido: 578.70, itens: 37, status: 'processada', detalhe: [{ produto: 'Rodízio Adulto', qtd: 6, valor: 480.00 }, { produto: 'Bebidas diversas', qtd: 31, valor: 129.20 }] },
  { id: 'v121', dataHora: '07/06 21:25', consumo: 'Salão', bruto: 162.90, desconto: 8.10, liquido: 154.80, itens: 11, status: 'cancelada', detalhe: [{ produto: 'Hot Roll (8un)', qtd: 3, valor: 89.70 }, { produto: 'Refrigerante Lata', qtd: 8, valor: 73.20 }] },
  { id: 'v120', dataHora: '07/06 21:20', consumo: 'Retirada', bruto: 76.50, desconto: 0, liquido: 76.50, itens: 5, status: 'pendente', detalhe: [{ produto: 'Temaki Salmão', qtd: 2, valor: 59.80 }, { produto: 'Suco Natural', qtd: 3, valor: 16.70 }] },
  { id: 'v119', dataHora: '07/06 21:10', consumo: 'Delivery', bruto: 134.60, desconto: 0, liquido: 134.60, itens: 8, status: 'pendente', detalhe: [{ produto: 'Combo Sushi 20 peças', qtd: 1, valor: 98.90 }, { produto: 'Yakisoba Frango', qtd: 1, valor: 35.70 }] },
]

export function MonitorVendas() {
  const [rows, setRows] = useState<Venda[]>(MOCK)
  const [chips, setChips] = useState<Set<Status>>(new Set(ORDER))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detId, setDetId] = useState<string | null>(null)
  const [aba, setAba] = useState<'disp' | 'real'>('disp')
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const cnt = useMemo(() => { const c: Record<Status, number> = { pendente: 0, processada: 0, erro: 0, cancelada: 0 }; rows.forEach((r) => { c[r.status]++ }); return c }, [rows])
  // aba "disponíveis" = não processadas/canceladas; "realizadas" = processadas
  const doAba = useMemo(() => rows.filter((r) => aba === 'real' ? r.status === 'processada' : r.status !== 'processada'), [rows, aba])
  const lista = useMemo(() => doAba.filter((r) => chips.has(r.status)), [doAba, chips])
  const resumo = useMemo(() => ({ total: rows.length, bruto: rows.reduce((s, r) => s + r.bruto, 0), desc: rows.reduce((s, r) => s + r.desconto, 0), liquido: rows.reduce((s, r) => s + r.liquido, 0), itens: rows.reduce((s, r) => s + r.itens, 0) }), [rows])

  const toggleChip = (s: Status) => setChips((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selProcessaveis = [...sel].filter((id) => { const r = rows.find((x) => x.id === id); return r && (r.status === 'pendente' || r.status === 'erro') })
  const allChecked = lista.length > 0 && lista.every((r) => sel.has(r.id))
  const toggleAll = (on: boolean) => setSel(on ? new Set(lista.map((r) => r.id)) : new Set())

  const processar = () => {
    if (!selProcessaveis.length) { showToast('Selecione vendas Pendentes ou Com erro para processar.', 'err'); return }
    setRows((p) => p.map((r) => selProcessaveis.includes(r.id) ? { ...r, status: 'processada' } : r))
    setSel(new Set())
    showToast(`${selProcessaveis.length} venda(s) processada(s). (demonstração)`, 'ok')
  }

  const det = detId ? rows.find((r) => r.id === detId) : null

  return (
    <div className="mvend-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Período</label><input type="date" className="field" defaultValue="2026-06-07" /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" defaultValue="2026-06-07" /></div>
        <div className="ds-field"><label>Turno</label><select className="field"><option>Todos</option><option>Almoço</option><option>Jantar</option></select></div>
        <div className="ds-field"><label>Caixa</label><select className="field"><option>Todos</option><option>Caixa 01</option><option>Caixa 02</option><option>Caixa 03</option></select></div>
        <div className="ds-actions">
          <button className="btn-pri">Filtrar</button>
          <button className="btn-ghost">Limpar</button>
        </div>
      </div>

      <div className="kbar">
        <div className="it"><span className="k">Total de vendas</span><span className="v">{resumo.total}</span></div>
        <div className="it"><span className="k">Bruto</span><span className="v">{brl(resumo.bruto)}</span></div>
        <div className="it"><span className="k">Descontos</span><span className="v">{brl(resumo.desc)}</span></div>
        <div className="it"><span className="k">Líquido</span><span className="v">{brl(resumo.liquido)}</span></div>
        <div className="it"><span className="k">Itens</span><span className="v">{resumo.itens.toLocaleString('pt-BR')}</span></div>
        <div className="it"><span className="k">Processadas</span><span className="v ok">{cnt.processada}</span></div>
        <div className="it"><span className="k">Com erro</span><span className="v err">{cnt.erro}</span></div>
      </div>

      <div className="sit-row">
        {ORDER.map((s) => (
          <label key={s} className="sit-chip">
            <input type="checkbox" checked={chips.has(s)} onChange={() => toggleChip(s)} />
            <span className="dot" style={{ background: STATUS_META[s].dot }} />
            {STATUS_META[s].nome} <span className="cnt">({cnt[s]})</span>
          </label>
        ))}
        <span className="mock-tag">⚑ Dados de exemplo — aguardando integração Saipos</span>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={'tab' + (aba === 'disp' ? ' on' : '')} onClick={() => { setAba('disp'); setSel(new Set()) }}>Vendas disponíveis</button>
          <button className={'tab' + (aba === 'real' ? ' on' : '')} onClick={() => { setAba('real'); setSel(new Set()) }}>Importações realizadas</button>
        </div>
        <div className="toolbar">
          <button className="btn-ghost btn-sm">↻ Atualizar</button>
          <button className="btn-ghost btn-sm" disabled={sel.size !== 1} onClick={() => setDetId([...sel][0] || null)}>👁 Pré-visualizar venda</button>
          <button className="btn-ghost btn-sm" disabled={!selProcessaveis.length} onClick={processar}>▶ Processar selecionadas ({selProcessaveis.length})</button>
          <div className="sp">Registros por página <select className="field btn-sm" style={{ height: 30 }}><option>100</option><option>50</option><option>25</option></select></div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th>Data / Hora</th><th>Consumo</th>
                <th className="r">Valor Bruto</th><th className="r">Desconto</th><th className="r">Valor Líquido</th><th className="r">Itens</th><th className="c">Status</th>
              </tr>
            </thead>
            <tbody>
              {!lista.length
                ? <tr><td colSpan={8} className="empty">Nenhuma venda neste filtro.</td></tr>
                : lista.map((r) => {
                  const m = STATUS_META[r.status]
                  return (
                    <tr key={r.id} className={(sel.has(r.id) ? 'sel ' : '') + (r.status === 'erro' ? 'err' : '')} onClick={() => setDetId(r.id)}>
                      <td className="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                      <td>{r.dataHora}</td>
                      <td>{r.consumo}</td>
                      <td className="r">{brl(r.bruto)}</td>
                      <td className="r">{brl(r.desconto)}</td>
                      <td className="r">{brl(r.liquido)}</td>
                      <td className="r">{r.itens}</td>
                      <td className="c"><span className={'pill ' + m.pill}><span className="d" />{m.nome}</span></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag">
          <span>Mostrando {lista.length ? 1 : 0} a {lista.length} de {lista.length} registros</span>
          <span>{sel.size} selecionada(s)</span>
        </div>
      </div>

      <div className="det">
        <div className="h">
          <span>Detalhes da venda{det ? ` — ${det.dataHora} · ${det.consumo}` : ''}</span>
          {det && <span style={{ textTransform: 'none', color: '#64748b', fontWeight: 600 }}>{det.itens} itens · {brl(det.liquido)} líquido</span>}
        </div>
        {!det
          ? <div className="b-empty"><span className="i">i</span> Selecione uma venda para visualizar os itens e realizar o processamento.</div>
          : (
            <table>
              <thead><tr><th>Produto</th><th className="r">Qtd</th><th className="r">Valor</th></tr></thead>
              <tbody>
                {det.detalhe.map((it, i) => (
                  <tr key={i} className={/sem ficha/i.test(it.produto) ? 'err' : ''}>
                    <td>{it.produto}{/sem ficha/i.test(it.produto) && <span className="pill p-err" style={{ marginLeft: 8 }}><span className="d" />sem ficha</span>}</td>
                    <td className="r">{it.qtd}</td>
                    <td className="r">{brl(it.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div className="footbar">
        <span style={{ fontSize: 12, color: '#64748b' }}><b style={{ color: '#0f172a' }}>{sel.size}</b> de {resumo.total} selecionada(s) · líquido do período <b className="mono" style={{ color: '#0f172a' }}>{brl(resumo.liquido)}</b></span>
        <div className="foot-r">
          <button className="btn-ghost">📄 Gerar relatório</button>
          <button className="btn-ghost" disabled={!sel.size}>🗑 Excluir selecionadas</button>
          <button className="btn-green" disabled={!selProcessaveis.length} onClick={processar}>▶ Processar selecionadas</button>
        </div>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
