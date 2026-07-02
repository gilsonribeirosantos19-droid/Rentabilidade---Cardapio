import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useLoja } from '../lib/loja'
import './faturamento.css'

// Engenharia de Cardápio — análise POR PRODUTO (modelo Everest).
// TELA MOCK: dados de exemplo. Quando o PDV estiver processando as vendas,
// esta tela agrega por produto (Q. Venda, V. Líquida, Custo Médio, CMV, % Custo, % Margem).
// Filtro "Incluir itens com valor zerado": no rodízio os itens entram com R$ 0 — por padrão ocultos.

type Prod = { id: string; loja: string; item: string; codigo: string; grupo: string; qVenda: number; vBruta: number; vDesc: number; vCustoMedio: number }

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q4 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const p4 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']; void DOW
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])(\S)/g, (_m, p, c) => p + (c as string).toUpperCase())

type ColKey = 'loja' | 'item' | 'codigo' | 'grupo' | 'qVenda' | 'vBruta' | 'vDesc' | 'vLiquida' | 'vMedio' | 'vCustoMedio' | 'cmvTeo' | 'cmvAjust' | 'pctCusto' | 'qMediaDia' | 'pctMargem'
type Fmt = 'q' | 'm' | 'p'
type Col = { key: ColKey; label: string; cls?: 'r' | 'c'; title?: boolean; def: boolean; fixed?: boolean; filt?: boolean; fmt?: Fmt; sum?: boolean }
const COLS: Col[] = [
  { key: 'loja', label: 'Fantasia', def: true, fixed: true, filt: true },
  { key: 'item', label: 'Descrição Item', title: true, def: true },
  { key: 'codigo', label: 'Item', def: true },
  { key: 'grupo', label: 'Grupo', title: true, def: true, filt: true },
  { key: 'qVenda', label: 'Q. Venda', cls: 'r', fmt: 'q', def: true, sum: true },
  { key: 'vBruta', label: 'V. Venda Bruta', cls: 'r', fmt: 'm', def: true, sum: true },
  { key: 'vDesc', label: 'V. Desconto', cls: 'r', fmt: 'm', def: true, sum: true },
  { key: 'vLiquida', label: 'V. Venda Líquida', cls: 'r', fmt: 'm', def: true, sum: true },
  { key: 'vMedio', label: 'V. Médio', cls: 'r', fmt: 'm', def: true },
  { key: 'vCustoMedio', label: 'V. Custo Médio', cls: 'r', fmt: 'm', def: true },
  { key: 'cmvTeo', label: 'V. CMV Teórico', cls: 'r', fmt: 'm', def: true, sum: true },
  { key: 'cmvAjust', label: 'V. CMV Ajustado', cls: 'r', fmt: 'm', def: false, sum: true },
  { key: 'pctCusto', label: '% Custo', cls: 'r', fmt: 'p', def: true },
  { key: 'qMediaDia', label: 'Q. Média Dia', cls: 'r', fmt: 'p', def: true },
  { key: 'pctMargem', label: '% Margem', cls: 'r', fmt: 'p', def: true },
]

const COLS_KEY = 'aiko_eng_cols'
function loadCols(): Record<string, boolean> {
  try { const s = localStorage.getItem(COLS_KEY); if (s) { const o = JSON.parse(s); COLS.forEach((c) => { if (c.fixed) o[c.key] = true }); return o } } catch { /* ignore */ }
  const d: Record<string, boolean> = {}; COLS.forEach((c) => { d[c.key] = !!c.def }); return d
}

