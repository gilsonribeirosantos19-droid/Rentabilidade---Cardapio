import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './fiscal.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; ativo?: boolean }
type Forn = { id: string; nome: string; cnpj?: string }
type IFV = { id: string; insumo_id: string; fornecedor_id?: string | null; descricao_fornecedor?: string; codigo_fornecedor?: string; embalagem_descricao?: string; qtd_por_embalagem?: number | null; embalagem_padrao?: boolean }

type Prob = 'sem' | 'suspeito' | 'ok'
type Row = { id: string; insumo_id: string; fornNome: string; descForn: string; codForn: string; insNome: string; unidade: string; emb: string; fator: number | null; problema: Prob; motivo: string }

const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const fmtF = (v: number | null) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

// Embalagens que implicam MAIS de 1 unidade — se o fator vier 1, é suspeito.
const MULTIPACK = /\b(caixa|cx|cxa|fardo|fd|fdo|pacote|pct|pcte|saco|sc|engradado|d[uú]zia|dz|pack|cartela|bandeja|bdj|display|master|resma|blister|kit|jogo|conjunto|cj)\b/i

function auditar(v: IFV, insMap: Record<string, Insumo>): { problema: Prob; motivo: string } {
  const emb = (v.embalagem_descricao || '').trim()
  const fator = v.qtd_por_embalagem
  if (!insMap[v.insumo_id]) return { problema: 'suspeito', motivo: 'Item interno não encontrado (vínculo órfão)' }
  if (fator == null || Number(fator) === 0) return { problema: 'sem', motivo: 'Sem fator de conversão' }
  if (Number(fator) < 0) return { problema: 'suspeito', motivo: 'Fator negativo' }
  if (emb && MULTIPACK.test(emb) && Number(fator) <= 1) return { problema: 'suspeito', motivo: `Embalagem "${emb}" com fator ${fmtF(Number(fator))}` }
  return { problema: 'ok', motivo: 'Conversão definida' }
}

