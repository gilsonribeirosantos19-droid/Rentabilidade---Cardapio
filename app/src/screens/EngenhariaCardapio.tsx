import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useLoja } from '../lib/loja'
import { useAuth } from '../lib/auth'
import { supabase, fetchAll } from '../lib/db'
import { SearchSelect } from '../components/SearchSelect'
import { downloadCsv } from '../lib/csv'
import './faturamento.css'

// Engenharia de Cardápio — análise POR PRODUTO (modelo Everest).
// VENDAS reais do iComanda (icomanda_vendas), respeitando o portão (só mês sem erro).
// As colunas de CUSTO/CMV/Margem dependem da FICHA (de-para produto↔ficha) — enquanto
// o produto não tem ficha, elas aparecem como "—" (aguardando ficha) e o faturamento entra normal.
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
  { key: 'qMediaDia', label: 'Q. Média Dia', cls: 'r', fmt: 'q', def: true },
  { key: 'pctMargem', label: '% Margem', cls: 'r', fmt: 'p', def: true },
]

const COLS_KEY = 'aiko_eng_cols'
function loadCols(): Record<string, boolean> {
  try { const s = localStorage.getItem(COLS_KEY); if (s) { const o = JSON.parse(s); COLS.forEach((c) => { if (c.fixed) o[c.key] = true }); return o } } catch { /* ignore */ }
  const d: Record<string, boolean> = {}; COLS.forEach((c) => { d[c.key] = !!c.def }); return d
}

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const diasEntre = (de: string, ate: string) => Math.max(1, Math.round((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000) + 1)
const PERIODO_OPTS = ['Personalizado', 'Mês Atual', 'Mês Anterior']

// competências 'YYYY-MM' tocadas pelo intervalo (os dados do iComanda são por MÊS)
function compsBetween(de: string, ate: string): string[] {
  if (!de || !ate) return []
  const [y1, m1] = de.slice(0, 7).split('-').map(Number)
  const [y2, m2] = ate.slice(0, 7).split('-').map(Number)
  const out: string[] = []
  let y = y1, m = m1
  while ((y < y2 || (y === y2 && m <= m2)) && out.length < 24) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}
// colunas que dependem do custo da ficha (mostram "—" enquanto o produto não tem ficha)
const COST_KEYS = new Set<ColKey>(['vCustoMedio', 'cmvTeo', 'cmvAjust', 'pctCusto', 'pctMargem'])

export function EngenhariaCardapio() {
  const { lojas } = useLoja()
  const { tenantId } = useAuth()
  const [de, setDe] = useState(mesInicio())
  const [ate, setAte] = useState(mesFim())
  const [periodoSel, setPeriodoSel] = useState('Mês Atual')
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

  // --- dados REAIS do iComanda (icomanda_vendas), respeitando o portão ---
  const [rows, setRows] = useState<Prod[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [bloqueados, setBloqueados] = useState<string[]>([])
  const lojaNome = useMemo(() => { const m: Record<string, string> = {}; lojas.forEach((l) => { m[l.id] = l.nome }); return m }, [lojas])
  const buildRows = (data: Record<string, unknown>[]): Prod[] => {
    const map = new Map<string, Prod>()
    for (const r of data) {
      const key = `${r.loja_id}|${r.produto_id}`
      const ex = map.get(key)
      if (ex) { ex.qVenda += Number(r.qtd) || 0; ex.vBruta += Number(r.faturado) || 0 }
      else map.set(key, { id: key, loja: lojaNome[r.loja_id as string] || '—', item: String(r.produto_nome || ''), codigo: String(r.produto_id ?? ''), grupo: String(r.grupo || ''), qVenda: Number(r.qtd) || 0, vBruta: Number(r.faturado) || 0, vDesc: 0, vCustoMedio: 0 })
    }
    return [...map.values()]
  }
  // produtos + portão: uma loja×mês só entra se recebida e SEM erro (regra do portão)
  async function fetchVendas(comps: string[]): Promise<Prod[]> {
    const gateDe = comps[0] + '-01'
    const [ly, lm] = comps[comps.length - 1].split('-').map(Number)
    const gateAte = new Date(ly, lm, 0).toLocaleDateString('en-CA')
    const [vendas, gate] = await Promise.all([
      fetchAll<Record<string, unknown>>((f, t) => supabase.from('icomanda_vendas').select('*').eq('tenant_id', tenantId).in('competencia', comps).range(f, t)),
      fetchAll<Record<string, unknown>>((f, t) => supabase.from('icomanda_recebimento').select('loja_id,data,status').eq('tenant_id', tenantId).gte('data', gateDe).lte('data', gateAte).range(f, t)),
    ])
    const gk = new Map<string, { ok: boolean; erro: boolean }>()
    for (const r of gate) {
      const k = `${r.loja_id}|${String(r.data).slice(0, 7)}`
      const g = gk.get(k) || { ok: false, erro: false }
      if (r.status === 'processado') g.ok = true
      if (r.status === 'com_erro') g.erro = true
      gk.set(k, g)
    }
    // liberado = mês RECEBIDO no portão (≥1 dia processado). 1 dia com erro não bloqueia o mês de produtos.
    const liberado = (lojaId: string, comp: string) => { const g = gk.get(`${lojaId}|${comp}`); return !!g && g.ok }
    const bloq = new Set<string>()
    const okVendas = vendas.filter((r) => {
      if (liberado(String(r.loja_id), String(r.competencia))) return true
      bloq.add(`${lojaNome[r.loja_id as string] || r.loja_id} · ${r.competencia}`)
      return false
    })
    setBloqueados([...bloq])
    return buildRows(okVendas)
  }
  async function carregar(comps: string[]) {
    try { setRows(await fetchVendas(comps)) }
    catch (e) { setMsg('Erro ao carregar vendas: ' + (e as Error).message); setRows([]) }
  }
  useEffect(() => {
    if (!tenantId) { setRows([]); return }
    const comps = compsBetween(de, ate)
    if (!comps.length) { setRows([]); return }
    let alive = true
    setLoading(true)
    fetchVendas(comps)
      .then((r) => { if (alive) setRows(r) })
      .catch((e) => { if (alive) { setMsg('Erro ao carregar vendas: ' + (e as Error).message); setRows([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, de, ate, lojaNome])
  async function puxar() {
    if (!tenantId || syncing) return
    const comps = compsBetween(de, ate)
    if (!comps.length) { setMsg('Selecione um período.'); return }
    const gateDe = comps[0] + '-01'
    const [ly, lm] = comps[comps.length - 1].split('-').map(Number)
    const gateAte = new Date(ly, lm, 0).toLocaleDateString('en-CA')
    setSyncing(true); setMsg('Puxando do iComanda… (portão + produtos, pode levar ~1 min)')
    try {
      const d1 = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, data_ini: gateDe, data_fim: gateAte } })
      if (d1.error) throw d1.error
      if (d1.data?.status !== 'ok') throw new Error(d1.data?.mensagem || 'erro no portão')
      let prods = 0
      for (const competencia of comps) {
        const { data, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, competencia } })
        if (error) throw error
        if (data?.status !== 'ok') throw new Error(data?.mensagem || 'erro nos produtos')
        prods += data.produtos_gravados
      }
      setMsg(`✓ ${d1.data.processados} dias processados · ${prods} produtos.`)
      await carregar(comps)
    } catch (e) {
      setMsg('Erro ao puxar: ' + (e as Error).message)
    } finally { setSyncing(false) }
  }

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

  const setPeriodo = (label: string) => {
    const l = label || 'Personalizado'; setPeriodoSel(l); const d = new Date()
    if (l === 'Mês Atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (l === 'Mês Anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const lm = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(lm.toLocaleDateString('en-CA')) }
    else { setDe(''); setAte('') }
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
      default:
        // custo/CMV/margem só quando o produto tem ficha (custo médio > 0); senão "—"
        if (COST_KEYS.has(c.key) && !v.vCustoMedio) return '—'
        return fmt(num(v, c.key), c.fmt)
    }
  }

  const preLista = useMemo(() => {
    const q = norm(busca.trim())
    const filtraLoja = lojaSet.size > 0 && !allSel
    return rows.filter((v) => {
      if (!incluirZerado && (v.vBruta - v.vDesc) === 0) return false
      if (filtraLoja && !lojaSet.has(v.loja)) return false
      if (q && !norm([v.item, v.grupo, v.codigo].join(' ')).includes(q)) return false
      return true
    })
  }, [rows, busca, lojaSet, allSel, incluirZerado])
  const lista = useMemo(() => preLista.filter((v) => Object.entries(colFilters).every(([k, set]) => set.has(cellVal(v, COLS.find((c) => c.key === k)!)))), [preLista, colFilters])

  const distinct = (k: ColKey) => { const c = COLS.find((x) => x.key === k)!; return [...new Set(preLista.map((v) => cellVal(v, c)))].sort() }
  const toggleFiltVal = (k: ColKey, val: string, all: string[]) => setColFilters((prev) => { const cur = new Set(prev[k] ?? all); cur.has(val) ? cur.delete(val) : cur.add(val); const next = { ...prev }; if (cur.size === all.length) delete next[k]; else next[k] = cur; return next })
  const toggleFiltTodos = (k: ColKey, all: string[]) => setColFilters((prev) => { const cur = prev[k] ?? new Set(all); const next = { ...prev }; if (cur.size === all.length) next[k] = new Set(); else delete next[k]; return next })

  const tot = useMemo(() => { const t: Record<string, number> = {}; COLS.filter((c) => c.sum).forEach((c) => { t[c.key] = lista.reduce((a, v) => a + num(v, c.key), 0) }); return t }, [lista, dias])

  const exportCSV = () => {
    if (!lista.length) { setMsg('Nada para exportar.'); return }
    const head = visCols.map((c) => c.label)
    const linhas = lista.map((v) => visCols.map((c) => {
      if (c.key === 'loja') return v.loja
      if (c.key === 'item') return titleCase(v.item)
      if (c.key === 'codigo') return v.codigo
      if (c.key === 'grupo') return titleCase(v.grupo)
      if (COST_KEYS.has(c.key) && !v.vCustoMedio) return '—'
      return +num(v, c.key).toFixed(4)
    }))
    downloadCsv(`engenharia_cardapio_${de}_${ate}.csv`, [head, ...linhas])
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
        <div className="ds-field" style={{ minWidth: 130 }}><label>Período</label>
          <SearchSelect value={periodoSel} options={PERIODO_OPTS} placeholder="Período" onChange={setPeriodo} />
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-field"><label>&nbsp;</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, fontSize: 13, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={incluirZerado} onChange={(e) => setIncluirZerado(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#f97316' }} />
            Incluir itens com valor zerado
          </label>
        </div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={puxar} disabled={syncing || !tenantId}>{syncing ? '⏳ Puxando…' : '↻ Puxar do iComanda'}</button>
          <button className="btn-ghost" onClick={exportCSV}>↓ Exportar</button>
        </div>
      </div>

      <div className="search-row">
        <input className="search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {msg
          ? <span className="mock-tag" style={{ background: msg.startsWith('Erro') ? '#fee2e2' : '#dcfce7', color: msg.startsWith('Erro') ? '#b91c1c' : '#166534', borderColor: 'transparent' }}>{msg}</span>
          : loading ? <span className="mock-tag">Carregando vendas…</span>
          : <span className="mock-tag" style={{ background: '#fff7ed', color: '#9a3412', borderColor: 'transparent' }}>● Vendas reais — custo/margem em "—" até cadastrar a ficha do produto</span>}
        {bloqueados.length > 0 && <span className="mock-tag" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: 'transparent' }} title={bloqueados.join(', ')}>⛔ {bloqueados.length} loja×mês ainda não recebido(s) no portão</span>}
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
              : <>
                {lista.map((v) => <tr key={v.id}>{visCols.map((c) => <td key={c.key} className={c.cls}>{cellVal(v, c)}</td>)}</tr>)}
                <tr className="fill" aria-hidden="true"><td colSpan={visCols.length} /></tr>
              </>}
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
