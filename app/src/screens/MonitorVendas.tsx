import { useMemo, useState } from 'react'
import './monitorvendas.css'

// TELA MOCK — dados de exemplo em memória (não usa Supabase).
// CONCEITO (confirmado com o usuário):
//  - As vendas do PDV entram JÁ COMO "Processada" automaticamente.
//  - Só as "Com erro" (ex.: produto sem ficha) precisam de correção manual → viram Processada.
//  - As vendas FICAM nesta tela (é a casa delas) e os relatórios do PDV puxam daqui.
// Quando o Saipos entrar, troca a fonte por uma tabela `vendas` real, mantendo este layout.

type Status = 'processada' | 'erro' | 'cancelada'
type ErroItem = 'sem_cadastro' | 'sem_ficha'
type ItemVenda = { produto: string; qtd: number; valor: number; erro?: ErroItem }
const ERRO_META: Record<ErroItem, { nome: string; pill: string }> = {
  sem_cadastro: { nome: 'sem cadastro', pill: 'p-err' },
  sem_ficha: { nome: 'sem ficha', pill: 'p-pend' },
}
type Venda = { id: string; dataHora: string; consumo: string; bruto: number; desconto: number; liquido: number; itens: number; status: Status; detalhe: ItemVenda[] }

const STATUS_META: Record<Status, { nome: string; dot: string; pill: string }> = {
  erro: { nome: 'Com erro', dot: '#ef4444', pill: 'p-err' },
  processada: { nome: 'Processada', dot: '#16a34a', pill: 'p-proc' },
  cancelada: { nome: 'Cancelada', dot: '#94a3b8', pill: 'p-canc' },
}
const ORDER: Status[] = ['erro', 'processada', 'cancelada']
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MOCK: Venda[] = [
  { id: 'v128', dataHora: '07/06 22:15', consumo: 'Salão', bruto: 285.60, desconto: 13.20, liquido: 272.40, itens: 18, status: 'processada', detalhe: [{ produto: 'Temaki Salmão', qtd: 4, valor: 119.60 }, { produto: 'Hot Roll (8un)', qtd: 3, valor: 89.70 }, { produto: 'Refrigerante Lata', qtd: 11, valor: 63.10 }] },
  { id: 'v127', dataHora: '07/06 22:10', consumo: 'Delivery', bruto: 156.40, desconto: 0, liquido: 156.40, itens: 9, status: 'processada', detalhe: [{ produto: 'Combo Sushi 20 peças', qtd: 1, valor: 98.90 }, { produto: 'Yakisoba Frango', qtd: 1, valor: 42.50 }, { produto: 'Guaraná 1L', qtd: 1, valor: 15.00 }] },
  { id: 'v126', dataHora: '07/06 22:05', consumo: 'Salão', bruto: 362.80, desconto: 17.60, liquido: 345.20, itens: 24, status: 'processada', detalhe: [{ produto: 'Rodízio Adulto', qtd: 4, valor: 320.00 }, { produto: 'Sobremesa', qtd: 4, valor: 42.80 }] },
  { id: 'v124', dataHora: '07/06 21:50', consumo: 'Salão', bruto: 478.70, desconto: 26.50, liquido: 452.20, itens: 31, status: 'erro', detalhe: [{ produto: 'Combo Executivo (COD 9912)', qtd: 2, valor: 78.00, erro: 'sem_ficha' }, { produto: 'Temaki Salmão', qtd: 5, valor: 149.50 }, { produto: 'Rodízio Adulto', qtd: 3, valor: 224.70 }] },
  { id: 'v123', dataHora: '07/06 21:40', consumo: 'Delivery', bruto: 224.50, desconto: 0, liquido: 224.50, itens: 14, status: 'processada', detalhe: [{ produto: 'Barca 40 peças', qtd: 1, valor: 189.90 }, { produto: 'Missoshiru', qtd: 2, valor: 34.60 }] },
  { id: 'v122', dataHora: '07/06 21:35', consumo: 'Salão', bruto: 609.20, desconto: 30.50, liquido: 578.70, itens: 37, status: 'processada', detalhe: [{ produto: 'Rodízio Adulto', qtd: 6, valor: 480.00 }, { produto: 'Bebidas diversas', qtd: 31, valor: 129.20 }] },
  { id: 'v121', dataHora: '07/06 21:25', consumo: 'Salão', bruto: 162.90, desconto: 8.10, liquido: 154.80, itens: 11, status: 'cancelada', detalhe: [{ produto: 'Hot Roll (8un)', qtd: 3, valor: 89.70 }, { produto: 'Refrigerante Lata', qtd: 8, valor: 73.20 }] },
  { id: 'v120', dataHora: '07/06 21:20', consumo: 'Retirada', bruto: 76.50, desconto: 0, liquido: 76.50, itens: 5, status: 'erro', detalhe: [{ produto: 'Poke Bowl (COD 8841)', qtd: 1, valor: 39.90, erro: 'sem_cadastro' }, { produto: 'Suco Natural', qtd: 3, valor: 36.60 }] },
  { id: 'v119', dataHora: '07/06 21:10', consumo: 'Delivery', bruto: 134.60, desconto: 0, liquido: 134.60, itens: 8, status: 'processada', detalhe: [{ produto: 'Combo Sushi 20 peças', qtd: 1, valor: 98.90 }, { produto: 'Yakisoba Frango', qtd: 1, valor: 35.70 }] },
]