export function AuditoriaConversao() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [fForn, setFForn] = useState('')
  const [busca, setBusca] = useState('')
  const [showSem, setShowSem] = useState(true), [showSusp, setShowSusp] = useState(true), [showOk, setShowOk] = useState(false)
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(50)
  const [editId, setEditId] = useState<string | null>(null); const [editVal, setEditVal] = useState('')
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const { data: ifv = [], isLoading } = useQuery({ queryKey: ['aud-ifv', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<IFV>((f, t) => supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: insumos = [] } = useQuery({ queryKey: ['aud-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,ativo').eq('tenant_id', tenantId).order('nome').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['aud-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome,cnpj').eq('tenant_id', tenantId); return (data ?? []) as Forn[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fornMap = useMemo(() => Object.fromEntries(fornecedores.map((f) => [f.id, f.nome])) as Record<string, string>, [fornecedores])

  const rows = useMemo<Row[]>(() => ifv.map((v) => {
    const a = auditar(v, insMap)
    const ins = insMap[v.insumo_id]
    return {
      id: v.id, insumo_id: v.insumo_id,
      fornNome: (v.fornecedor_id && fornMap[v.fornecedor_id]) || '—',
      descForn: v.descricao_fornecedor || v.embalagem_descricao || '—',
      codForn: v.codigo_fornecedor || '',
      insNome: ins?.nome || '(item inexistente)',
      unidade: ins?.unidade_medida || '',
      emb: v.embalagem_descricao || '—',
      fator: v.qtd_por_embalagem == null ? null : Number(v.qtd_por_embalagem),
      problema: a.problema, motivo: a.motivo,
    }
  }), [ifv, insMap, fornMap])

  const cnt = useMemo(() => ({ total: rows.length, sem: rows.filter((r) => r.problema === 'sem').length, susp: rows.filter((r) => r.problema === 'suspeito').length, ok: rows.filter((r) => r.problema === 'ok').length }), [rows])

  const fornOpts = useMemo(() => Array.from(new Set(rows.map((r) => r.fornNome))).filter((n) => n !== '—').sort((a, b) => a.localeCompare(b)), [rows])

  const filtradas = useMemo(() => {
    const b = norm(busca)
    return rows.filter((r) => {
      if (r.problema === 'sem' && !showSem) return false
      if (r.problema === 'suspeito' && !showSusp) return false
      if (r.problema === 'ok' && !showOk) return false
      if (fForn && r.fornNome !== fForn) return false
      if (b && !(norm(r.insNome) + ' ' + norm(r.descForn) + ' ' + norm(r.emb) + ' ' + norm(r.codForn)).includes(b)) return false
      return true
    }).sort((a, b2) => {
      const ord: Record<Prob, number> = { sem: 0, suspeito: 1, ok: 2 }
      if (ord[a.problema] !== ord[b2.problema]) return ord[a.problema] - ord[b2.problema]
      return a.fornNome.localeCompare(b2.fornNome) || a.insNome.localeCompare(b2.insNome)
    })
  }, [rows, busca, showSem, showSusp, showOk, fForn])

  const totalPags = Math.max(1, Math.ceil(filtradas.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = filtradas.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const salvarMut = useMutation({
    mutationFn: async ({ id, fator }: { id: string; fator: number }) => { const { error } = await supabase.from('insumo_fornecedores').update({ qtd_por_embalagem: fator }).eq('id', id); if (error) throw error },
    onSuccess: () => { setEditId(null); qc.invalidateQueries({ queryKey: ['aud-ifv', tenantId] }); showToast('Fator de conversão atualizado.', 'ok') },
    onError: (e: Error) => showToast('Erro ao salvar: ' + e.message, 'err'),
  })
  const salvar = (r: Row) => { const f = parseFloat(editVal.replace(',', '.')); if (!(f > 0)) { showToast('Informe um fator maior que zero.', 'err'); return } salvarMut.mutate({ id: r.id, fator: Math.round(f * 1000) / 1000 }) }

  const exportCSV = () => {
    if (!filtradas.length) { showToast('Nada para exportar.', 'err'); return }
    const head = ['Situação', 'Fornecedor', 'Descrição do fornecedor', 'Cód. Forn.', 'Item interno', 'Un.', 'Embalagem', 'Fator', 'Motivo']
    const body = filtradas.map((r) => [r.problema === 'sem' ? 'Sem conversão' : r.problema === 'suspeito' ? 'Suspeito' : 'OK', r.fornNome, r.descForn, r.codForn, r.insNome, r.unidade, r.emb, r.fator == null ? '' : String(r.fator).replace('.', ','), r.motivo])
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria_conversao.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const limpar = () => { setFForn(''); setBusca(''); setPag(1) }
  const chip = (on: boolean, set: (v: boolean) => void, cor: string, label: string, n: number) => (
    <label className="sit-chip" style={on ? { borderColor: cor } : undefined}>
      <input type="checkbox" checked={on} onChange={(e) => { set(e.target.checked); setPag(1) }} />
      <span className="dot" style={{ background: cor }} />{label}<span className="cnt">{n}</span>
    </label>
  )

  return (
    <div className="fiscal-screen">
      <div className="fh-title">Auditoria de Conversão</div>
      <div className="fh-sub">Confere o fator de conversão dos vínculos item × fornecedor — o que entra errado no estoque começa aqui.</div>

      <div className="sit-row" style={{ marginTop: 14 }}>
        {chip(showSem, setShowSem, '#dc2626', 'Sem conversão', cnt.sem)}
        {chip(showSusp, setShowSusp, '#f59e0b', 'Suspeito', cnt.susp)}
        {chip(showOk, setShowOk, '#16a34a', 'OK', cnt.ok)}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>de {cnt.total.toLocaleString('pt-BR')} vínculos</span>
        <div className="act-r"><button className="btn-g" onClick={exportCSV}>↓ Exportar</button></div>
      </div>

      <div className="fl-bar">
        <SearchSelect value={fForn} options={['Todos os fornecedores', ...fornOpts]} placeholder="Fornecedor: Todos" onChange={(nm) => { setFForn(nm === 'Todos os fornecedores' ? '' : nm); setPag(1) }} />
        <input className="field" style={{ minWidth: 240 }} placeholder="Buscar item, embalagem, código…" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} />
        <button className="btn-g" onClick={limpar}>Limpar</button>
      </div>

      <div className="summary">
        <span>{filtradas.length.toLocaleString('pt-BR')} vínculo{filtradas.length !== 1 ? 's' : ''} listado{filtradas.length !== 1 ? 's' : ''}</span>
        {(cnt.sem + cnt.susp) > 0 && <span>⚠ <b style={{ color: '#dc2626' }}>{(cnt.sem + cnt.susp).toLocaleString('pt-BR')}</b> com problema de conversão</span>}
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th className="c" style={{ width: 34 }}></th>
            <th>Fornecedor</th>
            <th>Descrição na nota / fornecedor</th>
            <th>Cód. Forn.</th>
            <th>Item interno</th>
            <th className="c">Un.</th>
            <th>Embalagem</th>
            <th className="r">Fator</th>
            <th>Situação</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={9} className="empty">Nenhum vínculo com os filtros atuais. 🎉</td></tr>
              : page.map((r) => {
                const cor = r.problema === 'sem' ? '#dc2626' : r.problema === 'suspeito' ? '#f59e0b' : '#16a34a'
                return (
                  <tr key={r.id}>
                    <td className="c"><span className="stat-dot" style={{ background: cor }} title={r.motivo} /></td>
                    <td className="fornec">{r.fornNome}</td>
                    <td>{r.descForn}</td>
                    <td className="mono" style={{ color: '#64748b' }}>{r.codForn || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.insNome}</td>
                    <td className="c mono" style={{ color: '#94a3b8' }}>{r.unidade || '—'}</td>
                    <td>{r.emb}</td>
                    <td className="r mono">
                      {editId === r.id
                        ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <input className="field" style={{ width: 78, height: 26, textAlign: 'right' }} autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar(r); if (e.key === 'Escape') setEditId(null) }} />
                            <button className="lnk-btn" style={{ height: 26, padding: '0 7px', color: '#16a34a' }} onClick={() => salvar(r)}>✓</button>
                            <button className="lnk-btn" style={{ height: 26, padding: '0 7px' }} onClick={() => setEditId(null)}>✕</button>
                          </span>
                        : <span style={{ color: r.fator == null ? '#dc2626' : '#0f172a', fontWeight: 700 }}>{fmtF(r.fator)}</span>}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: cor, fontWeight: 700, fontSize: 11 }}>{r.problema === 'sem' ? 'Sem conversão' : r.problema === 'suspeito' ? 'Suspeito' : 'OK'}</span>
                        {r.problema !== 'ok' && <span style={{ fontSize: 10, color: '#94a3b8' }}>{r.motivo}</span>}
                        {editId !== r.id && <button className="cor-ico" title="Corrigir fator" onClick={() => { setEditId(r.id); setEditVal(r.fator == null ? '' : String(r.fator)) }}>✎</button>}
                      </span>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      <div className="pag-row">
        <span>{filtradas.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, filtradas.length)} de ${filtradas.length.toLocaleString('pt-BR')}` : 'Nenhum registro'}</span>
        <div style={{ display: 'flex', gap: 4 }}><button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Itens por página:<select className="field" style={{ height: 30, width: 70 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></div>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
