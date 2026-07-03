import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string; unidade_medida?: string; unidade_compra?: string }
type Ent = { insumo_id: string; criado_em?: string; custo_unitario?: number | null; fornecedor_id?: string | null; fornecedor_nome?: string | null; tipo?: string }

const brl2 = (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const norm = (s?: string) => (s || '').toLowerCase()
const mesLabel = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').toUpperCase().replace(' DE ', '/') }

export function InflacaoInsumos() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const [nMeses, setNMeses] = useState(12)
  const [busca, setBusca] = useState(''); const [cat, setCat] = useState(''); const [fornF, setFornF] = useState('')
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(12)

  const meses = useMemo(() => { const h = new Date(); const out: string[] = []; for (let i = nMeses - 1; i >= 0; i--) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) } return out }, [nMeses])
  const inicio = meses[0] + '-01'

  const { data: insumos = [] } = useQuery({ queryKey: ['inf-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,unidade_medida,unidade_compra').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: entradas = [], isLoading } = useQuery({
    queryKey: ['inf-ent', tenantId, lojaId, inicio], enabled: !!tenantId,
    queryFn: () => fetchAll<Ent>((f, t) => { let q = supabase.from('entradas_estoque').select('insumo_id,criado_em,custo_unitario,fornecedor_id,fornecedor_nome,tipo').eq('tenant_id', tenantId).gte('criado_em', inicio + 'T00:00:00'); if (lojaId) q = q.eq('loja_id', lojaId); return q.range(f, t) }),
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const cats = useMemo(() => [...new Set(insumos.map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [insumos])
  const forns = useMemo(() => { const m: Record<string, string> = {}; entradas.forEach((e) => { if (e.fornecedor_id) m[e.fornecedor_id] = e.fornecedor_nome || e.fornecedor_id }); return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1])) }, [entradas])

  const linhas = useMemo(() => {
    const mapa: Record<string, Record<string, number[]>> = {}
    entradas.forEach((e) => {
      if (!e.criado_em || !e.custo_unitario) return
      const mes = e.criado_em.substring(0, 7)
      if (!meses.includes(mes)) return
      if (fornF && e.fornecedor_id !== fornF) return
      if (e.tipo === 'ajuste' || e.tipo === 'transferencia') return
      ;((mapa[e.insumo_id] ||= {})[mes] ||= []).push(Number(e.custo_unitario))
    })
    return Object.entries(mapa).map(([insId, porMes]) => {
      const ins = insMap[insId]; if (!ins) return null
      if (busca && !norm(ins.nome).includes(norm(busca)) && !norm(ins.categoria).includes(norm(busca))) return null
      if (cat && norm(ins.categoria) !== norm(cat)) return null
      const precos = meses.map((m) => { const a = porMes[m]; return a ? a.reduce((x, v) => x + v, 0) / a.length : null })
      const comDados = precos.filter((p) => p !== null) as number[]
      if (!comDados.length) return null
      const primeiro = comDados[0], ultimo = comDados[comDados.length - 1]
      const varTotal = primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : null
      return { ins, precos, varTotal }
    }).filter(Boolean).sort((a, b) => (b!.varTotal || 0) - (a!.varTotal || 0)) as { ins: Insumo; precos: (number | null)[]; varTotal: number | null }[]
  }, [entradas, meses, fornF, busca, cat, insMap])

  const resumo = useMemo(() => {
    const comVar = linhas.filter((l) => l.varTotal != null)
    if (!comVar.length) return null
    const alta = comVar.reduce((a, b) => (!a || (b.varTotal || 0) > (a.varTotal || 0)) ? b : a)
    const queda = comVar.reduce((a, b) => (!a || (b.varTotal || 0) < (a.varTotal || 0)) ? b : a)
    const media = comVar.reduce((s, l) => s + (l.varTotal || 0), 0) / comVar.length
    const naltas = comVar.filter((l) => (l.varTotal || 0) > 0.5).length
    const nquedas = comVar.filter((l) => (l.varTotal || 0) < -0.5).length
    return { alta, queda, media, naltas, nquedas, estaveis: comVar.length - naltas - nquedas }
  }, [linhas])

  const totalPags = Math.max(1, Math.ceil(linhas.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = linhas.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const exportCSV = () => {
    if (!linhas.length) return
    let csv = 'Insumo;UN;' + meses.join(';') + '\n'
    linhas.forEach(({ ins, precos }) => { csv += `${ins.nome};${ins.unidade_medida || ins.unidade_compra || 'un'};` + precos.map((p) => p != null ? p.toFixed(2) : '').join(';') + '\n' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'inflacao.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Período</label><select className="field" style={{ minWidth: 150 }} value={nMeses} onChange={(e) => { setNMeses(Number(e.target.value)); setPag(1) }}><option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option></select></div>
        <div className="ds-field ds-grow"><label>Buscar</label><input className="field" style={{ width: '100%', minWidth: 220 }} placeholder="Filtrar insumo, categoria..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} /></div>
        <div className="ds-field"><label>Categoria</label><select className="field" value={cat} onChange={(e) => { setCat(e.target.value); setPag(1) }}><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="ds-field"><label>Fornecedor</label><select className="field" value={fornF} onChange={(e) => { setFornF(e.target.value); setPag(1) }}><option value="">Todos</option>{forns.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></div>
        <div className="ds-actions"><button className="btn-ghost" onClick={exportCSV}>↓ Exportar</button></div>
      </div>

      {resumo && <div className="ci-card" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', fontSize: 12, marginBottom: 12, padding: '10px 16px' }}>
        <span>Maior alta: <strong style={{ color: '#f97316' }}>{resumo.alta.ins.nome} (+{(resumo.alta.varTotal || 0).toFixed(1)}%)</strong></span>
        <span>Maior queda: <strong style={{ color: '#16a34a' }}>{resumo.queda.ins.nome} ({(resumo.queda.varTotal || 0).toFixed(1)}%)</strong></span>
        <span>Média da variação: <strong style={{ color: resumo.media > 0 ? '#f97316' : '#16a34a' }}>{resumo.media >= 0 ? '+' : ''}{resumo.media.toFixed(1)}%</strong></span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <span>Altas: <strong style={{ color: '#e11d48' }}>{resumo.naltas}</strong></span>
          <span>Quedas: <strong style={{ color: '#16a34a' }}>{resumo.nquedas}</strong></span>
          <span>Estáveis: <strong style={{ color: '#64748b' }}>{resumo.estaveis}</strong></span>
        </span>
      </div>}

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl inf-tbl" style={{ minWidth: 700 }}>
          <thead>
            <tr><th rowSpan={2} style={{ minWidth: 150 }}>Insumo</th><th rowSpan={2}>UN.</th>{meses.map((m) => <th key={m} colSpan={2} className="c" style={{ borderLeft: '1px solid #e2e8f0' }}>{mesLabel(m)}</th>)}</tr>
            <tr>{meses.map((m) => <Fragment key={m}><th className="r" style={{ borderLeft: '1px solid #e2e8f0' }}>PREÇO</th><th className="r">Δ%</th></Fragment>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="empty" colSpan={2 + meses.length * 2}>Carregando…</td></tr>
              : page.length === 0 ? <tr><td className="empty" colSpan={2 + meses.length * 2}>Nenhum dado de preço no período.</td></tr>
              : page.map(({ ins, precos }) => (
                <tr key={ins.id}>
                  <td style={{ fontWeight: 600 }}>{ins.nome}</td>
                  <td style={{ color: '#94a3b8', fontSize: 10 }}>{ins.unidade_medida || ins.unidade_compra || 'un'}</td>
                  {precos.map((p, i) => {
                    const prev = [...precos].slice(0, i).reverse().find((x) => x != null)
                    let delta: React.ReactNode = <span style={{ color: '#94a3b8', fontSize: 10 }}>0,0%</span>
                    if (prev != null && p != null && Math.abs(p - prev) > 0.001) {
                      const d = ((p - prev) / prev) * 100
                      if (Math.abs(d) >= 0.05) delta = d > 0 ? <span style={{ color: '#e11d48', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>▲ {d.toFixed(1)}%</span> : <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>▼ {Math.abs(d).toFixed(1)}%</span>
                    }
                    return <Fragment key={i}>
                      <td className="r mono" style={{ borderLeft: '1px solid #f1f5f9', color: '#0f172a' }}>{brl2(p || 0)}</td>
                      <td className="r">{delta}</td>
                    </Fragment>
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="pag-bar">
        <span>{linhas.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, linhas.length)} de ${linhas.length} itens` : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
          <select className="field" style={{ height: 30 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={12}>12 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select>
        </div>
      </div>
      </div>
    </div>
  )
}
