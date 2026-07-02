import { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from '../lib/loja'
import './faturamento.css'

// Faturamento — grade DETALHADA de vendas por item (modelo Everest "Vendas").
// TELA MOCK: dados de exemplo. Quando o PDV (iComanda/Saipos) estiver processando
// os arquivos (ver Monitor de Vendas), esta tela passa a ler os itens de venda reais.

type Venda = { id: string; data: string; loja: string; atendente: string; item: string; grupo: string; qtd: number; vTotal: number; vDesc: number; vUnit: number; cancelado: boolean }

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => { const g = new Date(iso + 'T12:00:00').getDay(); return `${g + 1}-${DOW[g]}` }
const fmtData = (iso: string) => iso.split('-').reverse().join('/')

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// colunas (modelo Everest). `def` = visível por padrão; `sum` = soma no rodapé; `lower` = exibe minúsculo
type ColKey = 'data' | 'loja' | 'atendente' | 'dow' | 'item' | 'grupo' | 'qtd' | 'familia' | 'vTotal' | 'vDesc' | 'tDesc' | 'vUnit' | 'cancelado' | 'vCancel' | 'tCancel' | 'descDesc'
type Col = { key: ColKey; label: string; cls?: 'r' | 'c'; lower?: boolean; def: boolean; sum?: 'brl' | 'qtd' | 'int' }
const COLS: Col[] = [
  { key: 'data', label: 'D. Movimento', def: true },
  { key: 'loja', label: 'Loja', def: true },
  { key: 'atendente', label: 'Atendente', def: true },
  { key: 'dow', label: 'Dia Semana', def: true },
  { key: 'item', label: 'Descrição Item PDV', lower: true, def: true },
  { key: 'grupo', label: 'Grupo', lower: true, def: true },
  { key: 'qtd', label: 'Q. Item', cls: 'r', def: true, sum: 'qtd' },
  { key: 'familia', label: 'Família', def: false },
  { key: 'vTotal', label: 'V. Total', cls: 'r', def: true, sum: 'brl' },
  { key: 'vDesc', label: 'V. Desconto', cls: 'r', def: true, sum: 'brl' },
  { key: 'tDesc', label: 'T. Desconto', cls: 'r', def: false, sum: 'int' },
  { key: 'vUnit', label: 'V. Unitário', cls: 'r', def: true, sum: 'brl' },
  { key: 'cancelado', label: 'Cancelado', cls: 'c', def: true },
  { key: 'vCancel', label: 'V. Cancelamento', cls: 'r', def: true, sum: 'brl' },
  { key: 'tCancel', label: 'T. Cancelamento', cls: 'r', def: false, sum: 'int' },
  { key: 'descDesc', label: 'Descrição Desconto', def: false },
]

const MOCK: Venda[] = [
  { id: '1', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '032 - COMBO HOT G', grupo: 'G-COMBINADOS', qtd: 1, vTotal: 134.90, vDesc: 0, vUnit: 134.90, cancelado: false },
  { id: '2', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '074 - RODÍZIO DO MAR', grupo: 'G-RODIZIO DO MAR', qtd: 2, vTotal: 135.80, vDesc: 53.80, vUnit: 67.90, cancelado: false },
  { id: '3', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '078 - RODÍZIO SUSHI ANIVERSARIANTE', grupo: 'G-RODIZIO DE SUSHI', qtd: 1, vTotal: 81.90, vDesc: 32.40, vUnit: 81.90, cancelado: false },
  { id: '4', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '099 - TAÇA DE OREO - ANIVERSARIANTE', grupo: 'G-SOBREMESAS', qtd: 1, vTotal: 27.90, vDesc: 11.05, vUnit: 27.90, cancelado: false },
  { id: '5', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '93 - YAKISSOBA CARNE E FRANGO', grupo: 'G-YAKISOBA', qtd: 1, vTotal: 34.90, vDesc: 11.38, vUnit: 34.90, cancelado: false },
  { id: '6', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'REFRI. COCA ZERO LATA', grupo: 'G-BEBIDAS', qtd: 3, vTotal: 23.70, vDesc: 9.39, vUnit: 7.90, cancelado: false },
  { id: '7', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'REFRI. FANTA UVA LATA', grupo: 'G-BEBIDAS', qtd: 1, vTotal: 7.90, vDesc: 3.13, vUnit: 7.90, cancelado: false },
  { id: '8', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'SUCO DE LARANJA', grupo: 'G-SUCO NATURAL', qtd: 1, vTotal: 10.90, vDesc: 0, vUnit: 10.90, cancelado: false },
  { id: '9', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'SUCO MARACUJA', grupo: 'G-SUCO NATURAL', qtd: 1, vTotal: 14.90, vDesc: 0, vUnit: 14.90, cancelado: false },
  { id: '10', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '010 - HOT BOLL', grupo: 'G-ENTRADAS', qtd: 1, vTotal: 32.90, vDesc: 13.16, vUnit: 32.90, cancelado: false },
  { id: '11', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '121 - TEMAKI HOT SALMÃO FLY', grupo: 'G-TEMAKI', qtd: 1, vTotal: 37.90, vDesc: 15.16, vUnit: 37.90, cancelado: false },
  { id: '12', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '33 - URAMAKI SUSHIZÃO', grupo: 'G-URAMAKI', qtd: 1, vTotal: 41.90, vDesc: 16.76, vUnit: 41.90, cancelado: false },
  { id: '13', data: '2026-06-13', loja: 'Sushi Distrito', atendente: 'Josiane', item: '(RS) 56 - HOT PHILADÉLFIA', grupo: 'G-RODIZIO DE SUSHI', qtd: 17, vTotal: 0, vDesc: 0, vUnit: 0, cancelado: false },
  { id: '14', data: '2026-06-13', loja: 'Sushi Distrito', atendente: 'Josiane', item: '(RS) 62 - HOT MORANGO NUT', grupo: 'G-RODIZIO DE SUSHI', qtd: 1, vTotal: 0, vDesc: 0, vUnit: 0, cancelado: false },
  { id: '15', data: '2026-06-14', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '02 - TEMAKI PHILADÉLFIA', grupo: 'G-TEMAKI', qtd: 1, vTotal: 34.90, vDesc: 10.64, vUnit: 34.90, cancelado: false },
  { id: '16', data: '2026-06-14', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '19 - TEMAKI HOT PHILADÉLFIA', grupo: 'G-TEMAKI', qtd: 1, vTotal: 37.90, vDesc: 0, vUnit: 37.90, cancelado: true },
]

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }

