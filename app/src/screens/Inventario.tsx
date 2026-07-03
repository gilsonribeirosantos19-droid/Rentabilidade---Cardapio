import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; preco_compra?: number }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type Inv = { id: string; loja_id?: string; grupo_id?: string; status?: string; tipo?: string; data_inicial?: string; data_final?: string; criado_em?: string }
type InvItem = { id: string; inventario_id: string; insumo_id: string; qtd_sistema?: number; qtd_contada?: number | null; custo_medio?: number }
type Grupo = { id: string; nome: string; tipo?: string; ativo?: boolean; itens?: { insumo_id: string }[] }

const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const ultimoDiaMes = () => isoD(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
const TIPO_LABEL: Record<string, string> = { mensal: 'Mensal', quinzenal: 'Quinzenal', semanal: 'Semanal', avulso: 'Avulso' }

export function Inventario() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const qc = useQueryClient()
  const [view, setView] = useState<'lista' | 'detalhe'>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const [fLoja, setFLoja] = useState(''); const [fNum, setFNum] = useState(''); const [fGrupo, setFGrupo] = useState('')
  const [fIni, setFIni] = useState(''); const [fFim, setFFim] = useState('')
  const [pag, setPag] = useState(1); const [porPag, setPorPag] = useState(10)
  const [novoOpen, setNovoOpen] = useState(false); const [gruposOpen, setGruposOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2800) }

  const { data: insumos = [] } = useQuery({ queryKey: ['inv-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,preco_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['inv-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: invs = [], isLoading } = useQuery({ queryKey: ['inv-list', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Inv>((f, t) => supabase.from('inventarios').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).range(f, t)) })
  const { data: grupos = [] } = useQuery({
    queryKey: ['inv-grupos', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('grupos_inventario').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('nome')
      const gs = (data ?? []) as Grupo[]
      if (gs.length) { const { data: its } = await supabase.from('grupos_inventario_itens').select('grupo_id,insumo_id').in('grupo_id', gs.map((g) => g.id)); const m: Record<string, { insumo_id: string }[]> = {}; (its ?? []).forEach((it: any) => { (m[it.grupo_id] = m[it.grupo_id] || []).push({ insumo_id: it.insumo_id }) }); gs.forEach((g) => g.itens = m[g.id] || []) }
      return gs
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const grupoMap = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g.nome])) as Record<string, string>, [grupos])

  const filtrada = useMemo(() => {
    let r = invs
    if (fLoja) r = r.filter((i) => i.loja_id === fLoja)
    if (fGrupo) r = r.filter((i) => i.grupo_id === fGrupo)
    if (fNum) r = r.filter((i) => i.id.includes(fNum.trim()))
    if (fIni) r = r.filter((i) => (i.criado_em || '') >= fIni)
    if (fFim) r = r.filter((i) => (i.criado_em || '') <= fFim + 'T23:59:59')
    return r
  }, [invs, fLoja, fGrupo, fNum, fIni, fFim])
  const total = filtrada.length
  const totalPags = Math.max(1, Math.ceil(total / porPag))
  const pagAtual = Math.min(pag, totalPags)
  const page = filtrada.slice((pagAtual - 1) * porPag, pagAtual * porPag)

  if (view === 'detalhe' && selId) {
    return <InvDetalhe invId={selId} insMap={insMap} lojaMap={lojaMap} grupoMap={grupoMap} onBack={() => { setView('lista'); setSelId(null); qc.invalidateQueries({ queryKey: ['inv-list'] }) }} showToast={showToast} toast={toast} />
  }

  return (
    <div className="est-screen">
      <div className="act-bar" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-sec" onClick={() => setGruposOpen(true)}>⚙ Grupos</button>
        <button className="btn-pri" onClick={() => setNovoOpen(true)}>+ Novo inventário</button>
      </div>

      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label><select className="field" value={fLoja} onChange={(e) => setFLoja(e.target.value)}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <div className="ds-field"><label>Grupo Inventário</label><select className="field" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>
        <div className="ds-field"><label>N. Inventário</label><input className="field" placeholder="[digite...]" value={fNum} onChange={(e) => setFNum(e.target.value)} /></div>
        <div className="ds-field"><label>D. Inicial</label><input type="date" className="field" value={fIni} onChange={(e) => setFIni(e.target.value)} /></div>
        <div className="ds-field"><label>D. Final</label><input type="date" className="field" value={fFim} onChange={(e) => setFFim(e.target.value)} /></div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Loja</th><th>Tipo</th><th>D. Inicial</th><th>D. Final</th><th className="c">Situação</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={6} className="empty">Nenhum inventário encontrado.</td></tr>
              : page.map((i) => {
                const st = i.status === 'encerrado' ? { t: 'Encerrado', bg: '#eff6ff', c: '#2563eb' } : i.status === 'cancelado' ? { t: 'Cancelado', bg: '#fff1f2', c: '#e11d48' } : { t: 'Ativo', bg: '#f0fdf4', c: '#16a34a' }
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{lojaMap[i.loja_id || ''] || '—'}</td>
                    <td>{TIPO_LABEL[i.tipo || ''] || i.tipo || '—'}</td>
                    <td>{fmtD(i.data_inicial)}</td>
                    <td>{fmtD(i.data_final)}</td>
                    <td className="c"><span className="badge-pill" style={{ background: st.bg, color: st.c }}>{st.t}</span></td>
                    <td className="c"><button className="icon-btn" title="Ver / contar" onClick={() => { setSelId(i.id); setView('detalhe') }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>
      <div className="pag-bar">
        <span>{total ? `${(pagAtual - 1) * porPag + 1}–${Math.min(pagAtual * porPag, total)} de ${total}` : '0 registros'}</span>
        <div style={{ display: 'flex', gap: 4 }}><button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pag-btn active">{pagAtual}</span><button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>
        <select className="field" style={{ height: 30, fontSize: 11 }} value={porPag} onChange={(e) => { setPorPag(Number(e.target.value)); setPag(1) }}><option value={10}>10 por página</option><option value={20}>20 por página</option><option value={50}>50 por página</option></select>
      </div>

      {novoOpen && <NovoInvModal lojas={lojas} grupos={grupos} insumos={insumos} saldos={saldos} tenantId={tenantId!} onClose={() => setNovoOpen(false)} onDone={() => { setNovoOpen(false); qc.invalidateQueries({ queryKey: ['inv-list'] }); showToast('Inventário criado! O gerente já pode preenchê-lo.', 'ok') }} onErr={(m) => showToast(m, 'err')} />}
      {gruposOpen && <GruposModal grupos={grupos} insumos={insumos} tenantId={tenantId!} onClose={() => setGruposOpen(false)} onChange={() => qc.invalidateQueries({ queryKey: ['inv-grupos'] })} showToast={showToast} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function InvDetalhe({ invId, insMap, lojaMap, grupoMap, onBack, showToast, toast }: { invId: string; insMap: Record<string, Insumo>; lojaMap: Record<string, string>; grupoMap: Record<string, string>; onBack: () => void; showToast: (m: string, t?: 'ok' | 'err') => void; toast: { msg: string; tipo: 'ok' | 'err' } | null }) {
  const qc = useQueryClient()
  const { data: inv } = useQuery({ queryKey: ['inv-one', invId], queryFn: async () => { const { data } = await supabase.from('inventarios').select('*').eq('id', invId).limit(1); return (data?.[0] || null) as Inv | null } })
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['inv-itens', invId], queryFn: async () => { const { data } = await supabase.from('inventario_itens').select('*').eq('inventario_id', invId).order('insumo_id'); return (data ?? []) as InvItem[] } })

  const isAtivo = inv?.status === 'ativo'
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<Record<string, string>>({})
  useEffect(() => {
    const c: Record<string, string> = {}
    itens.forEach((it) => { const v = (it.qtd_contada != null ? it.qtd_contada : (it.qtd_sistema || 0)); c[it.id] = Number(v).toFixed(3) })
    setCounts(c); setOrig(c)
  }, [itens])

  const visItens = itens.filter((it) => insMap[it.insumo_id])
  const rows = visItens.map((it) => {
    const sys = it.qtd_sistema || 0
    const cnt = parseFloat(counts[it.id] ?? String(it.qtd_contada ?? sys)) || 0
    const dif = cnt - sys
    const vDif = dif * (it.custo_medio || 0)
    return { it, sys, cnt, dif, vDif }
  })
  const totalDif = rows.reduce((s, r) => s + r.vDif, 0)

  const encMut = useMutation({
    mutationFn: async () => {
      if (!inv) return
      const ref = String(inv.data_final || inv.data_inicial || '').slice(0, 10)
      const hoje = new Date().toISOString().slice(0, 10)
      const msg = ref && ref < hoje
        ? `Este inventário é de ${ref.split('-').reverse().join('/')} (data passada).\n\nO estoque será reconciliado NA DATA DA CONTAGEM e o que entrou/saiu depois será preservado. Encerrar?`
        : 'Encerrar o inventário? Os saldos serão ajustados com base nas quantidades contadas.'
      if (!confirm(msg)) throw new Error('__cancel__')
      // salva só as contagens editadas
      const updates = itens.filter((it) => counts[it.id] != null && counts[it.id] !== orig[it.id]).map((it) => ({ id: it.id, qtd_contada: parseFloat(counts[it.id]) || 0 }))
      if (updates.length) { const { error } = await supabase.from('inventario_itens').upsert(updates, { onConflict: 'id' }); if (error) throw error }
      const { error } = await supabase.rpc('encerrar_inventario', { p_inventario_id: invId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /inv-|sald|entrad|said/i.test(k) } }); showToast('Inventário encerrado e estoque ajustado.', 'ok'); onBack() },
    onError: (e: Error) => { if (e.message !== '__cancel__') showToast('Erro: ' + e.message, 'err') },
  })
  const reabrirMut = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('inventarios').update({ status: 'ativo' }).eq('id', invId); if (error) throw error },
    onSuccess: () => { showToast('Inventário reaberto.', 'ok'); onBack() },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  return (
    <div className="est-screen">
      <div className="inv-det-head">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{inv ? `${grupoMap[inv.grupo_id || ''] || 'Inventário'} · ${lojaMap[inv.loja_id || ''] || '—'}` : 'Inventário'}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{inv ? `${TIPO_LABEL[inv.tipo || ''] || inv.tipo} · ${fmtD(inv.data_inicial)} a ${fmtD(inv.data_final)} · ${inv.status === 'ativo' ? 'Ativo' : 'Encerrado'}` : ''}</div>
        </div>
        <button className="btn-sec" onClick={onBack}>← Voltar</button>
        {isAtivo && <button className="btn-pri" disabled={encMut.isPending} onClick={() => encMut.mutate()}>{encMut.isPending ? 'Encerrando…' : '✓ Encerrar e ajustar estoque'}</button>}
        {inv && !isAtivo && <button className="btn-sec" disabled={reabrirMut.isPending} onClick={() => reabrirMut.mutate()}>↺ Reabrir</button>}
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Insumo</th><th>Un.</th><th className="r">Saldo sistema</th><th className="r">Qtd. contada</th><th className="r">Diferença</th><th className="r">Custo médio</th><th className="r">Valor ajuste</th></tr></thead>
          <tfoot><tr><td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Valor total do ajuste:</td><td className="r mono" style={{ fontWeight: 700, color: totalDif >= 0 ? '#16a34a' : '#e11d48' }}>{totalDif >= 0 ? '+' : ''}{brl(totalDif)}</td></tr></tfoot>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="empty">Sem itens.</td></tr>
              : rows.map(({ it, sys, dif, vDif }) => {
                const ins = insMap[it.insumo_id]; const un = ins?.unidade_medida || ins?.unidade_compra || '—'
                const cls = dif > 0.001 ? '#16a34a' : dif < -0.001 ? '#e11d48' : '#94a3b8'; const sinal = dif > 0 ? '+' : ''
                return (
                  <tr key={it.id}>
                    <td style={{ fontWeight: 500 }}>{ins?.nome || it.insumo_id}</td>
                    <td style={{ color: '#94a3b8' }}>{un}</td>
                    <td className="r mono">{qtd(sys)}</td>
                    <td className="r">{isAtivo ? <input type="number" step="0.001" min="0" className="field" style={{ width: 110, height: 32, textAlign: 'right' }} value={counts[it.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [it.id]: e.target.value }))} /> : <span className="mono">{qtd(parseFloat(counts[it.id]) || 0)}</span>}</td>
                    <td className="r mono" style={{ color: cls }}>{sinal}{qtd(dif)}</td>
                    <td className="r mono">{brl(it.custo_medio)}</td>
                    <td className="r mono" style={{ color: cls }}>{sinal}{brl(vDif)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function NovoInvModal({ lojas, grupos, insumos, saldos, tenantId, onClose, onDone, onErr }: { lojas: { id: string; nome: string }[]; grupos: Grupo[]; insumos: Insumo[]; saldos: Saldo[]; tenantId: string; onClose: () => void; onDone: () => void; onErr: (m: string) => void }) {
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : '')
  const [grupoId, setGrupoId] = useState('')
  const [tipo, setTipo] = useState('mensal')
  const [ini, setIni] = useState(primeiroDiaMes())
  const [fim, setFim] = useState(ultimoDiaMes())
  const [saving, setSaving] = useState(false)
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])), [insumos])

  const ajustarDatas = (t: string) => {
    const d = new Date()
    if (t === 'mensal') { setIni(primeiroDiaMes()); setFim(ultimoDiaMes()) }
    else if (t === 'quinzenal') { if (d.getDate() <= 15) { setIni(primeiroDiaMes()); setFim(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`) } else { setIni(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-16`); setFim(ultimoDiaMes()) } }
    else if (t === 'semanal') { const dow = d.getDay() || 7; const seg = new Date(d); seg.setDate(d.getDate() - (dow - 1)); const dom = new Date(seg); dom.setDate(seg.getDate() + 6); setIni(isoD(seg)); setFim(isoD(dom)) }
    else { setIni(isoD(d)); setFim(isoD(d)) }
  }

  const criar = async () => {
    if (!loja) return onErr('Selecione a loja.')
    if (!grupoId) return onErr('Selecione um grupo.')
    if (!ini || !fim) return onErr('Informe as datas.')
    const grupo = grupos.find((g) => g.id === grupoId)
    if (!grupo?.itens?.length) return onErr('Grupo sem insumos cadastrados.')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('inventarios').insert({ tenant_id: tenantId, status: 'ativo', loja_id: loja, grupo_id: grupoId, tipo, data_inicial: ini, data_final: fim, criado_em: ini + 'T12:00:00.000Z' }).select('id')
      if (error) throw error
      const invId = data?.[0]?.id
      if (!invId) throw new Error('Falha ao criar inventário.')
      const insGrupo = grupo.itens.map((it) => insMap[it.insumo_id]).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome))
      const sld = (insId: string): Saldo => saldos.find((s) => s.insumo_id === insId && s.loja_id === loja) || { insumo_id: insId, quantidade: 0, custo_medio: 0 }
      const linhas = insGrupo.map((ins) => ({ inventario_id: invId, insumo_id: ins.id, qtd_sistema: sld(ins.id).quantidade || 0, qtd_contada: null, custo_medio: sld(ins.id).custo_medio || 0 }))
      const { error: e2 } = await supabase.from('inventario_itens').insert(linhas)
      if (e2) throw e2
      onDone()
    } catch (e: any) { onErr('Erro: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Inventário</h2>
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Loja *</label><select value={loja} onChange={(e) => setLoja(e.target.value)}><option value="">Selecione...</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
          <div className="fg" style={{ margin: 0 }}><label>Grupo *</label><select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}><option value="">Selecione...</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.itens?.length || 0})</option>)}</select></div>
        </div>
        <div className="row3">
          <div className="fg" style={{ margin: 0 }}><label>Tipo</label><select value={tipo} onChange={(e) => { setTipo(e.target.value); ajustarDatas(e.target.value) }}><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option><option value="avulso">Avulso</option></select></div>
          <div className="fg" style={{ margin: 0 }}><label>D. Inicial *</label><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>D. Final *</label><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
        </div>
        <div className="modal-foot" style={{ marginTop: 16 }}>
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="btn-pri" disabled={saving} onClick={criar}>{saving ? 'Criando…' : 'Iniciar inventário'}</button>
        </div>
      </div>
    </div>
  )
}

