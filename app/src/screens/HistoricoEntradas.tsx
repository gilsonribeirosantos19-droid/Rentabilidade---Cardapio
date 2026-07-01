import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Ent = { id: string; insumo_id: string; loja_id?: string | null; quantidade?: number; unidade_compra?: string; custo_unitario?: number; custo_total?: number; nfe_numero?: string | null; nfe_chave?: string | null; fornecedor_id?: string | null; fornecedor_nome?: string | null; status?: string | null; criado_em?: string }
type Insumo = { id: string; nome: string; unidade_medida?: string }
type Forn = { id: string; nome: string }
type Loja = { id: string; nome: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtD = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primeiroDiaMes = () => { const d = new Date(); return isoD(new Date(d.getFullYear(), d.getMonth(), 1)) }
const totalDe = (e: Ent) => e.custo_total != null ? Number(e.custo_total) : Number(e.quantidade || 0) * Number(e.custo_unitario || 0)

const STATUS_CFG: Record<string, { bg: string; color: string }> = {
  'Conferida': { bg: '#dcfce7', color: '#16a34a' },
  'Importada': { bg: '#dbeafe', color: '#2563eb' },
  'Pendente vínculo': { bg: '#ffedd5', color: '#ea580c' },
  'Divergência': { bg: '#fee2e2', color: '#dc2626' },
}
function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: '#94a3b8' }}>—</span>
  const s = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#64748b' }
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
}