export function FaturamentoVendas() {
  const { lojas } = useLoja()
  const [de, setDe] = useState('2026-06-01')
  const [ate, setAte] = useState('2026-06-30')
  const [busca, setBusca] = useState('')
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const [colsOpen, setColsOpen] = useState(false)
  const [vis, setVis] = useState<Set<ColKey>>(new Set(COLS.filter((c) => c.def).map((c) => c.key)))
  const toggleCol = (k: ColKey) => setVis((p) => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s })
  const visCols = COLS.filter((c) => vis.has(c.key))
  // valores derivados (Família/T.Desconto/V.Cancelamento/T.Cancelamento) — mock a partir do que já temos
  const fami = (_v: Venda) => 'VENDAS'
  const tDesc = (v: Venda) => v.vDesc > 0 ? 1 : 0
  const vCancel = (v: Venda) => v.cancelado ? v.vTotal : 0
  const tCancel = (v: Venda) => v.cancelado ? 1 : 0
  const cellVal = (v: Venda, k: ColKey): string => {
    switch (k) {
      case 'data': return fmtData(v.data)
      case 'loja': return v.loja
      case 'atendente': return v.atendente
      case 'dow': return diaSemana(v.data)
      case 'item': return v.item
      case 'grupo': return v.grupo
      case 'qtd': return qtd(v.qtd)
      case 'familia': return fami(v)
      case 'vTotal': return brl(v.vTotal)
      case 'vDesc': return brl(v.vDesc)
      case 'tDesc': return String(tDesc(v))
      case 'vUnit': return brl(v.vUnit)
      case 'cancelado': return v.cancelado ? 'SIM' : 'NÃO'
      case 'vCancel': return brl(vCancel(v))
      case 'tCancel': return String(tCancel(v))
      case 'descDesc': return ''
    }
  }
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.nome))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? [...lojaSet][0] : `${lojaSet.size} lojas`
  const toggleLoja = (n: string) => setLojaSet((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.nome)))

  const setPeriodo = (tipo: string) => {
    const d = new Date()
    if (tipo === 'mes_atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (tipo === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
  }

  const lista = useMemo(() => {
    const q = norm(busca.trim())
    const filtraLoja = lojaSet.size > 0 && !allSel
    return MOCK.filter((v) => {
      if (v.data < de || v.data > ate) return false
      if (filtraLoja && !lojaSet.has(v.loja)) return false
      if (q && !norm([v.item, v.grupo, v.atendente, v.loja].join(' ')).includes(q)) return false
      return true
    })
  }, [de, ate, busca, lojaSet, allSel])

  const tot = useMemo(() => {
    const t: Record<string, number> = {}
    COLS.filter((c) => c.sum).forEach((c) => {
      t[c.key] = lista.reduce((a, v) => a + (c.key === 'tDesc' ? tDesc(v) : c.key === 'vCancel' ? vCancel(v) : c.key === 'tCancel' ? tCancel(v) : (v[c.key as keyof Venda] as number || 0)), 0)
    })
    return t
  }, [lista])
  const footVal = (c: Col): string => {
    const n = tot[c.key] || 0
    return c.sum === 'brl' ? brl(n) : c.sum === 'qtd' ? qtd(n) : String(n)
  }

  return (
    <div className="fatv-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <div className="ms">
            <button className="ms-btn" onClick={() => setLojaOpen((o) => !o)}>{lojaLabel}<span style={{ color: '#94a3b8' }}>▾</span></button>
            {lojaOpen && <>
              <div className="ms-back" onClick={() => setLojaOpen(false)} />
              <div className="ms-pop">
                <label className="ms-opt"><input type="checkbox" checked={allSel} onChange={toggleTodas} /><b>Todas as lojas</b></label>
                <div className="ms-sep" />
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.nome)} onChange={() => toggleLoja(l.nome)} />{l.nome}</label>)}
              </div>
            </>}
          </div>
        </div>
        <div className="ds-field"><label>Período</label>
          <select className="field" defaultValue="periodo" onChange={(e) => setPeriodo(e.target.value)} style={{ minWidth: 130 }}>
            <option value="periodo">Personalizado</option>
            <option value="mes_atual">Mês Atual</option>
            <option value="mes_anterior">Mês Anterior</option>
          </select>
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-actions"><button className="btn-ghost">↓ Exportar</button></div>
      </div>

      <div className="search-row">
        <input className="search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="mock-tag">⚑ Dados de exemplo — lê as vendas reais quando o PDV estiver processando</span>
        <div className="cols">
          <button className="cols-btn" onClick={() => setColsOpen((o) => !o)}>▦ Colunas ▾</button>
          {colsOpen && <>
            <div className="ms-back" onClick={() => setColsOpen(false)} />
            <div className="cols-pop">
              {COLS.map((c) => <label key={c.key} className="cols-opt"><input type="checkbox" checked={vis.has(c.key)} onChange={() => toggleCol(c.key)} />{c.label}</label>)}
            </div>
          </>}
        </div>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>{visCols.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={visCols.length} className="empty">Nenhum item de venda no filtro.</td></tr>
              : lista.map((v) => (
                <tr key={v.id}>
                  {visCols.map((c) => {
                    const canc = c.key === 'cancelado' && v.cancelado
                    return <td key={c.key} className={[c.cls || '', c.lower ? 'lower' : '', canc ? 'canc-sim' : ''].filter(Boolean).join(' ')}>{cellVal(v, c.key)}</td>
                  })}
                </tr>
              ))}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>
              {visCols.map((c, i) => <td key={c.key} className={c.cls}>{c.sum ? footVal(c) : (i === 0 ? `${lista.length} itens` : '')}</td>)}
            </tr>
          </tfoot>}
        </table>
      </div>
    </div>
  )
}
