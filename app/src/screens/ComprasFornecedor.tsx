import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import { brl } from '../lib/format'
import { isoD } from '../lib/date'
import { downloadCsv } from '../lib/csv'
import { agruparComprasFornecedor, type EntCompra } from '../lib/comprasFornecedor'
import './estoque.css'

// Compras › Compras por Fornecedor: ranking de quanto compramos de cada fornecedor no período
// e, clicando nele, QUAIS ITENS compramos (qtd, preço médio/mín/máx, valor, nº de compras).
type Insumo = { id: string; nome: string; unidade_medida?: string }
type Forn = { id: string; nome: string }
type Loja = { id: string; nome: string }

const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtD = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const primeiroDiaMes = () => { const d = new Date(); return isoD(new Date(d.getFullYear(), d.getMonth(), 1)) }

export function ComprasFornecedor() {
  const { tenantId } = useAuth()
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(isoD(new Date()))
  const [fLoja, setFLoja] = useState('')
  const [applied, setApplied] = useState({ de: primeiroDiaMes(), ate: isoD(new Date()), loja: '' })
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const { data: insumos = [] } = useQuery({ queryKey: ['cf-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['cf-forn', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Forn>((f, t) => supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['cf-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] } })
  const { data: ents = [], isLoading, isFetching } = useQuery({
    queryKey: ['cf-ents', tenantId, applied.de, applied.ate, applied.loja], enabled: !!tenantId,
    queryFn: () => fetchAll<EntCompra>((f, t) => {
      let q = supabase.from('entradas_estoque').select('id,insumo_id,quantidade,custo_unitario,custo_total,fornecedor_id,fornecedor_nome,nfe_numero,tipo,criado_em').eq('tenant_id', tenantId)
      if (applied.de) q = q.gte('criado_em', applied.de + 'T00:00:00')
      if (applied.ate) q = q.lte('criado_em', applied.ate + 'T23:59:59')
      if (applied.loja) q = q.eq('loja_id', applied.loja)
      return q.order('id').range(f, t)
    }),
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f.nome])) as Record<string, string>, [fornecedores])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const lojaByNome = useMemo(() => { const m: Record<string, string> = {}; lojas.forEach((l) => { m[l.nome] = l.id }); return m }, [lojas])

  const todos = useMemo(() => agruparComprasFornecedor(ents, fornMap), [ents, fornMap])
  const totalGeral = useMemo(() => todos.reduce((a, f) => a + f.valor, 0), [todos])
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (!b) return todos
    // busca por fornecedor OU por item comprado dele
    return todos.filter((f) => f.nome.toLowerCase().includes(b) || f.itens.some((i) => (insMap[i.insumoId]?.nome || '').toLowerCase().includes(b)))
  }, [todos, busca, insMap])

  const consultar = () => { setApplied({ de, ate, loja: fLoja }); setAberto(null) }
  const nomeIns = (id: string) => insMap[id]?.nome || '—'
  const unIns = (id: string) => insMap[id]?.unidade_medida || ''

  const exportar = () => {
    const rows: (string | number)[][] = [['Fornecedor', 'Insumo', 'Unidade', 'Quantidade', 'Preço médio', 'Menor preço', 'Maior preço', 'Valor', 'Nº compras', 'Última compra']]
    lista.forEach((f) => f.itens.forEach((i) => rows.push([f.nome, nomeIns(i.insumoId), unIns(i.insumoId), +i.qtd.toFixed(3), i.qtd > 0 ? +(i.valor / i.qtd).toFixed(4) : 0, +i.precoMin.toFixed(4), +i.precoMax.toFixed(4), +i.valor.toFixed(2), i.compras, fmtD(i.ultima)])))
    downloadCsv(`compras_por_fornecedor_${applied.de}_a_${applied.ate}${applied.loja ? '_' + (lojaMap[applied.loja] || 'loja') : ''}.csv`, rows)
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Data inicial</label><input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>Data final</label><input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-field" style={{ width: 200 }}><label>Loja</label>
          <SearchSelect value={fLoja ? (lojaMap[fLoja] || '') : ''} options={lojas.map((l) => l.nome)} placeholder="Todas" onChange={(nm) => setFLoja(nm === 'Todas' ? '' : (lojaByNome[nm] || ''))} />
        </div>
        <div className="ds-field" style={{ width: 220 }}><label>Buscar fornecedor ou item</label><input className="field" placeholder="Ex.: salmão, Atacadão…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="ds-actions">
          <button className="btn-primary" onClick={consultar}>🔍 Consultar</button>
          <button className="btn-ghost" disabled={!lista.length} onClick={exportar}>⬇ Exportar Excel (CSV)</button>
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 28 }}></th><th>FORNECEDOR</th><th className="r">NOTAS</th><th className="r">ITENS</th><th className="r">VALOR</th><th className="r">% DO TOTAL</th><th>ÚLTIMA COMPRA</th>
          </tr></thead>
          <tbody>
            {(isLoading || isFetching) ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : lista.length === 0 ? <tr><td colSpan={7} className="empty">Nenhuma compra encontrada no período.</td></tr>
              : lista.map((f) => {
                const open = aberto === f.key
                return (
                  <Fragment key={f.key}>
                    <tr style={{ cursor: 'pointer', background: open ? '#eef4ff' : undefined }} onClick={() => setAberto(open ? null : f.key)}>
                      <td className="c" style={{ color: '#64748b' }}>{open ? '▾' : '▸'}</td>
                      <td style={{ color: '#0f172a', fontWeight: 600 }}>{f.nome}</td>
                      <td className="r mono">{f.notas}</td>
                      <td className="r mono">{f.itens.length}</td>
                      <td className="r mono" style={{ fontWeight: 600, color: '#334155' }}>{brl(f.valor)}</td>
                      <td className="r mono" style={{ color: '#64748b' }}>{totalGeral > 0 ? pct((f.valor / totalGeral) * 100) : '—'}</td>
                      <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{fmtD(f.ultima)}</td>
                    </tr>
                    {open && <tr><td colSpan={7} style={{ padding: '6px 10px 14px 38px', background: '#f8fafc' }}>
                      <table className="tbl" style={{ background: '#fff', border: '1px solid #e7ebf0' }}>
                        <thead><tr><th>ITEM COMPRADO</th><th>UN.</th><th className="r">QTD.</th><th className="r">PREÇO MÉDIO</th><th className="r">MENOR</th><th className="r">MAIOR</th><th className="r">VALOR</th><th className="r">COMPRAS</th><th>ÚLTIMA</th></tr></thead>
                        <tbody>
                          {f.itens.map((i) => (
                            <tr key={i.insumoId}>
                              <td>{nomeIns(i.insumoId)}</td>
                              <td style={{ color: '#94a3b8' }}>{unIns(i.insumoId) || '—'}</td>
                              <td className="r mono">{qtd(i.qtd)}</td>
                              <td className="r mono">{brl(i.qtd > 0 ? i.valor / i.qtd : 0)}</td>
                              <td className="r mono" style={{ color: '#64748b' }}>{brl(i.precoMin)}</td>
                              <td className="r mono" style={{ color: '#64748b' }}>{brl(i.precoMax)}</td>
                              <td className="r mono" style={{ fontWeight: 600 }}>{brl(i.valor)}</td>
                              <td className="r mono">{i.compras}</td>
                              <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{fmtD(i.ultima)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}><td colSpan={6}>Total {f.nome}</td><td className="r mono">{brl(f.valor)}</td><td colSpan={2}></td></tr></tfoot>
                      </table>
                    </td></tr>}
                  </Fragment>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="pag-bar">
        <span>{lista.length ? `${lista.length.toLocaleString('pt-BR')} fornecedor(es) · Total ` : 'Nenhum registro'}{lista.length ? <strong style={{ color: '#0f172a', fontFamily: "'DM Mono', monospace" }}>{brl(lista.reduce((a, f) => a + f.valor, 0))}</strong> : ''}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Clique no fornecedor para ver os itens comprados · ajustes e transferências não contam como compra</span>
      </div>
      </div>
    </div>
  )
}
