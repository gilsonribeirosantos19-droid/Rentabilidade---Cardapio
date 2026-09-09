import { useEffect, useMemo, useRef, useState } from 'react'
import { useToastTipo } from '../lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { gerarDanfeLocal, imprimirDanfeOficial, baixarXml } from '../lib/danfe'
import { SearchSelect } from '../components/SearchSelect'
import { brl } from '../lib/format'
import { isoD } from '../lib/date'
import './fiscal.css'

type Nfe = { id: string; numero?: string; serie?: string; data_emissao?: string; processada_em?: string; nome_emitente?: string; cnpj_emitente?: string; valor_total?: number; chave_acesso?: string; loja_id?: string | null }
type NfeItem = { id?: string; descricao_nfe?: string; codigo_item_fornecedor?: string; quantidade?: number; unidade_nfe?: string; valor_unitario?: number; valor_total?: number }

const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtCnpj = (c?: string) => { const d = (c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—') }
const fmtChave = (c?: string) => { const d = (c || '').replace(/\D/g, ''); return d ? d.replace(/(.{4})/g, '$1 ').trim() : '' }
const q3 = (v?: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
// Período: rótulos do dropdown com busca ↔ valor interno
const PER_OPTS = ['Mês Atual', 'Mês Anterior', 'Todos', 'Período']
const PER_LBL: Record<string, string> = { mes_atual: 'Mês Atual', mes_anterior: 'Mês Anterior', todos: 'Todos', periodo: 'Período' }
const PER_VAL: Record<string, string> = { 'Mês Atual': 'mes_atual', 'Mês Anterior': 'mes_anterior', 'Todos': 'todos', 'Período': 'periodo' }

export function EntradasProcessadas() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const now = new Date()
  const [periodo, setPeriodo] = useState('mes_atual')
  const [de, setDe] = useState(isoD(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(isoD(now))
  const [fForn, setFForn] = useState(''); const [fNum, setFNum] = useState(''); const [fLoja, setFLoja] = useState('')
  const [sortField, setSortField] = useState('processada_em'); const [sortAsc, setSortAsc] = useState(false)
  const [pag, setPag] = useState(1); const [pageSize, setPageSize] = useState(20)
  const [detNfe, setDetNfe] = useState<Nfe | null>(null)
  const [menu, setMenu] = useState<{ nfe: Nfe; top: number; left: number } | null>(null)
  const { toast, setToast, showToast } = useToastTipo(3200)

  // Parâmetro Estoque › "Data de movimentação": filtra pela MESMA data que a entrada usa no estoque
  // (emissão = padrão; processamento). Assim o mês da tela bate com o Fechamento/CMV.
  const { data: critDataMov = 'emissao' } = useQuery({ queryKey: ['ep-param-datamov', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('valor').eq('tenant_id', tenantId).eq('modulo', 'estoque').eq('chave', 'data_movimentacao').limit(1); return (data?.[0]?.valor as string) || 'emissao' } })
  const campoData = critDataMov === 'processamento' ? 'processada_em' : 'data_emissao'

  const { data: nfes = [], isLoading } = useQuery({
    queryKey: ['ep-nfe', tenantId, periodo, de, ate, campoData], enabled: !!tenantId,
    queryFn: () => fetchAll<Nfe>((f, t) => {
      // colunas explícitas (SEM o xml, que é grande) — o XML é buscado só no detalhe da nota
      let q = supabase.from('nfe_recebidas').select('id,numero,serie,data_emissao,processada_em,nome_emitente,cnpj_emitente,valor_total,chave_acesso,loja_id').eq('tenant_id', tenantId).eq('status', 'processada').order(campoData, { ascending: false }).order('id').range(f, t)
      // limites no fuso de Brasília (−03:00), o MESMO que o estoque usa p/ datar a entrada.
      // Sem isso, a comparação sai em UTC e uma nota da virada de mês (ex.: 30/06 à noite) cai no mês errado.
      if (periodo !== 'todos') { if (de) q = q.gte(campoData, de + 'T00:00:00-03:00'); if (ate) q = q.lte(campoData, ate + 'T23:59:59-03:00') }
      return q
    }),
  })
  useEffect(() => { setSortField(campoData); setSortAsc(false) }, [campoData])

  const { data: itensCount = {} } = useQuery({
    queryKey: ['ep-itens-cnt', tenantId], enabled: !!tenantId,
    queryFn: async () => { const rows = await fetchAll<{ nfe_id: string }>((f, t) => supabase.from('nfe_itens').select('nfe_id').eq('tenant_id', tenantId).order('id').range(f, t)); const m: Record<string, number> = {}; rows.forEach((r) => { m[r.nfe_id] = (m[r.nfe_id] || 0) + 1 }); return m },
  })

  const { data: lojas = [] } = useQuery({ queryKey: ['ep-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as { id: string; nome: string }[] } })
  const lojaNome = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const lojaByNome = useMemo(() => Object.fromEntries(lojas.map((l) => [l.nome, l.id])) as Record<string, string>, [lojas])

  const fornecedores = useMemo(() => { const m: Record<string, string> = {}; nfes.forEach((n) => { if (n.cnpj_emitente && n.nome_emitente) m[n.cnpj_emitente] = n.nome_emitente }); return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1])) }, [nfes])
  const fornNomes = useMemo(() => fornecedores.map(([, n]) => n), [fornecedores])
  const fornByNome = useMemo(() => Object.fromEntries(fornecedores.map(([c, n]) => [n, c])) as Record<string, string>, [fornecedores])
  const fornNomeOf = useMemo(() => Object.fromEntries(fornecedores.map(([c, n]) => [c, n])) as Record<string, string>, [fornecedores])

  const filtrada = useMemo(() => {
    const q = fNum.trim()
    const qDigits = q.replace(/\D/g, '')
    let r = nfes.filter((n) => {
      if (fForn && n.cnpj_emitente !== fForn) return false
      if (fLoja && (n.loja_id || '') !== fLoja) return false
      if (q) {
        // campo livre: casa pelo Nº da NF-e OU pelo valor da nota (ex.: "1250", "1.250,50", "1250.50")
        const numeroDigits = (n.numero || '').replace(/\D/g, '')
        const v = Number(n.valor_total) || 0
        const vComma = v.toFixed(2).replace('.', ',')                                              // 1250,50
        const vThousand = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) // 1.250,50
        const okNum = qDigits.length > 0 && numeroDigits.includes(qDigits)
        const okVal = vComma.includes(q) || vThousand.includes(q) || vComma.replace(',', '.').includes(q)
        if (!okNum && !okVal) return false
      }
      return true
    })
    r = [...r].sort((a, b) => {
      let va: any = (a as any)[sortField] || '', vb: any = (b as any)[sortField] || ''
      if (sortField === 'valor_total') { va = Number(va) || 0; vb = Number(vb) || 0 }
      if (va < vb) return sortAsc ? -1 : 1; if (va > vb) return sortAsc ? 1 : -1; return 0
    })
    return r
  }, [nfes, fForn, fLoja, fNum, sortField, sortAsc])

  const totalValor = filtrada.reduce((s, n) => s + (Number(n.valor_total) || 0), 0)
  const totalPags = Math.max(1, Math.ceil(filtrada.length / pageSize))
  const pagAtual = Math.min(pag, totalPags)
  const page = filtrada.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  const sortBy = (f: string) => { if (sortField === f) setSortAsc((a) => !a); else { setSortField(f); setSortAsc(false) }; setPag(1) }
  const aplicarPeriodo = (v: string) => {
    setPeriodo(v); const d = new Date()
    if (v === 'mes_atual') { setDe(isoD(new Date(d.getFullYear(), d.getMonth(), 1))); setAte(isoD(d)) }
    else if (v === 'mes_anterior') { setDe(isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setAte(isoD(new Date(d.getFullYear(), d.getMonth(), 0))) }
    else { setDe(''); setAte('') }
    setPag(1)
  }
  const limpar = () => { setFForn(''); setFNum(''); setFLoja(''); aplicarPeriodo('mes_atual') }

  const estornarMut = useMutation({
    mutationFn: async (n: Nfe) => {
      if (!confirm(`Estornar a NF-e ${n.numero}?\n\nIsto vai REMOVER as entradas dela do estoque, recalcular o custo médio dos itens e devolver a nota ao Monitor para reprocessar.`)) throw new Error('__cancel__')
      if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) throw new Error('__cancel__')
      const { error } = await supabase.rpc('estornar_nfe', { p_nfe_id: n.id }); if (error) throw error
      return n.numero
    },
    onSuccess: (num) => { qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /ep-|sald|entrad/i.test(k) } }); showToast(`NF-e ${num} estornada! Voltou ao Monitor para reprocessar.`, 'ok') },
    onError: (e: Error) => { if (e.message !== '__cancel__') showToast('Erro ao estornar: ' + e.message, 'err') },
  })

  const exportCSV = (rows: Nfe[]) => {
    if (!rows.length) { showToast('Nenhum dado para exportar.', 'err'); return }
    const head = ['NF-e', 'Série', 'D. Emissão', 'D. Processamento', 'Fornecedor', 'CNPJ', 'Loja', 'V. Total', 'Itens']
    const body = rows.map((n) => [n.numero || '', n.serie || '1', fmtDate(n.data_emissao), fmtDate(n.processada_em), n.nome_emitente || '', n.cnpj_emitente || '', lojaNome[n.loja_id || ''] || '', (n.valor_total || 0).toFixed(2).replace('.', ','), itensCount[n.id] || 0])
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `entradas_processadas_${isoD(new Date())}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  useEffect(() => { if (!menu) return; const h = () => setMenu(null); document.addEventListener('click', h); return () => document.removeEventListener('click', h) }, [menu])
  const arrow = (f: string) => sortField === f ? (sortAsc ? ' ↑' : ' ↓') : ''

  return (
    <div className="fiscal-screen">
      <div className="fh-title">Notas Fiscais Processadas</div>
      <div className="fh-sub">Histórico de NF-e confirmadas no estoque</div>
      <div className="fl-bar">
        <SearchSelect value={fForn ? (fornNomeOf[fForn] || '') : ''} options={fornNomes} placeholder="Fornecedor: Todos" onChange={(nm) => { setFForn(nm === 'Todos os fornecedores' ? '' : (fornByNome[nm] || '')); setPag(1) }} />
        {lojas.length > 1 && <div style={{ minWidth: 150 }}><SearchSelect value={fLoja ? (lojaNome[fLoja] || '') : ''} options={lojas.map((l) => l.nome)} placeholder="Loja: Todas" onChange={(nm) => { setFLoja(lojaByNome[nm] || ''); setPag(1) }} /></div>}
        <input className="field" style={{ width: 150 }} placeholder="Nº ou valor da NF-e…" title="Busca pelo número da NF-e ou pelo valor da nota (ex.: 1250 ou 1.250,50)" value={fNum} onChange={(e) => { setFNum(e.target.value); setPag(1) }} />
        <div style={{ minWidth: 150 }}><SearchSelect value={PER_LBL[periodo] || 'Período'} options={PER_OPTS} placeholder="Período" onChange={(l) => aplicarPeriodo(PER_VAL[l] || 'periodo')} /></div>
        <input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('periodo') }} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>até</span>
        <input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('periodo') }} />
        <button className="btn-g" onClick={limpar}>Limpar</button>
        <button className="btn-g" onClick={() => exportCSV(filtrada)}>↓ Exportar</button>
      </div>

      <div className="summary"><span>{filtrada.length.toLocaleString('pt-BR')} registro{filtrada.length !== 1 ? 's' : ''} encontrado{filtrada.length !== 1 ? 's' : ''} <span style={{ color: '#94a3b8', fontWeight: 400 }}>· filtrando por data de {campoData === 'processada_em' ? 'processamento' : 'emissão'}</span></span><span>Valor total filtrado: <span className="sval">{brl(totalValor)}</span></span></div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th className="sortable" onClick={() => sortBy('numero')}>NF-E{arrow('numero')}</th>
            <th className="c">Série</th>
            <th className="sortable" onClick={() => sortBy('data_emissao')}>D. Emissão{arrow('data_emissao')}</th>
            <th className="sortable" onClick={() => sortBy('processada_em')}>D. Processamento{arrow('processada_em')}</th>
            <th>Fornecedor / Razão Social</th>
            <th>Loja</th>
            <th className="r sortable" onClick={() => sortBy('valor_total')}>V. Total{arrow('valor_total')}</th>
            <th className="c">Itens</th><th className="c">Ações</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={9} className="empty">Nenhuma NF-e processada encontrada.</td></tr>
              : page.map((n) => (
                <tr key={n.id}>
                  <td><span className="nfe-link" title={n.chave_acesso || ''}>{n.numero || '—'}</span></td>
                  <td className="c mono" style={{ color: '#94a3b8' }}>{n.serie || '1'}</td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{fmtDate(n.data_emissao)}</span></td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{fmtDate(n.processada_em)}</span></td>
                  <td className="fornec"><div style={{ fontWeight: 600 }}>{n.nome_emitente || '—'}</div></td>
                  <td style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{lojaNome[n.loja_id || ''] || '—'}</td>
                  <td className="r mono" style={{ fontWeight: 600 }}>{brl(n.valor_total)}</td>
                  <td className="c" style={{ fontWeight: 600 }}>{itensCount[n.id] || '—'}</td>
                  <td className="c"><div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                    <button className="lnk-btn" onClick={() => setDetNfe(n)}>Ver detalhes</button>
                    <button className="kebab" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ nfe: n, top: r.bottom + 4, left: r.left - 130 }) }}>⋮</button>
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div>

      <div className="pag-row">
        <span>{filtrada.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, filtrada.length)} de ${filtrada.length.toLocaleString('pt-BR')} registros` : 'Nenhum registro'}</span>
        <div style={{ display: 'flex', gap: 4 }}><button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Itens por página:<select className="field" style={{ height: 30, width: 70 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPag(1) }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></div>
      </div>

      {menu && <div className="fmenu-portal" style={{ top: menu.top, left: Math.max(8, menu.left) }} onClick={(e) => e.stopPropagation()}>
        <div className="fm-h">NF-e {menu.nfe.numero}</div>
        <button onClick={() => { exportCSV([menu.nfe]); setMenu(null) }}>↓ Exportar linha</button>
        <button className="danger" onClick={() => { const n = menu.nfe; setMenu(null); estornarMut.mutate(n) }}>↺ Estornar nota</button>
      </div>}

      {detNfe && <DetalheModal nfe={detNfe} onClose={() => setDetNfe(null)} onMsg={showToast} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function DetalheModal({ nfe, onClose, onMsg }: { nfe: Nfe; onClose: () => void; onMsg: (m: string, t?: 'ok' | 'err') => void }) {
  const itensRef = useRef<HTMLDivElement>(null)
  const { data: itens = [] } = useQuery({ queryKey: ['ep-det', nfe.id], queryFn: async () => { const { data } = await supabase.from('nfe_itens').select('*').eq('nfe_id', nfe.id).order('id'); return (data ?? []) as NfeItem[] } })
  // XML original da nota (buscado só aqui no detalhe) — habilita a DANFE oficial + Baixar XML
  const { data: xml = null } = useQuery({ queryKey: ['ep-xml', nfe.id], queryFn: async () => { const { data } = await supabase.from('nfe_recebidas').select('xml').eq('id', nfe.id).single(); return ((data as { xml?: string } | null)?.xml ?? null) as string | null } })
  const totQtd = itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)
  return (
    <div className="fov-portal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dnf-viewer" ref={itensRef}>
        <div className="dnf-toolbar">
          <div className="dnf-tt">Detalhe da NF-e<span>Nº {nfe.numero || '—'} · Série {nfe.serie || '1'} · espelho DANFE</span></div>
          <div className="dnf-acts">
            <button className="dnf-btn ghost" onClick={() => imprimirDanfeOficial(nfe, itens, xml, onMsg)} title="Abrir a DANFE oficial (gerada pelo SIEG)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>Imprimir DANFE</button>
            {xml && <button className="dnf-btn ghost" onClick={() => baixarXml(xml, `NFe-${nfe.numero || nfe.chave_acesso || 'nota'}`)} title="Baixar o XML original da nota"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Baixar XML</button>}
            <button className="dnf-btn accent" onClick={() => gerarDanfeLocal(nfe, itens, onMsg)} title="Visualizar o DANFE (espelho interno)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>Ver DANFE</button>
            <button className="dnf-x" onClick={onClose} title="Fechar">✕</button>
          </div>
        </div>
        <div className="dnf-doc-wrap">
          <div className="dnf-doc">
            <div className="dnf-head">
              <div className="dnf-cell dnf-emit">
                <div className="dnf-lbl">Emitente</div>
                <div className="dnf-emit-nome">{nfe.nome_emitente || '—'}</div>
                <div className="dnf-emit-cnpj">CNPJ <span className="mono">{fmtCnpj(nfe.cnpj_emitente)}</span></div>
              </div>
              <div className="dnf-cell dnf-title">
                <div className="dnf-danfe">DANFE</div>
                <div className="dnf-danfe-sub">Documento Auxiliar da Nota Fiscal Eletrônica</div>
                <div className="dnf-ent">0 — ENTRADA</div>
                <div className="dnf-nn">Nº {nfe.numero || '—'}</div>
                <div className="dnf-ss">Série {nfe.serie || '1'}</div>
              </div>
              <div className="dnf-cell dnf-chave">
                <div className="dnf-barcode" aria-hidden="true" />
                <div className="dnf-lbl">Chave de acesso</div>
                <div className="dnf-chave-num mono">{fmtChave(nfe.chave_acesso) || '—'}</div>
                <div className="dnf-consulte">Consulte em www.nfe.fazenda.gov.br</div>
              </div>
            </div>
            <div className="dnf-info">
              <div className="dnf-cell"><div className="dnf-lbl">Emissão</div><div className="dnf-iv">{fmtDate(nfe.data_emissao)}<span className="dnf-hr">{fmtTime(nfe.data_emissao)}</span></div></div>
              <div className="dnf-cell"><div className="dnf-lbl">Processada no estoque</div><div className="dnf-iv">{fmtDate(nfe.processada_em)}<span className="dnf-hr">{fmtTime(nfe.processada_em)}</span></div></div>
              <div className="dnf-cell"><div className="dnf-lbl">Valor total da nota</div><div className="dnf-iv dnf-tot">{brl(nfe.valor_total)}</div></div>
            </div>
            <div className="dnf-prods">
              <div className="dnf-prods-tt">Produtos / itens da nota ({itens.length})</div>
              <div className="dnf-table-wrap">
                <table className="dnf-table">
                  <thead><tr><th style={{ width: 80 }}>Cód.</th><th>Descrição</th><th className="c" style={{ width: 54 }}>Un.</th><th className="r" style={{ width: 104 }}>Qtd.</th><th className="r" style={{ width: 108 }}>V. Unit.</th><th className="r" style={{ width: 124 }}>V. Total</th></tr></thead>
                  <tbody>
                    {itens.length === 0 ? <tr><td colSpan={6} className="dnf-empty">Sem itens registrados.</td></tr>
                      : itens.map((it, i) => <tr key={i}><td className="mono dnf-cod">{it.codigo_item_fornecedor || '—'}</td><td className="dnf-desc">{it.descricao_nfe || '—'}</td><td className="c dnf-un">{(it.unidade_nfe || '').toUpperCase()}</td><td className="r mono">{q3(it.quantidade)}</td><td className="r mono">{brl(it.valor_unitario)}</td><td className="r mono">{brl(it.valor_total)}</td></tr>)}
                  </tbody>
                  {itens.length > 0 && <tfoot><tr><td colSpan={3} /><td className="r mono dnf-ftq">{q3(totQtd)}</td><td className="r dnf-ftl">Total</td><td className="r mono dnf-ftv">{brl(nfe.valor_total)}</td></tr></tfoot>}
                </table>
              </div>
            </div>
            <div className="dnf-foot"><b>Espelho interno gerado pelo Aiko</b> a partir dos dados capturados da NF-e. Para fins fiscais, vale o DANFE oficial da SEFAZ (consulta pela chave de acesso).</div>
          </div>
        </div>
      </div>
      <style>{DNF_CSS}</style>
    </div>
  )
}

const DNF_CSS = `
.dnf-viewer{width:min(1040px,96vw);max-height:92vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px -22px rgba(6,20,45,.55)}
.dnf-toolbar{flex:0 0 auto;background:linear-gradient(120deg,#14315F,#0F2A52);color:#fff;padding:13px 18px;display:flex;align-items:center;gap:12px}
.dnf-tt{font-size:14px;font-weight:800;display:flex;flex-direction:column;line-height:1.35}
.dnf-tt span{color:#9fc0ee;font-weight:500;font-size:11.5px}
.dnf-acts{margin-left:auto;display:flex;align-items:center;gap:8px}
.dnf-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:background .12s}
.dnf-btn svg{width:14px;height:14px;flex:0 0 auto}
.dnf-btn.ghost{background:rgba(255,255,255,.10);color:#eaf1fb;border-color:rgba(255,255,255,.22)}
.dnf-btn.ghost:hover{background:rgba(255,255,255,.20)}
.dnf-btn.accent{background:linear-gradient(120deg,#ea6c00,#f97316);color:#fff}
.dnf-btn.accent:hover{filter:brightness(1.06)}
.dnf-x{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;cursor:pointer;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#cdddf2;font-size:13px}
.dnf-x:hover{background:rgba(255,255,255,.16)}
.dnf-doc-wrap{flex:1 1 auto;overflow:auto;padding:20px;background:#eef1f6}
.dnf-doc{min-width:680px;max-width:960px;margin:0 auto;background:#fff;border:1.5px solid #2a3b52;border-radius:5px;overflow:hidden;color:#101c2c;font-size:12.5px}
.dnf-lbl{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#5c6b81;font-weight:700;margin-bottom:3px}
.dnf-head{display:grid;grid-template-columns:1.35fr .95fr 1.35fr}
.dnf-cell{padding:12px 14px;border-right:1.5px solid #2a3b52}
.dnf-cell:last-child{border-right:none}
.dnf-emit-nome{font-size:15px;font-weight:800;line-height:1.2;text-transform:uppercase}
.dnf-emit-cnpj{font-size:11.5px;color:#5c6b81;margin-top:7px}
.dnf-emit-cnpj .mono{color:#1e2b3d}
.dnf-title{text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px;justify-content:center}
.dnf-danfe{font-size:26px;font-weight:800;letter-spacing:3px;line-height:1}
.dnf-danfe-sub{font-size:8px;color:#5c6b81;line-height:1.25;max-width:24ch;margin:2px 0 3px}
.dnf-ent{font-size:11px;font-weight:700}
.dnf-nn{font-size:17px;font-weight:800;margin-top:2px}
.dnf-ss{font-size:12.5px;font-weight:700;color:#5c6b81}
.dnf-chave{text-align:center}
.dnf-barcode{height:40px;border-radius:2px;margin-bottom:8px;background-image:repeating-linear-gradient(90deg,#101c2c 0 1px,transparent 1px 3px,#101c2c 3px 5px,transparent 5px 6px,#101c2c 6px 8px,transparent 8px 11px,#101c2c 11px 13px,transparent 13px 14px)}
.dnf-chave-num{font-size:11.5px;color:#1e2b3d;line-height:1.55;word-break:break-word}
.dnf-consulte{font-size:8px;color:#8a97ab;text-transform:uppercase;letter-spacing:.04em;margin-top:6px}
.dnf-info{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1.5px solid #2a3b52}
.dnf-info .dnf-cell{padding:10px 14px}
.dnf-iv{font-size:14px;font-weight:700;display:flex;align-items:baseline;gap:7px}
.dnf-hr{font-size:11px;font-weight:500;color:#8a97ab}
.dnf-tot{color:#0F2A52;font-size:16px}
.dnf-prods{border-top:1.5px solid #2a3b52}
.dnf-prods-tt{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#5c6b81;font-weight:700;padding:8px 14px;border-bottom:1px solid #c4cedd;background:#f6f8fc}
.dnf-table-wrap{overflow-x:auto}
.dnf-table{width:100%;border-collapse:collapse;font-size:12.5px}
.dnf-table th{font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;color:#5c6b81;font-weight:700;text-align:left;padding:8px 14px;border-bottom:1px solid #c4cedd;background:#f6f8fc;white-space:nowrap}
.dnf-table th.r,.dnf-table td.r{text-align:right}
.dnf-table th.c,.dnf-table td.c{text-align:center}
.dnf-table tbody td{padding:9px 14px;border-bottom:1px solid #eceff4;color:#101c2c;vertical-align:top}
.dnf-table tbody tr:hover{background:#f6f8fc}
.dnf-cod{color:#8a97ab;font-size:11px}
.dnf-desc{font-weight:600}
.dnf-un{color:#5c6b81;font-size:11px}
.dnf-empty{text-align:center;color:#94a3b8;padding:22px}
.dnf-table tfoot td{padding:11px 14px;font-weight:800;background:#f6f8fc;border-top:1.5px solid #c4cedd}
.dnf-ftq{color:#5c6b81}
.dnf-ftl{letter-spacing:.05em;text-transform:uppercase;font-size:11px;color:#5c6b81}
.dnf-ftv{color:#0F2A52;font-size:14px}
.dnf-foot{border-top:1.5px dashed #c4cedd;padding:11px 14px;font-size:10.5px;color:#5c6b81;line-height:1.55}
.dnf-foot b{color:#101c2c}
`
