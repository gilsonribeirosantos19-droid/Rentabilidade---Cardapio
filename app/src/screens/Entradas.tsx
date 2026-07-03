import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { mediaPonderada } from '../lib/cost'
import { SearchSelect } from '../components/SearchSelect'
import { DetailModal } from '../components/DetailModal'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string; unidade_medida?: string; unidade_compra?: string }
type Entrada = { id: string; insumo_id: string; loja_id?: string | null; quantidade?: number; quantidade_fornecedor?: number; fator_conversao?: number; unidade_compra?: string; custo_unitario?: number; custo_total?: number; tipo?: string; fornecedor_id?: string | null; fornecedor_nome?: string | null; lote?: string | null; validade?: string | null; observacao?: string | null; criado_em?: string }
type Saida = { insumo_id: string; loja_id?: string | null }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type Forn = { id: string; nome: string }
type EntForm = { insumo_id: string; fornecedor_id: string; data: string; qtd: string; unidade: string; fator: string; custo: string; lote: string; validade: string; obs: string }

const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const brl = (v?: number | null) => (v == null || v === 0) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (v?: number | null) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDate = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const hojeStr = () => new Date().toISOString().split('T')[0]
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()

export function Entradas() {
  const { tenantId, usuario } = useAuth()
  const { lojaId } = useLoja()
  const qc = useQueryClient()
  const now = new Date()
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState(''); const [fTipo, setFTipo] = useState(''); const [fForn, setFForn] = useState('')
  const [de, setDe] = useState(isoD(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(isoD(now))
  const [pag, setPag] = useState(1); const [porPag, setPorPag] = useState(20)
  const [modal, setModal] = useState(false)
  const [dup, setDup] = useState<EntForm | null>(null)
  const [detalhe, setDetalhe] = useState<Entrada | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2800) }

  const { data: insumos = [] } = useQuery({ queryKey: ['ent-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['ent-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: entradas = [], isLoading } = useQuery({ queryKey: ['ent-entradas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Entrada>((f, t) => supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).range(f, t)) })
  const { data: saidas = [] } = useQuery({ queryKey: ['ent-saidas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('insumo_id,loja_id').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['ent-forns', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Forn[] } })
  // Parâmetro Estoque › "Obrigar lote": se 'sim', exige lote na entrada manual
  const { data: params = [] } = useQuery({ queryKey: ['ent-params', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('chave,valor').eq('tenant_id', tenantId).eq('modulo', 'estoque'); return (data ?? []) as { chave: string; valor: string }[] } })
  const obrigarLote = useMemo(() => params.find((p) => p.chave === 'obrigar_lote')?.valor === 'sim', [params])

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const getSaldo = (insId: string): Saldo => saldos.find((s) => s.insumo_id === insId && (!lojaId || s.loja_id === lojaId)) || { insumo_id: insId, quantidade: 0, custo_medio: 0 }
  const entradasL = useMemo(() => lojaId ? entradas.filter((e) => (e.loja_id || null) === lojaId) : entradas, [entradas, lojaId])
  const cats = useMemo(() => uniq(insumos.map((i) => i.categoria)), [insumos])
  const fornNomes = useMemo(() => uniq(entradasL.map((e) => e.fornecedor_nome)), [entradasL])

  const filtrada = useMemo(() => {
    const b = busca.toLowerCase().trim()
    let rows = entradasL
    if (fCat) rows = rows.filter((e) => (insMap[e.insumo_id]?.categoria || '') === fCat)
    if (b) rows = rows.filter((e) => (insMap[e.insumo_id]?.nome || '').toLowerCase().includes(b))
    if (fTipo) rows = rows.filter((e) => e.tipo === fTipo || (fTipo === 'nfe' && e.tipo === 'nfe_importada'))
    if (fForn) rows = rows.filter((e) => e.fornecedor_nome === fForn)
    if (de) rows = rows.filter((e) => (e.criado_em || '') >= de)
    if (ate) rows = rows.filter((e) => (e.criado_em || '') <= ate + 'T23:59:59')
    return [...rows].sort((a, b2) => (b2.criado_em || '').localeCompare(a.criado_em || ''))
  }, [entradasL, busca, fCat, fTipo, fForn, de, ate, insMap])

  const total = filtrada.length
  const totalPags = Math.max(1, Math.ceil(total / porPag))
  const pagAtual = Math.min(pag, totalPags)
  const start = (pagAtual - 1) * porPag
  const page = filtrada.slice(start, start + porPag)

  const upsertSaldo = async (insId: string, quantidade: number, custoMedio: number, loja: string) => {
    const { error } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, insumo_id: insId, loja_id: loja, quantidade: +Number(quantidade).toFixed(4), custo_medio: +Number(custoMedio).toFixed(6), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' })
    if (error) throw error
  }

  const saveMut = useMutation({
    mutationFn: async (f: EntForm) => {
      if (!lojaId) throw new Error('Selecione uma loja específica no topo (não "Todas as lojas") para registrar a entrada.')
      if (!f.insumo_id) throw new Error('Selecione um insumo.')
      const qtd_ = parseFloat(f.qtd) || 0, fator = parseFloat(f.fator) || 1, custo = parseFloat(f.custo) || 0
      if (qtd_ <= 0) throw new Error('Informe a quantidade.')
      if (custo <= 0) throw new Error('Informe o custo unitário.')
      if (obrigarLote && !f.lote.trim()) throw new Error('Informe o lote — obrigatório nos Parâmetros (Configurações › Parâmetros › Estoque).')
      const qtdEst = +(qtd_ * fator).toFixed(4)
      const custoUnit = +(custo / fator).toFixed(6)
      const fornNome = f.fornecedor_id ? (fornecedores.find((x) => x.id === f.fornecedor_id)?.nome || null) : null
      const dataStr = f.data || hojeStr()
      const { error: e1 } = await supabase.from('entradas_estoque').insert({
        tenant_id: tenantId, insumo_id: f.insumo_id, loja_id: lojaId,
        fornecedor_id: f.fornecedor_id || null, fornecedor_nome: fornNome,
        quantidade: qtdEst, quantidade_fornecedor: qtd_, unidade_compra: f.unidade.trim() || null,
        fator_conversao: fator, custo_unitario: custoUnit, lote: f.lote.trim() || null,
        validade: f.validade || null, tipo: 'manual', observacao: f.obs.trim() || null,
        responsavel: usuario?.nome || null,
        criado_em: dataStr + 'T12:00:00.000Z',
      })
      if (e1) throw e1
      // custo médio ponderado (fonte única: lib/cost.ts)
      const s = getSaldo(f.insumo_id)
      const qA = s.quantidade || 0, cmA = s.custo_medio || 0, qN = qA + qtdEst
      const cmN = mediaPonderada(qA, cmA, qtdEst, custoUnit)
      await upsertSaldo(f.insumo_id, qN, +cmN.toFixed(6), lojaId)
      // histórico de custo (best-effort)
      try {
        const impacto = cmA > 0 ? +(((cmN - cmA) / cmA) * 100).toFixed(4) : null
        await supabase.from('historico_custo').insert({ tenant_id: tenantId, insumo_id: f.insumo_id, loja_id: lojaId, saldo_anterior: +qA.toFixed(4), custo_medio_anterior: +cmA.toFixed(4), qtd_entrada: +qtdEst.toFixed(4), custo_entrada: +custoUnit.toFixed(4), novo_custo_medio: +cmN.toFixed(4), impacto_pct: impacto, origem: 'manual' })
      } catch { /* opcional */ }
      // atualiza preço no vínculo insumo→fornecedor
      if (f.fornecedor_id) { try { await supabase.from('insumo_fornecedores').update({ preco_unitario: +custoUnit.toFixed(6) }).eq('insumo_id', f.insumo_id).eq('fornecedor_id', f.fornecedor_id) } catch { /* opcional */ } }
    },
    onSuccess: () => { qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /sald|said|entrad|insumo-forn/i.test(k) } }); setModal(false); setDup(null); showToast('Entrada registrada!', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const delMut = useMutation({
    mutationFn: async (e: Entrada) => {
      const loja = e.loja_id || lojaId
      if (!loja) throw new Error('Loja não definida.')
      if (saidas.some((s) => s.insumo_id === e.insumo_id && (s.loja_id || lojaId) === loja)) throw new Error('Não é possível excluir: esse insumo já teve movimentação de saída nesta loja.')
      if (!confirm(`Excluir esta entrada de ${insMap[e.insumo_id]?.nome || 'insumo'} (${qtd(e.quantidade)})?\nO saldo do insumo será recalculado.`)) throw new Error('__cancel__')
      const { error } = await supabase.from('entradas_estoque').delete().eq('id', e.id); if (error) throw error
      // recalcula saldo a partir das entradas restantes (cronológico)
      const ents = entradas.filter((x) => x.id !== e.id && x.insumo_id === e.insumo_id && (x.loja_id || lojaId) === loja).sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || ''))
      let q = 0, cm = 0
      ents.forEach((x) => { const qx = x.quantidade || 0, vx = x.custo_unitario || 0; if (qx === 0) { cm = vx } else { const nq = q + qx; cm = nq > 0 ? (q * cm + qx * vx) / nq : cm; q = nq } })
      await upsertSaldo(e.insumo_id, +q.toFixed(4), +(cm || 0).toFixed(6), loja)
    },
    onSuccess: () => { qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /sald|entrad/i.test(k) } }); showToast('Entrada excluída e saldo recalculado.', 'ok') },
    onError: (e: Error) => { if (e.message !== '__cancel__') showToast(e.message, 'err') },
  })

  const detRows = (e: Entrada): [string, string][] => { const ins = insMap[e.insumo_id]; return [['Insumo', ins?.nome || '—'], ['Fornecedor', e.fornecedor_nome || '—'], ['Quantidade', qtd(e.quantidade)], ['Custo unit.', brl(e.custo_unitario)], ['Custo total', brl(e.custo_total)], ['Lote', e.lote || '—'], ['Validade', fmtDate(e.validade)], ['Tipo', e.tipo || '—'], ['Data', fmtDH(e.criado_em)]] }
  const duplicar = (e: Entrada) => { setDup({ insumo_id: e.insumo_id, fornecedor_id: e.fornecedor_id || '', data: hojeStr(), qtd: String(e.quantidade_fornecedor || e.quantidade || ''), unidade: e.unidade_compra || '', fator: String(e.fator_conversao || 1), custo: String(e.custo_unitario || ''), lote: e.lote || '', validade: '', obs: '' }); setModal(true) }
  const setPreset = (v: string) => { const n = new Date(); if (v === 'mes_atual') { setDe(isoD(new Date(n.getFullYear(), n.getMonth(), 1))); setAte(isoD(n)) } else if (v === 'mes_anterior') { setDe(isoD(new Date(n.getFullYear(), n.getMonth() - 1, 1))); setAte(isoD(new Date(n.getFullYear(), n.getMonth(), 0))) } else { setDe(''); setAte('') } setPag(1) }

  return (
    <div className="est-screen">
      <div className="act-bar">
        <button className="btn-pri" disabled={!lojaId} title={!lojaId ? 'Selecione uma loja específica no topo' : ''} onClick={() => { if (!lojaId) { showToast('Selecione uma loja específica no topo para registrar a entrada.', 'err'); return } setDup(null); setModal(true) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Entrada manual
        </button>
        <div className="srch">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar insumo..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} />
        </div>
        <select className="field" value={fCat} onChange={(e) => { setFCat(e.target.value); setPag(1) }}><option value="">Grupo: Todos</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="field" value={fTipo} onChange={(e) => { setFTipo(e.target.value); setPag(1) }}><option value="">Tipo: Todos</option><option value="manual">Manual</option><option value="nfe">NF-e</option><option value="ajuste">Ajuste</option></select>
        <select className="field" value={fForn} onChange={(e) => { setFForn(e.target.value); setPag(1) }}><option value="">Fornecedor: Todos</option>{fornNomes.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <select className="field" style={{ minWidth: 130 }} defaultValue="mes_atual" onChange={(e) => setPreset(e.target.value)}><option value="periodo">Período</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option></select>
          <input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} />
          <span style={{ color: '#94a3b8' }}>–</span>
          <input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Data / Hora</th><th>Insumo</th><th>Fornecedor</th><th className="c">Tipo</th><th className="r">Quantidade</th><th className="r">Custo Unit.</th><th className="r">Custo Total</th><th>Lote</th><th>Validade</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={10} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={10} className="empty">Nenhuma entrada encontrada</td></tr>
              : page.map((e) => {
                const ins = insMap[e.insumo_id]
                const forn = e.fornecedor_nome || (e.fornecedor_id ? fornecedores.find((f) => f.id === e.fornecedor_id)?.nome : null) || '—'
                const isNfe = e.tipo === 'nfe' || e.tipo === 'nfe_importada'
                const loja = e.loja_id || lojaId
                const podeExcluir = !!lojaId && !saidas.some((s) => s.insumo_id === e.insumo_id && (s.loja_id || lojaId) === loja)
                const badge = isNfe ? { t: 'NF-e importada', bg: '#dbeafe', c: '#1d4ed8' } : e.tipo === 'ajuste' ? { t: 'Ajuste', bg: '#f1f5f9', c: '#64748b' } : { t: 'Manual', bg: '#ffedd5', c: '#ea580c' }
                return (
                  <tr key={e.id}>
                    <td className="mono" style={{ color: '#64748b', fontSize: 12 }}>{fmtDH(e.criado_em)}</td>
                    <td style={{ fontWeight: 600 }}>{ins ? ins.nome : <span style={{ color: '#ef4444' }}>Insumo não encontrado</span>}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{forn}</td>
                    <td className="c"><span className="badge-pill" style={{ background: badge.bg, color: badge.c }}>{badge.t}</span></td>
                    <td className="r mono">{qtd(e.quantidade)}</td>
                    <td className="r mono">{e.custo_unitario ? brl(e.custo_unitario) : '—'}</td>
                    <td className="r mono" style={{ fontWeight: 600 }}>{e.custo_total ? brl(e.custo_total) : '—'}</td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{e.lote || '—'}</td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(e.validade)}</td>
                    <td className="c"><div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                      <button className="icon-btn" title="Ver detalhes" onClick={() => setDetalhe(e)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                      <button className="icon-btn" title="Duplicar" onClick={() => duplicar(e)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>
                      {podeExcluir && <button className="icon-btn" title="Excluir entrada (insumo sem saída)" onClick={() => delMut.mutate(e)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg></button>}
                    </div></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      <div className="pag-bar">
        <span>{total ? `Mostrando ${start + 1} a ${Math.min(start + porPag, total)} de ${total} entradas` : 'Nenhuma entrada encontrada'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button>
          <span className="pag-btn active">{pagAtual}</span>
          <button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
        </div>
        <select className="field" style={{ height: 30, fontSize: 11 }} value={porPag} onChange={(e) => { setPorPag(Number(e.target.value)); setPag(1) }}><option value={20}>20 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option></select>
      </div>

      {modal && <EntradaModal insumos={insumos} fornecedores={fornecedores} getSaldo={getSaldo} inicial={dup} saving={saveMut.isPending} onClose={() => { setModal(false); setDup(null) }} onSave={(f) => saveMut.mutate(f)} />}
      {detalhe && <DetailModal title="Entrada" rows={detRows(detalhe)} onClose={() => setDetalhe(null)} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function EntradaModal({ insumos, fornecedores, getSaldo, inicial, saving, onClose, onSave }: { insumos: Insumo[]; fornecedores: Forn[]; getSaldo: (id: string) => Saldo; inicial: EntForm | null; saving: boolean; onClose: () => void; onSave: (f: EntForm) => void }) {
  const [f, setF] = useState<EntForm>(inicial || { insumo_id: '', fornecedor_id: '', data: hojeStr(), qtd: '', unidade: '', fator: '1', custo: '', lote: '', validade: '', obs: '' })
  const set = (k: keyof EntForm, v: string) => setF((p) => ({ ...p, [k]: v }))
  const insSel = insumos.find((i) => i.id === f.insumo_id)
  const insByName = new Map(insumos.map((i) => [i.nome, i.id]))
  const s = f.insumo_id ? getSaldo(f.insumo_id) : null
  const q = parseFloat(f.qtd) || 0, fator = parseFloat(f.fator) || 1, custo = parseFloat(f.custo) || 0
  const showConv = q > 0 && custo > 0

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(600px, 95vw)' }}>
        <h2>Entrada Manual</h2>
        <div className="fg"><label>Insumo *</label><SearchSelect value={insSel?.nome || ''} onChange={(nm) => set('insumo_id', insByName.get(nm) || '')} options={insumos.map((i) => i.nome)} placeholder="Selecione..." /></div>
        {s && <div className="saldo-info">Saldo atual: {qtd(s.quantidade || 0)} · Custo médio: {brl(s.custo_medio)}</div>}
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Fornecedor</label><select value={f.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)}><option value="">Sem fornecedor</option>{fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
          <div className="fg" style={{ margin: 0 }}><label>Data *</label><input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></div>
        </div>
        <div className="row3" style={{ marginBottom: showConv ? 0 : 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Quantidade (na embalagem) *</label><input type="number" min="0" step="0.001" placeholder="1.000" value={f.qtd} onChange={(e) => set('qtd', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Unidade compra</label><input type="text" placeholder="CX, KG, UN..." value={f.unidade} onChange={(e) => set('unidade', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Fator conversão *</label><input type="number" min="0.001" step="0.001" value={f.fator} onChange={(e) => set('fator', e.target.value)} /></div>
        </div>
        {showConv && <div className="conv-box" style={{ marginTop: 12 }}>{qtd(q)} {f.unidade || 'un'} × {fator} = {qtd(q * fator)} no estoque · Custo/un: {brl0(custo / fator)} · Total: {brl0(custo * q)}</div>}
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Custo unitário (por embalagem) *</label><input type="number" min="0" step="0.01" placeholder="0.00" value={f.custo} onChange={(e) => set('custo', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Lote</label><input type="text" placeholder="Ex: L2025-01" value={f.lote} onChange={(e) => set('lote', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="fg" style={{ margin: 0 }}><label>Validade</label><input type="date" value={f.validade} onChange={(e) => set('validade', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Observação</label><input type="text" placeholder="Opcional..." value={f.obs} onChange={(e) => set('obs', e.target.value)} /></div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="btn-pri" disabled={saving} onClick={() => onSave(f)}>{saving ? 'Salvando…' : 'Salvar entrada'}</button>
        </div>
      </div>
    </div>
  )
}