const L = 'Sushi Ponta Negra'
const MOCK: Prod[] = [
  { id: '1', loja: L, item: '030 - COMBO HOT P', codigo: '3182', grupo: 'G-COMBINADOS', qVenda: 35, vBruta: 2376.50, vDesc: 236.28, vCustoMedio: 18.45 },
  { id: '2', loja: L, item: '032 - COMBO HOT G', codigo: '3183', grupo: 'G-COMBINADOS', qVenda: 19, vBruta: 2563.10, vDesc: 171.20, vCustoMedio: 38.07 },
  { id: '3', loja: L, item: '034 - COMBO PRIME', codigo: '3185', grupo: 'G-COMBINADOS', qVenda: 34, vBruta: 4586.60, vDesc: 155.59, vCustoMedio: 42.04 },
  { id: '4', loja: L, item: '035 - COMBO PHILADELFIA', codigo: '3187', grupo: 'G-COMBINADOS', qVenda: 20, vBruta: 1898.00, vDesc: 166.45, vCustoMedio: 27.55 },
  { id: '5', loja: L, item: '001 - HARUMAKI CAMARAO', codigo: '1870', grupo: 'G-ENTRADAS', qVenda: 35, vBruta: 836.50, vDesc: 93.49, vCustoMedio: 5.47 },
  { id: '6', loja: L, item: '002 - CAMARAO EMPANADO', codigo: '1871', grupo: 'G-ENTRADAS', qVenda: 22, vBruta: 789.80, vDesc: 64.21, vCustoMedio: 8.49 },
  { id: '7', loja: L, item: '005 - CEVICHE', codigo: '1874', grupo: 'G-ENTRADAS', qVenda: 3, vBruta: 134.70, vDesc: 0, vCustoMedio: 12.93 },
  { id: '8', loja: L, item: '010 - HOT BOLL', codigo: '2554', grupo: 'G-ENTRADAS', qVenda: 10.5, vBruta: 345.45, vDesc: 61.62, vCustoMedio: 17.46 },
  { id: '9', loja: L, item: '56 - HOT PHILADELFIA', codigo: '1928', grupo: 'G-HOT ROLL', qVenda: 70, vBruta: 2513.00, vDesc: 175.53, vCustoMedio: 6.88 },
  { id: '10', loja: L, item: '57 - HOT BUTTERFLY', codigo: '1929', grupo: 'G-HOT ROLL', qVenda: 12, vBruta: 406.60, vDesc: 9.31, vCustoMedio: 4.73 },
  { id: '11', loja: L, item: '169 - HOT SUSHIZAO', codigo: '2640', grupo: 'G-HOT ROLL', qVenda: 25.5, vBruta: 1170.45, vDesc: 35.50, vCustoMedio: 16.38 },
  { id: '12', loja: L, item: '074 - RODIZIO DO MAR', codigo: '3301', grupo: 'G-RODIZIO DO MAR', qVenda: 40, vBruta: 3200.00, vDesc: 0, vCustoMedio: 22.00 },
  { id: '13', loja: L, item: 'REFRI. COCA ZERO LATA', codigo: '1200', grupo: 'G-BEBIDAS', qVenda: 120, vBruta: 948.00, vDesc: 30.00, vCustoMedio: 3.20 },
  // itens de RODÍZIO com valor zerado (só aparecem com o filtro ligado)
  { id: 'z1', loja: L, item: '(RS) 56 - HOT PHILADELFIA', codigo: '1928', grupo: 'G-RODIZIO DE SUSHI', qVenda: 68, vBruta: 0, vDesc: 0, vCustoMedio: 6.88 },
  { id: 'z2', loja: L, item: '(RS) 62 - HOT MORANGO NUT', codigo: '1934', grupo: 'G-RODIZIO DE SUSHI', qVenda: 15, vBruta: 0, vDesc: 0, vCustoMedio: 6.88 },
  { id: 'z3', loja: L, item: '(RDM) CAMAROES EMPANADOS', codigo: '3300', grupo: 'G-RODIZIO DO MAR', qVenda: 30, vBruta: 0, vDesc: 0, vCustoMedio: 8.49 },
]

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const diasEntre = (de: string, ate: string) => Math.max(1, Math.round((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000) + 1)

export function EngenhariaCardapio() {
  const { lojas } = useLoja()
  const [de, setDe] = useState('2026-06-01')
  const [ate, setAte] = useState('2026-06-30')
  const [busca, setBusca] = useState('')
  const [incluirZerado, setIncluirZerado] = useState(false)
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.nome))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? [...lojaSet][0] : `${lojaSet.size} lojas`
  const toggleLoja = (n: string) => setLojaSet((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.nome)))

  const [cols, setCols] = useState(loadCols)
  const [ddPos, setDdPos] = useState({ top: 0, left: 0 })
  const [colsOpen, setColsOpen] = useState(false)
  const toggleCol = (k: ColKey) => setCols((c) => ({ ...c, [k]: !c[k] }))
  const salvarCols = () => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch { /* ignore */ } setColsOpen(false) }
  const visCols = COLS.filter((c) => cols[c.key])

  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({})
  const [filtCol, setFiltCol] = useState<ColKey | null>(null)
  const openDd = (e: MouseEvent, which: 'cols' | ColKey) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDdPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 350)), left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) })
    if (which === 'cols') { setFiltCol(null); setColsOpen((o) => !o) }
    else { setColsOpen(false); setFiltCol((c) => c === which ? null : which) }
  }

  const setPeriodo = (tipo: string) => {
    const d = new Date()
    if (tipo === 'mes_atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (tipo === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
  }

  const dias = diasEntre(de, ate)
  const num = (v: Prod, k: ColKey): number => {
    const vLiquida = v.vBruta - v.vDesc
    const cmvTeo = v.vCustoMedio * v.qVenda
    switch (k) {
      case 'qVenda': return v.qVenda
      case 'vBruta': return v.vBruta
      case 'vDesc': return v.vDesc
      case 'vLiquida': return vLiquida
      case 'vMedio': return v.qVenda ? vLiquida / v.qVenda : 0
      case 'vCustoMedio': return v.vCustoMedio
      case 'cmvTeo': return cmvTeo
      case 'cmvAjust': return cmvTeo
      case 'pctCusto': return vLiquida > 0 ? cmvTeo / vLiquida * 100 : 0
      case 'qMediaDia': return v.qVenda / dias
      case 'pctMargem': return vLiquida > 0 ? 100 - cmvTeo / vLiquida * 100 : 0
      default: return 0
    }
  }
  const fmt = (n: number, f?: Fmt) => f === 'm' ? m2(n) : f === 'q' ? q4(n) : f === 'p' ? p4(n) : String(n)
  const cellVal = (v: Prod, c: Col): string => {
    switch (c.key) {
      case 'loja': return v.loja
      case 'item': return titleCase(v.item)
      case 'codigo': return v.codigo
      case 'grupo': return titleCase(v.grupo)
      default: return fmt(num(v, c.key), c.fmt)
    }
  }

  const preLista = useMemo(() => {
    const q = norm(busca.trim())
    const filtraLoja = lojaSet.size > 0 && !allSel
    return MOCK.filter((v) => {
      if (!incluirZerado && (v.vBruta - v.vDesc) === 0) return false
      if (filtraLoja && !lojaSet.has(v.loja)) return false
      if (q && !norm([v.item, v.grupo, v.codigo].join(' ')).includes(q)) return false
      return true
    })
  }, [busca, lojaSet, allSel, incluirZerado])
  const lista = useMemo(() => preLista.filter((v) => Object.entries(colFilters).every(([k, set]) => set.has(cellVal(v, COLS.find((c) => c.key === k)!)))), [preLista, colFilters])

  const distinct = (k: ColKey) => { const c = COLS.find((x) => x.key === k)!; return [...new Set(preLista.map((v) => cellVal(v, c)))].sort() }
  const toggleFiltVal = (k: ColKey, val: string, all: string[]) => setColFilters((prev) => { const cur = new Set(prev[k] ?? all); cur.has(val) ? cur.delete(val) : cur.add(val); const next = { ...prev }; if (cur.size === all.length) delete next[k]; else next[k] = cur; return next })
  const toggleFiltTodos = (k: ColKey, all: string[]) => setColFilters((prev) => { const cur = prev[k] ?? new Set(all); const next = { ...prev }; if (cur.size === all.length) next[k] = new Set(); else delete next[k]; return next })

  const tot = useMemo(() => { const t: Record<string, number> = {}; COLS.filter((c) => c.sum).forEach((c) => { t[c.key] = lista.reduce((a, v) => a + num(v, c.key), 0) }); return t }, [lista, dias])

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
        <div className="ds-field"><label>&nbsp;</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, fontSize: 13, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={incluirZerado} onChange={(e) => setIncluirZerado(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#f97316' }} />
            Incluir itens com valor zerado
          </label>
        </div>
        <div className="ds-actions"><button className="btn-ghost">↓ Exportar</button></div>
      </div>

      <div className="search-row">
        <input className="search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="mock-tag">⚑ Dados de exemplo — lê as vendas reais quando o PDV estiver processando</span>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              {visCols.map((c, i) => (
                <th key={c.key} className={c.cls}>
                  <span className="th-in">
                    {c.label}
                    {c.filt && <svg className={'hd-ico' + (colFilters[c.key] ? ' on' : '')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} onClick={(e) => { e.stopPropagation(); openDd(e, c.key) }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>}
                    {i === 0 && <svg className="hd-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} onClick={(e) => { e.stopPropagation(); openDd(e, 'cols') }}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={visCols.length} className="empty">Nenhum produto no filtro.</td></tr>
              : lista.map((v) => <tr key={v.id}>{visCols.map((c) => <td key={c.key} className={c.cls}>{cellVal(v, c)}</td>)}</tr>)}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>{visCols.map((c, i) => <td key={c.key} className={c.cls}>{c.sum ? fmt(tot[c.key] || 0, c.fmt) : (i === 0 ? `${lista.length} itens` : '')}</td>)}</tr>
          </tfoot>}
        </table>
      </div>

      {colsOpen && <>
        <div className="fatv-back" onClick={() => setColsOpen(false)} />
        <div className="fatv-dd" style={{ top: ddPos.top, left: ddPos.left }}>
          <div className="tit">Colunas visíveis</div>
          {COLS.filter((c) => !c.fixed).map((c) => <label key={c.key}><input type="checkbox" checked={!!cols[c.key]} onChange={() => toggleCol(c.key)} />{c.label}</label>)}
          <button className="save" onClick={salvarCols}>Salvar preferência</button>
        </div>
      </>}

      {filtCol && (() => {
        const all = distinct(filtCol); const cur = colFilters[filtCol]; const todos = !cur || cur.size === all.length
        return <>
          <div className="fatv-back" onClick={() => setFiltCol(null)} />
          <div className="fatv-dd" style={{ top: ddPos.top, left: ddPos.left }}>
            <div className="tit">Filtrar: {COLS.find((c) => c.key === filtCol)?.label}</div>
            <label><input type="checkbox" checked={todos} onChange={() => toggleFiltTodos(filtCol, all)} /><b>(Todos)</b></label>
            <div className="ms-sep" />
            {all.map((val) => <label key={val}><input type="checkbox" checked={!cur || cur.has(val)} onChange={() => toggleFiltVal(filtCol, val, all)} />{val || '(vazio)'}</label>)}
          </div>
        </>
      })()}
    </div>
  )
}