// recebimento do arquivo de vendas por dia (verde = chegou; preto = NÃO chegou, tipo Everest)
const RECEB: { dia: string; ok: boolean }[] = [
  { dia: '01/06', ok: true }, { dia: '02/06', ok: true }, { dia: '03/06', ok: false },
  { dia: '04/06', ok: true }, { dia: '05/06', ok: true }, { dia: '06/06', ok: true }, { dia: '07/06', ok: true },
]

export function MonitorVendas() {
  const [rows, setRows] = useState<Venda[]>(MOCK)
  const [chips, setChips] = useState<Set<Status>>(new Set(ORDER))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detId, setDetId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const cnt = useMemo(() => { const c: Record<Status, number> = { processada: 0, erro: 0, cancelada: 0 }; rows.forEach((r) => { c[r.status]++ }); return c }, [rows])
  const lista = useMemo(() => rows.filter((r) => chips.has(r.status)), [rows, chips])
  const resumo = useMemo(() => ({ total: rows.length, bruto: rows.reduce((s, r) => s + r.bruto, 0), desc: rows.reduce((s, r) => s + r.desconto, 0), liquido: rows.reduce((s, r) => s + r.liquido, 0), itens: rows.reduce((s, r) => s + r.itens, 0) }), [rows])
  const erroTipos = useMemo(() => {
    let cad = 0, fic = 0
    rows.forEach((r) => { if (r.status === 'erro') { if (r.detalhe.some((d) => d.erro === 'sem_cadastro')) cad++; if (r.detalhe.some((d) => d.erro === 'sem_ficha')) fic++ } })
    return { cad, fic }
  }, [rows])

  const toggleChip = (s: Status) => setChips((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selErros = [...sel].filter((id) => rows.find((x) => x.id === id)?.status === 'erro')
  const allChecked = lista.length > 0 && lista.every((r) => sel.has(r.id))
  const toggleAll = (on: boolean) => setSel(on ? new Set(lista.map((r) => r.id)) : new Set())

  const corrigir = (ids: string[]) => {
    const alvo = ids.filter((id) => rows.find((x) => x.id === id)?.status === 'erro')
    if (!alvo.length) { showToast('Selecione vendas Com erro para corrigir.', 'err'); return }
    setRows((p) => p.map((r) => alvo.includes(r.id) ? { ...r, status: 'processada', detalhe: r.detalhe.map((d) => ({ ...d, erro: undefined })) } : r))
    setSel((p) => { const n = new Set(p); alvo.forEach((id) => n.delete(id)); return n })
    showToast(`${alvo.length} venda(s) corrigida(s) e processada(s). (demonstração)`, 'ok')
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

      <div className="recv-strip">
        <span className="lb">Recebimento por dia</span>
        {RECEB.map((r) => (
          <span key={r.dia} className={'recv-day ' + (r.ok ? 'ok' : 'nao')} title={r.ok ? 'Arquivo recebido' : 'Arquivo NÃO recebido'}>
            <span className="d" />{r.dia}{!r.ok && ' · não recebido'}
          </span>
        ))}
      </div>

      {RECEB.some((r) => !r.ok) && (
        <div className="warn-bar">⚫ Arquivo de vendas <b>não recebido</b> em: {RECEB.filter((r) => !r.ok).map((r) => r.dia).join(', ')}. O PDV não enviou as vendas desse(s) dia(s) — verifique a integração / o caixa.</div>
      )}

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

      {cnt.erro > 0 && (
        <div className="info-bar">
          <span>ℹ️ As vendas entram <b>processadas automaticamente</b>. Há <b>{cnt.erro} venda(s) com erro</b>: {erroTipos.cad > 0 && <><b>{erroTipos.cad}</b> com produto <b>sem cadastro</b></>}{erroTipos.cad > 0 && erroTipos.fic > 0 && ' · '}{erroTipos.fic > 0 && <><b>{erroTipos.fic}</b> com produto <b>sem ficha técnica</b></>}.</span>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <button className="btn-ghost btn-sm">↻ Atualizar</button>
          <button className="btn-ghost btn-sm" disabled={sel.size !== 1} onClick={() => setDetId([...sel][0] || null)}>👁 Ver detalhe</button>
          <button className="btn-ghost btn-sm" disabled={!selErros.length} onClick={() => corrigir(selErros)}>✎ Corrigir selecionadas ({selErros.length})</button>
          <div className="sp">Registros por página <select className="field btn-sm" style={{ height: 30 }}><option>100</option><option>50</option><option>25</option></select></div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th>Data / Hora</th><th>Consumo</th>
                <th className="r">Valor Bruto</th><th className="r">Desconto</th><th className="r">Valor Líquido</th><th className="r">Itens</th><th className="c">Status</th><th className="c">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!lista.length
                ? <tr><td colSpan={9} className="empty">Nenhuma venda neste filtro.</td></tr>
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
                      <td className="c" onClick={(e) => e.stopPropagation()}>{r.status === 'erro' ? <button className="corrigir-btn" onClick={() => corrigir([r.id])}>Corrigir</button> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag">
          <span>Mostrando {lista.length} de {rows.length} vendas</span>
          <span>{sel.size} selecionada(s)</span>
        </div>
      </div>

      <div className="det">
        <div className="h">
          <span>Detalhes da venda{det ? ` — ${det.dataHora} · ${det.consumo}` : ''}</span>
          {det && <span style={{ textTransform: 'none', color: '#64748b', fontWeight: 600 }}>{det.itens} itens · {brl(det.liquido)} líquido{det.status === 'erro' ? <button className="corrigir-btn" style={{ marginLeft: 10 }} onClick={() => corrigir([det.id])}>✎ Corrigir esta venda</button> : ''}</span>}
        </div>
        {!det
          ? <div className="b-empty"><span className="i">i</span> Selecione uma venda para ver os itens. Só as <b>Com erro</b> exigem correção — as demais já entram processadas.</div>
          : (
            <table>
              <thead><tr><th>Produto</th><th className="r">Qtd</th><th className="r">Valor</th><th className="c">Situação</th></tr></thead>
              <tbody>
                {det.detalhe.map((it, i) => (
                  <tr key={i} className={it.erro ? 'err' : ''}>
                    <td>{it.produto}</td>
                    <td className="r">{it.qtd}</td>
                    <td className="r">{brl(it.valor)}</td>
                    <td className="c">{it.erro ? <span className={'pill ' + ERRO_META[it.erro].pill}><span className="d" />{ERRO_META[it.erro].nome}</span> : <span className="pill p-proc"><span className="d" />ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div className="footbar">
        <span style={{ fontSize: 12, color: '#64748b' }}>Fonte das vendas do PDV · os relatórios (Faturamento, Curva ABC, Engenharia) puxam desta tela</span>
        <div className="foot-r">
          <button className="btn-ghost">📄 Gerar relatório</button>
          <button className="btn-green" disabled={!selErros.length} onClick={() => corrigir(selErros)}>✎ Corrigir selecionadas</button>
        </div>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
