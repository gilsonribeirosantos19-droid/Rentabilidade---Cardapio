import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const norm = (s?: string) => (s || '').toLowerCase()

export function CurvaABC() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const [cat, setCat] = useState(''); const [busca, setBusca] = useState('')
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(20)

  const { data: insumos = [], isLoading } = useQuery({ queryKey: ['abc-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldosRaw = [] } = useQuery({ queryKey: ['abc-sld', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).range(f, t)) })

  // agrega saldo por insumo (soma qtd, média do custo médio entre lojas) respeitando a loja
  const saldoMap = useMemo(() => {
    const m: Record<string, { q: number; cm: number; n: number }> = {}
    saldosRaw.filter((s) => !lojaId || s.loja_id === lojaId).forEach((s) => { const e = (m[s.insumo_id] ||= { q: 0, cm: 0, n: 0 }); e.q += Number(s.quantidade) || 0; e.cm += Number(s.custo_medio) || 0; e.n++ })
    Object.values(m).forEach((e) => { if (e.n > 1) e.cm /= e.n })
    return m
  }, [saldosRaw, lojaId])

  const { todos, cats } = useMemo(() => {
    const valTodos = insumos.map((i) => { const s = saldoMap[i.id] || { q: 0, cm: 0 }; return { id: i.id, nome: i.nome, cat: i.categoria || '—', val: s.q * s.cm } }).sort((a, b) => b.val - a.val)
    const totalV = valTodos.reduce((s, v) => s + v.val, 0) || 1
    let acum = 0
    const withClasse = valTodos.map((v, i) => { const pct = v.val / totalV * 100; acum += pct; const cl = acum <= 80 ? 'A' : acum <= 95 ? 'B' : 'C'; return { ...v, idx: i + 1, pct, acum, cl } })
    const cats = [...new Set(insumos.map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { todos: withClasse, totalV, cats }
  }, [insumos, saldoMap])

  const totalV = todos.reduce((s, v) => s + v.val, 0) || 1
  const clA = todos.filter((r) => r.cl === 'A').length, clB = todos.filter((r) => r.cl === 'B').length, clC = todos.filter((r) => r.cl === 'C').length
  const pctC = (n: number) => todos.length ? (n / todos.length * 100).toFixed(1) : '0.0'

  const rows = useMemo(() => todos.filter((v) => { if (cat && v.cat !== cat) return false; if (busca && !norm(v.nome).includes(norm(busca)) && !norm(v.cat).includes(norm(busca))) return false; return true }), [todos, cat, busca])
  const totalPags = Math.max(1, Math.ceil(rows.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = rows.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const exportCSV = () => {
    if (!rows.length) return
    let csv = '#;Insumo;Categoria;Classe;Valor;% Individual;% Acumulada\n'
    rows.forEach((r) => { csv += `${r.idx};${r.nome};${r.cat};${r.cl};${r.val.toFixed(2)};${r.pct.toFixed(2)};${r.acum.toFixed(2)}\n` })
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'curva_abc.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Categoria</label><select className="field" style={{ minWidth: 140 }} value={cat} onChange={(e) => { setCat(e.target.value); setPag(1) }}><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="ds-field ds-grow"><label>Buscar</label><div className="srch"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><input className="field" style={{ width: '100%' }} placeholder="Buscar insumo..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} /></div></div>
        <div className="ds-actions"><button className="btn-ghost" onClick={exportCSV}>↓ Exportar</button></div>
      </div>

      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span>Total de itens: <strong style={{ color: '#0f172a' }}>{todos.length}</strong></span><span style={{ color: '#e2e8f0', margin: '0 4px' }}>|</span>
        <span>Valor total em estoque: <strong style={{ color: '#0f172a' }}>{brl(totalV)}</strong></span><span style={{ color: '#e2e8f0', margin: '0 4px' }}>|</span>
        <span>Classe A: <strong style={{ color: '#e11d48' }}>{clA} itens ({pctC(clA)}%)</strong></span><span style={{ color: '#e2e8f0', margin: '0 4px' }}>|</span>
        <span>Classe B: <strong style={{ color: '#f97316' }}>{clB} itens ({pctC(clB)}%)</strong></span><span style={{ color: '#e2e8f0', margin: '0 4px' }}>|</span>
        <span>Classe C: <strong style={{ color: '#64748b' }}>{clC} itens ({pctC(clC)}%)</strong></span>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th className="c" style={{ width: 44 }}>#</th><th>Insumo</th><th>Categoria</th><th className="c" style={{ width: 60 }}>Classe</th>
            <th className="r">Valor (R$)</th><th className="r">% Individual</th><th className="r">% Acumulada</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={7} className="empty">Sem dados.</td></tr>
              : page.map((v) => (
                <tr key={v.id}>
                  <td className="c mono" style={{ color: '#94a3b8', fontSize: 12 }}>{v.idx}</td>
                  <td style={{ fontWeight: 600 }}>{v.nome}</td>
                  <td style={{ color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{v.cat}</td>
                  <td className="c"><span className={'badge b-' + v.cl}>{v.cl}</span></td>
                  <td className="r mono">{brl(v.val)}</td>
                  <td className="r mono">{v.pct.toFixed(1)}%</td>
                  <td className="r mono">{v.acum.toFixed(1)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="pag-bar">
        <span>{rows.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, rows.length)} de ${rows.length} itens` : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
          <select className="field" style={{ height: 30 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={14}>14 por página</option><option value={20}>20 por página</option><option value={50}>50 por página</option></select>
        </div>
      </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '8px 0', flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />A – Itens que representam até 80% do valor total</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />B – de 80% a 95% do valor total</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />C – acima de 95% do valor total</div>
      </div>
    </div>
  )
}