function GruposModal({ grupos, insumos, tenantId, onClose, onChange, showToast }: { grupos: Grupo[]; insumos: Insumo[]; tenantId: string; onClose: () => void; onChange: () => void; showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [edit, setEdit] = useState<Grupo | 'novo' | null>(null)

  const excluir = async (id: string) => {
    if (!confirm('Excluir este grupo? Os inventários realizados não serão afetados.')) return
    const { error } = await supabase.from('grupos_inventario').delete().eq('id', id)
    if (error) { showToast('Erro: ' + error.message, 'err'); return }
    showToast('Grupo excluído.', 'ok'); onChange()
  }

  if (edit) return <GrupoEditModal grupo={edit === 'novo' ? null : edit} insumos={insumos} tenantId={tenantId!} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChange() }} showToast={showToast} />

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 95vw)' }}>
        <h2>Grupos de Inventário</h2>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button className="btn-pri" onClick={() => setEdit('novo')}>+ Novo grupo</button></div>
        <div className="tbl-wrap"><div className="tbl-scroll" style={{ maxHeight: '50vh' }}>
          <table className="tbl">
            <thead><tr><th>Nome</th><th>Tipo</th><th className="r">Itens</th><th className="c">Ações</th></tr></thead>
            <tbody>
              {grupos.length === 0 ? <tr><td colSpan={4} className="empty">Nenhum grupo cadastrado</td></tr>
                : grupos.map((g) => <tr key={g.id}>
                  <td style={{ fontWeight: 500 }}>{g.nome}</td>
                  <td style={{ color: '#94a3b8' }}>{TIPO_LABEL[g.tipo || ''] || g.tipo || '—'}</td>
                  <td className="r mono">{g.itens?.length || 0}</td>
                  <td className="c"><div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}><button className="btn-sec" style={{ height: 30 }} onClick={() => setEdit(g)}>Editar</button><button className="btn-sec" style={{ height: 30, color: '#e11d48' }} onClick={() => excluir(g.id)}>Excluir</button></div></td>
                </tr>)}
            </tbody>
          </table>
        </div></div>
        <div className="modal-foot" style={{ marginTop: 14 }}><div style={{ flex: 1 }} /><button className="btn-sec" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}

