import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './fiscal.css'

type Insumo = { id: string; nome: string; codigo_interno?: string | number; unidade_medida?: string }
type Ent = { id: string; criado_em?: string; insumo_id: string; loja_id?: string | null; fator_conversao?: number | null; quantidade?: number | null; quantidade_fornecedor?: number | null; unidade_compra?: string | null; fornecedor_nome?: string | null; nfe_numero?: string | null }
type Nota = { numero?: string | number | null; serie?: string | number | null; valor_total?: number | null }
type Vinc = { insumo_id?: string; codigo_nfe?: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt3 = (v: number) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fmtFator = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const fmtCod = (c?: string | number | null) => (c != null && c !== '' ? String(c).padStart(6, '0') : '')
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primeiroDiaMes = () => { const d = new Date(); return isoD(new Date(d.getFullYear(), d.getMonth(), 1)) }
const hoje = () => isoD(new Date())

export function AuditoriaConversao() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hoje())
  const [insId, setInsId] = useState('')
  const [loja, setLoja] = useState('')
  const [applied, setApplied] = useState({ de: primeiroDiaMes(), ate: hoje(), insId: '', loja: '' })
  const [fForn, setFForn] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFil, setStatusFil] = useState('')

  const { data: insumos = [] } = useQuery({ queryKey: ['aud-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,codigo_interno,unidade_medida').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: notas = [] } = useQuery({ queryKey: ['aud-notas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Nota>((f, t) => supabase.from('nfe_recebidas').select('numero,serie,valor_total').eq('tenant_id', tenantId).range(f, t)) })
  const { data: vincs = [] } = useQuery({ queryKey: ['aud-vincs', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Vinc>((f, t) => supabase.from('vinculos_nfe').select('insumo_id,codigo_nfe').eq('tenant_id', tenantId).range(f, t)) })
  const { data: ents = [], isLoading, isFetching } = useQuery({
    queryKey: ['aud-ents', tenantId, applied.de, applied.ate, applied.insId, applied.loja], enabled: !!tenantId,
    queryFn: () => fetchAll<Ent>((f, t) => {
      let q = supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false })
      if (applied.loja) q = q.eq('loja_id', applied.loja)
      if (applied.insId) q = q.eq('insumo_id', applied.insId)
      if (applied.de) q = q.gte('criado_em', applied.de + 'T00:00:00')
      if (applied.ate) q = q.lte('criado_em', applied.ate + 'T23:59:59')
      return q.range(f, t)
    }),
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const insOpts = useMemo(() => insumos.map((i) => i.nome), [insumos])
  const insByNome = useMemo(() => { const m: Record<string, string> = {}; insumos.forEach((i) => { m[i.nome] = i.id }); return m }, [insumos])
  const notaMap = useMemo(() => { const m: Record<string, number> = {}; notas.forEach((n) => { if (n.numero == null) return; m[`${n.numero}/${n.serie}`] = Number(n.valor_total) || 0; if (m[`${n.numero}`] == null) m[`${n.numero}`] = Number(n.valor_total) || 0 }); return m }, [notas])
  const codFornMap = useMemo(() => { const m: Record<string, string> = {}; vincs.forEach((v) => { if (v.insumo_id && v.codigo_nfe && !m[v.insumo_id]) m[v.insumo_id] = v.codigo_nfe }); return m }, [vincs])

  const rows = useMemo(() => ents.map((e) => {
    const ins = insMap[e.insumo_id]
    const fator = Number(e.fator_conversao) || 1
    const qtdForn = Number(e.quantidade_fornecedor) || parseFloat((Number(e.quantidade) / fator).toFixed(4))
    const qtdEst = Number(e.quantidade) || 0
    const esperado = parseFloat((qtdForn * fator).toFixed(4))
    const dif = parseFloat((qtdEst - esperado).toFixed(4))
    const suspeito = fator === 1 && !!e.unidade_compra && (e.unidade_compra || '').toLowerCase() !== (ins?.unidade_medida || '').toLowerCase()
    const erro = Math.abs(dif) > 0.001
    const nrDanfe = e.nfe_numero || ''
    const valorNota = notaMap[nrDanfe] != null ? notaMap[nrDanfe] : notaMap[`${nrDanfe.split('/')[0]}`]
    const codItem = fmtCod(ins?.codigo_interno)
    const codForn = codFornMap[e.insumo_id] || ''
    const unidMed = ins?.unidade_medida || ''
    const busca = [ins?.nome, e.fornecedor_nome, nrDanfe, codItem, codForn].join(' ').toLowerCase()
    return { e, ins, fator, qtdForn, qtdEst, esperado, dif, suspeito, erro, nrDanfe, valorNota, codItem, codForn, unidMed, busca, lojaNome: lojaMap[e.loja_id || ''] || '' }
  }), [ents, insMap, notaMap, codFornMap, lojaMap])

  const fornOpts = useMemo(() => Array.from(new Set(rows.map((r) => r.e.fornecedor_nome).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows])

  const filtradas = useMemo(() => {
    const termo = norm(busca)
    return rows.filter((r) => {
      if (statusFil === 'Erro' && !r.erro) return false
      if (statusFil === 'Suspeito' && !(r.suspeito && !r.erro)) return false
      if (statusFil === 'OK' && !(!r.suspeito && !r.erro)) return false
      if (fForn && r.e.fornecedor_nome !== fForn) return false
      if (termo && !r.busca.includes(termo)) return false
      return true
    })
  }, [rows, statusFil, fForn, busca])

  const consultar = () => { setApplied({ de, ate, insId, loja }) }

  const statusCell = (suspeito: boolean, erro: boolean) => {
    if (erro) return <span style={{ color: '#e11d48', fontWeight: 700, fontSize: 12 }}>Erro</span>
    if (suspeito) return <span style={{ color: '#f97316', fontWeight: 700, fontSize: 12 }}>Suspeito</span>
    return <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12 }}>OK</span>
  }
  const difCell = (dif: number, esperado: number) => {
    if (Math.abs(dif) < 0.001) return <span style={{ color: '#94a3b8' }}>{fmt3(0)} (0%)</span>
    const pct = esperado > 0 ? dif / esperado * 100 : 0
    const sign = dif > 0 ? '+' : ''
    const pctStr = (pct > 0 ? '+' : '') + pct.toFixed(0)
    return <span style={{ color: dif < 0 ? '#e11d48' : '#16a34a', fontSize: 12, fontWeight: 600 }}>{sign}{fmt3(dif)} ({pctStr}%)</span>
  }

  return (
    <div className="fiscal-screen">
      <div className="fh-title">Auditoria de Conversão</div>
      <div className="fh-sub">Auditoria de fator de conversão nas entradas de NF-e.</div>

      <div className="fl-bar" style={{ alignItems: 'flex-end' }}>
        <div className="aud-fg" style={{ width: 150 }}>
          <div className="aud-lb">D. Inicial</div>
          <input type="date" className="field" style={{ width: '100%' }} value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="aud-fg" style={{ width: 150 }}>
          <div className="aud-lb">D. Final</div>
          <input type="date" className="field" style={{ width: '100%' }} value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="aud-fg" style={{ width: 230 }}>
          <div className="aud-lb">Insumo</div>
          <SearchSelect value={insId ? (insMap[insId]?.nome || '') : ''} options={['Todos', ...insOpts]} placeholder="Todos" onChange={(nm) => setInsId(nm === 'Todos' ? '' : (insByNome[nm] || ''))} />
        </div>
        <div className="aud-fg" style={{ width: 230 }}>
          <div className="aud-lb">Fornecedor</div>
          <SearchSelect value={fForn} options={['Todos', ...fornOpts]} placeholder="Todos" onChange={(nm) => { setFForn(nm === 'Todos' ? '' : nm) }} />
        </div>
        <div className="aud-fg" style={{ width: 170 }}>
          <div className="aud-lb">Loja</div>
          <select className="field" style={{ width: '100%' }} value={loja} onChange={(e) => setLoja(e.target.value)}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        </div>
        <div className="aud-fg" style={{ width: 230 }}>
          <div className="aud-lb">Pesquisar</div>
          <input type="text" className="field" style={{ width: '100%' }} placeholder="Descrição, nº DANFE, código…" value={busca} onChange={(e) => { setBusca(e.target.value) }} />
        </div>
        <button className="btn-xml" onClick={consultar} style={{ background: '#f97316' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          Consultar
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 14px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => { setStatusFil(statusFil === 'Suspeito' ? '' : 'Suspeito') }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />Suspeito — fator de conversão igual a 1 com embalagem declarada</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => { setStatusFil(statusFil === 'Erro' ? '' : 'Erro') }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />Erro — diferença entre esperado e lançado</span>
        {statusFil && <span style={{ color: '#f97316', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setStatusFil('') }}>✕ limpar filtro ({statusFil})</span>}
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll aud-scroll">
        <table className="tbl">
          <thead><tr>
            <th style={{ whiteSpace: 'nowrap' }}>DATA EMISSÃO</th>
            <th>DESCRIÇÃO DO ITEM</th>
            <th>CÓD. ITEM</th>
            <th>CÓD. FORNECEDOR</th>
            <th>LOJA</th>
            <th>FORNECEDOR</th>
            <th>NR DANFE</th>
            <th className="r">VALOR DANF</th>
            <th className="r">QTD FORNECEDOR</th>
            <th>UNIDADE MEDIDA</th>
            <th className="r">FATOR</th>
            <th className="r">QTD ESTOQUE</th>
            <th className="r">ESPERADO</th>
            <th className="r">DIFERENÇA</th>
            <th>STATUS</th>
          </tr></thead>
          <tbody>
            {(isLoading || isFetching) ? <tr><td colSpan={15} className="empty">Carregando…</td></tr>
              : filtradas.length === 0 ? <tr><td colSpan={15} className="empty">Nenhum lançamento encontrado.</td></tr>
              : filtradas.map((r) => {
                const dataHora = r.e.criado_em ? new Date(r.e.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
                return (
                  <tr key={r.e.id}>
                    <td className="mono" style={{ fontSize: 11, color: '#334155', whiteSpace: 'nowrap' }}>{dataHora}</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>{r.ins?.nome || '—'}</td>
                    <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{r.codItem || '—'}</td>
                    <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{r.codForn || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{r.lojaNome || '—'}</td>
                    <td className="fornec" style={{ fontSize: 12, color: '#334155' }}>{r.e.fornecedor_nome || '—'}</td>
                    <td className="mono" style={{ fontSize: 12, color: '#334155' }}>{r.nrDanfe || '—'}</td>
                    <td className="r mono" style={{ color: '#334155' }}>{r.valorNota != null ? brl(r.valorNota) : '—'}</td>
                    <td className="r mono" style={{ color: '#334155' }}>{fmt3(r.qtdForn)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{r.unidMed || '—'}</td>
                    <td className="r mono" style={{ color: '#334155' }}>{fmtFator(r.fator)}</td>
                    <td className="r mono" style={{ color: '#334155' }}>{fmt3(r.qtdEst)}</td>
                    <td className="r mono" style={{ color: '#64748b' }}>{fmt3(r.esperado)}</td>
                    <td className="r">{difCell(r.dif, r.esperado)}</td>
                    <td>{statusCell(r.suspeito, r.erro)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      <div className="pag-row">
        <span>{filtradas.length ? `${filtradas.length.toLocaleString('pt-BR')} registro${filtradas.length !== 1 ? 's' : ''}` : 'Nenhum registro'}</span>
      </div>
    </div>
  )
}