export function HistoricoEntradas() {
  const { tenantId } = useAuth()
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(isoD(new Date()))
  const [fForn, setFForn] = useState(''); const [fIns, setFIns] = useState('')
  const [applied, setApplied] = useState({ de: primeiroDiaMes(), ate: isoD(new Date()), forn: '', ins: '' })
  const [sortAsc, setSortAsc] = useState(false)
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(25)
  const [nfeAberta, setNfeAberta] = useState<string | null>(null)

  const { data: insumos = [] } = useQuery({ queryKey: ['he-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['he-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Forn[] } })
  const { data: lojas = [] } = useQuery({ queryKey: ['he-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Loja[] } })
  const { data: ents = [], isLoading, isFetching } = useQuery({
    queryKey: ['he-ents', tenantId, applied.de, applied.ate, applied.forn, applied.ins], enabled: !!tenantId,
    queryFn: () => fetchAll<Ent>((f, t) => {
      let q = supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false })
      if (applied.de) q = q.gte('criado_em', applied.de + 'T00:00:00')
      if (applied.ate) q = q.lte('criado_em', applied.ate + 'T23:59:59')
      if (applied.forn) q = q.eq('fornecedor_id', applied.forn)
      if (applied.ins) q = q.eq('insumo_id', applied.ins)
      return q.range(f, t)
    }),
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f.nome])) as Record<string, string>, [fornecedores])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const insByNome = useMemo(() => { const m: Record<string, string> = {}; insumos.forEach((i) => { m[i.nome] = i.id }); return m }, [insumos])
  const fornByNome = useMemo(() => { const m: Record<string, string> = {}; fornecedores.forEach((f) => { m[f.nome] = f.id }); return m }, [fornecedores])

  const grupos = useMemo(() => {
    const g: Record<string, Ent[]> = {}
    ents.forEach((e) => { const key = e.nfe_numero || `__manual__${e.id}`; (g[key] ||= []).push(e) })
    const arr = Object.entries(g).map(([key, itens]) => {
      const p = itens[0]
      return { key, itens, primeiro: p, fornNome: (p.fornecedor_id && fornMap[p.fornecedor_id]) || p.fornecedor_nome || '—', lojaNome: lojaMap[p.loja_id || ''] || '—', total: itens.reduce((a, e) => a + totalDe(e), 0), temNFe: !!p.nfe_numero, data: p.criado_em || '' }
    })
    arr.sort((a, b) => (sortAsc ? 1 : -1) * b.data.localeCompare(a.data))
    return arr
  }, [ents, fornMap, lojaMap, sortAsc])

  const kpis = useMemo(() => ({ notas: grupos.length, valor: ents.reduce((a, e) => a + totalDe(e), 0), nfe: grupos.filter((g) => g.temNFe).length, manual: grupos.filter((g) => !g.temNFe).length }), [grupos, ents])

  const totalPags = Math.max(1, Math.ceil(grupos.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = grupos.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const consultar = () => { setApplied({ de, ate, forn: fForn, ins: fIns }); setPag(1) }
  const itensNfe = useMemo(() => nfeAberta ? ents.filter((e) => e.nfe_numero === nfeAberta) : [], [nfeAberta, ents])

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Data inicial</label><input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>Data final</label><input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-field" style={{ width: 200 }}><label>Fornecedor</label>
          <SearchSelect value={fForn ? (fornMap[fForn] || '') : ''} options={['Todos', ...fornecedores.map((f) => f.nome)]} placeholder="Todos" onChange={(nm) => setFForn(nm === 'Todos' ? '' : (fornByNome[nm] || ''))} />
        </div>
        <div className="ds-field" style={{ width: 200 }}><label>Insumo</label>
          <SearchSelect value={fIns ? (insMap[fIns]?.nome || '') : ''} options={['Todos', ...insumos.map((i) => i.nome)]} placeholder="Todos" onChange={(nm) => setFIns(nm === 'Todos' ? '' : (insByNome[nm] || ''))} />
        </div>
        <div className="ds-actions"><button className="btn-primary" onClick={consultar}>🔍 Consultar</button></div>
      </div>

      <div className="kpi-bar">
        <div className="kpi-cell" style={{ flex: 1 }}><div className="l">Total de notas</div><div className="v">{kpis.notas.toLocaleString('pt-BR')}</div></div>
        <div className="kpi-cell" style={{ flex: 2 }}><div className="l">Valor total das entradas</div><div className="v">{brl(kpis.valor)}</div></div>
        <div className="kpi-cell" style={{ flex: 1 }}><div className="l">NF-e lançadas</div><div className="v">{kpis.nfe.toLocaleString('pt-BR')}</div></div>
        <div className="kpi-cell" style={{ flex: 1, borderRight: 'none' }}><div className="l">Notas manuais</div><div className="v">{kpis.manual.toLocaleString('pt-BR')}</div></div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th className="sortable" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortAsc((a) => !a)}>DATA {sortAsc ? '↑' : '↓'}</th>
            <th>FORNECEDOR</th><th>Nº NF-e</th><th>TIPO</th><th>ITENS</th><th className="r">VALOR TOTAL</th><th>LOJA</th><th>STATUS</th><th className="c">AÇÕES</th>
          </tr></thead>
          <tbody>
            {(isLoading || isFetching) ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={9} className="empty">Nenhuma entrada encontrada no período.</td></tr>
              : page.map((g) => (
                <tr key={g.key}>
                  <td className="mono" style={{ fontSize: 12, color: '#334155' }}>{fmtD(g.data)}</td>
                  <td style={{ fontWeight: 500, color: '#334155' }}>{g.fornNome}</td>
                  <td>{g.temNFe ? <span style={{ color: '#0d9488', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setNfeAberta(g.primeiro.nfe_numero!)}>{g.primeiro.nfe_numero}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: '#334155' }}>{g.temNFe ? 'NF-e' : 'Manual'}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{g.itens.length} {g.itens.length > 1 ? 'itens' : 'item'}</td>
                  <td className="r mono" style={{ fontWeight: 600, color: '#334155' }}>{brl(g.total)}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{g.lojaNome}</td>
                  <td><StatusBadge status={g.primeiro.status} /></td>
                  <td className="c">{g.temNFe ? <button className="icon-btn" title="Ver NF-e" onClick={() => setNfeAberta(g.primeiro.nfe_numero!)}>👁</button> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="pag-bar">
        <span>{grupos.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, grupos.length)} de ${grupos.length.toLocaleString('pt-BR')} · Total geral ` : 'Nenhum registro'}{grupos.length ? <strong style={{ color: '#0f172a', fontFamily: "'DM Mono', monospace" }}>{brl(kpis.valor)}</strong> : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
          <select className="field" style={{ height: 30 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={10}>10 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select>
        </div>
      </div>
      </div>

      {nfeAberta && <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setNfeAberta(null) }}>
        <div className="modal" style={{ width: 'min(640px, 95vw)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div><h2 style={{ marginBottom: 2 }}>NF-e Nº {nfeAberta}</h2>{itensNfe[0]?.nfe_chave && <div style={{ fontSize: 11, color: '#94a3b8' }} className="mono">Chave: {itensNfe[0].nfe_chave}</div>}</div>
            <button className="icon-btn" onClick={() => setNfeAberta(null)}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14, fontSize: 13 }}>
            <div><span style={{ color: '#94a3b8', fontSize: 11 }}>FORNECEDOR</span><br /><b>{(itensNfe[0]?.fornecedor_id && fornMap[itensNfe[0].fornecedor_id]) || itensNfe[0]?.fornecedor_nome || '—'}</b></div>
            <div><span style={{ color: '#94a3b8', fontSize: 11 }}>DATA</span><br /><b>{fmtD(itensNfe[0]?.criado_em)}</b></div>
            <div><span style={{ color: '#94a3b8', fontSize: 11 }}>LOJA</span><br /><b>{lojaMap[itensNfe[0]?.loja_id || ''] || '—'}</b></div>
            <div><span style={{ color: '#94a3b8', fontSize: 11 }}>TOTAL DA NOTA</span><br /><b style={{ color: '#059669' }}>{brl(itensNfe.reduce((a, e) => a + totalDe(e), 0))}</b></div>
          </div>
          <div style={{ border: '1px solid #e7ebf0', borderRadius: 10, overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Insumo</th><th>Un.</th><th className="r">Qtd.</th><th className="r">V. Unit.</th><th className="r">V. Total</th></tr></thead>
              <tbody>
                {itensNfe.map((e, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{insMap[e.insumo_id]?.nome || '—'}</td><td style={{ color: '#94a3b8' }}>{e.unidade_compra || '—'}</td><td className="r mono">{qtd(e.quantidade)}</td><td className="r mono">{brl(e.custo_unitario)}</td><td className="r mono" style={{ fontWeight: 600 }}>{brl(totalDe(e))}</td></tr>)}
              </tbody>
              <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}><td colSpan={4}>Total</td><td className="r mono">{brl(itensNfe.reduce((a, e) => a + totalDe(e), 0))}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>}
    </div>
  )
}