function GrupoEditModal({ grupo, insumos, tenantId, onClose, onSaved, showToast }: { grupo: Grupo | null; insumos: Insumo[]; tenantId: string; onClose: () => void; onSaved: () => void; showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [nome, setNome] = useState(grupo?.nome || '')
  const [tipo, setTipo] = useState(grupo?.tipo || 'mensal')
  const [sel, setSel] = useState<Set<string>>(new Set((grupo?.itens || []).map((i) => i.insumo_id)))
  const [busca, setBusca] = useState('')
  const [saving, setSaving] = useState(false)
  const filtrados = insumos.filter((i) => i.nome.toLowerCase().includes(busca.toLowerCase().trim()))
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const salvar = async () => {
    if (!nome.trim()) return showToast('Informe o nome do grupo.', 'err')
    if (!sel.size) return showToast('Selecione ao menos um insumo.', 'err')
    setSaving(true)
    try {
      let grupoId = grupo?.id
      if (grupoId) {
        const { error } = await supabase.from('grupos_inventario').update({ nome: nome.trim(), tipo }).eq('id', grupoId); if (error) throw error
        await supabase.from('grupos_inventario_itens').delete().eq('grupo_id', grupoId)
      } else {
        const { data, error } = await supabase.from('grupos_inventario').insert({ tenant_id: tenantId, nome: nome.trim(), tipo, ativo: true }).select('id'); if (error) throw error
        grupoId = data?.[0]?.id; if (!grupoId) throw new Error('Falha ao criar grupo.')
      }
      const linhas = [...sel].map((insId, ordem) => ({ tenant_id: tenantId, grupo_id: grupoId, insumo_id: insId, ordem }))
      const { error: e2 } = await supabase.from('grupos_inventario_itens').insert(linhas); if (e2) throw e2
      showToast(`Grupo "${nome}" salvo com ${linhas.length} insumos!`, 'ok'); onSaved()
    } catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setSaving(false) }
  }

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 95vw)' }}>
        <h2>{grupo ? 'Editar Grupo' : 'Novo Grupo'}</h2>
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Nome *</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Geladeira" /></div>
          <div className="fg" style={{ margin: 0 }}><label>Tipo</label><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option><option value="avulso">Avulso</option></select></div>
        </div>
        <div className="fg"><label>Insumos ({sel.size} selecionados)</label><input placeholder="Buscar insumo..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div style={{ maxHeight: '38vh', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 9, padding: 8 }}>
          {filtrados.map((i) => <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" style={{ accentColor: '#f97316' }} checked={sel.has(i.id)} onChange={() => toggle(i.id)} /> {i.nome}</label>)}
        </div>
        <div className="modal-foot" style={{ marginTop: 14 }}>
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="btn-pri" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : 'Salvar grupo'}</button>
        </div>
      </div>
    </div>
  )
}
