import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string }
type Saida = { id: string; insumo_id: string; loja_id?: string | null; quantidade?: number; tipo?: string; motivo?: string | null; responsavel?: string | null; criado_em?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type SaiForm = { insumo_id: string; quantidade: string; tipo: string; responsavel: string; data: string; motivo: string; destino: string }

const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const brl = (v?: number | null) => (v == null || v === 0) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const hojeStr = () => new Date().toISOString().split('T')[0]
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const TIPO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  consumo: { label: 'Consumo', color: '#f97316', bg: '#fff7ed' },
  perda: { label: 'Perda', color: '#ef4444', bg: '#fee2e2' },
  vencimento: { label: 'Vencimento', color: '#6366f1', bg: '#eef2ff' },
  transferencia: { label: 'Transferência', color: '#0ea5e9', bg: '#f0f9ff' },
  descarte: { label: 'Descarte', color: '#64748b', bg: '#f1f5f9' },
  ajuste: { label: 'Ajuste', color: '#d97706', bg: '#fffbeb' },
}

export function Saidas() {
  const { tenantId } = useAuth()
  const { lojaId, lojas } = useLoja()
  const qc = useQueryClient()
  const now = new Date()
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fResp, setFResp] = useState('')
  const [de, setDe] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(iso(now))
  const [pag, setPag] = useState(1)
  const [porPag, setPorPag] = useState(10)
  const [modal, setModal] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2800) }

  const { data: insumos = [] } = useQuery({ queryKey: ['sai-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['sai-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: saidas = [], isLoading } = useQuery({ queryKey: ['sai-saidas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).range(f, t)) })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const getSaldo = (insId: string): Saldo => saldos.find((s) => s.insumo_id === insId && (!lojaId || s.loja_id === lojaId)) || { insumo_id: insId, quantidade: 0, custo_medio: 0 }
  const resps = useMemo(() => [...new Set(saidas.map((s) => s.responsavel).filter(Boolean) as string[])].sort(), [saidas])

  const filtrada = useMemo(() => {
    const b = busca.toLowerCase().trim()
    let rows = lojaId ? saidas.filter((s) => (s.loja_id || null) === lojaId) : saidas
    if (b) rows = rows.filter((s) => (insMap[s.insumo_id]?.nome || '').toLowerCase().includes(b))
    if (fTipo) rows = rows.filter((s) => s.tipo === fTipo)
    if (fResp) rows = rows.filter((s) => s.responsavel === fResp)
    if (de) rows = rows.filter((s) => (s.criado_em || '') >= de)
    if (ate) rows = rows.filter((s) => (s.criado_em || '') <= ate + 'T23:59:59')
    return rows
  }, [saidas, lojaId, busca, fTipo, fResp, de, ate, insMap])

  const total = filtrada.length
  const totalPags = Math.max(1, Math.ceil(total / porPag))
  const pagAtual = Math.min(pag, totalPags)
  const start = (pagAtual - 1) * porPag
  const page = filtrada.slice(start, start + porPag)

  // grava o saldo (upsert por tenant+insumo+loja)
  const upsertSaldo = async (insId: string, quantidade: number, custoMedio: number, loja: string) => {
    const { error } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, insumo_id: insId, loja_id: loja, quantidade: +Number(quantidade).toFixed(4), custo_medio: +Number(custoMedio).toFixed(6), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' })
    if (error) throw error
  }

  const saveMut = useMutation({
    mutationFn: async (f: SaiForm) => {
      if (!lojaId) throw new Error('Selecione uma loja específica no topo (não "Todas as lojas") para registrar a saída.')
      if (!f.insumo_id) throw new Error('Selecione um insumo.')
      const q = parseFloat(f.quantidade) || 0
      if (q <= 0) throw new Error('Informe a quantidade.')
      const s = getSaldo(f.insumo_id)
      if (q > (s.quantidade || 0)) { if (!confirm(`Quantidade (${qtd(q)}) supera o saldo (${qtd(s.quantidade || 0)}). Continuar?`)) throw new Error('__cancel__') }
      let destinoId: string | null = null
      if (f.tipo === 'transferencia') {
        destinoId = f.destino || null
        if (!destinoId) throw new Error('Selecione a loja de destino.')
        if (destinoId === lojaId) throw new Error('A loja de destino deve ser diferente da origem.')
      }
      const dataStr = f.data || hojeStr()
      const custoOrigem = s.custo_medio || 0
      const { error: e1 } = await supabase.from('saidas_estoque').insert({ tenant_id: tenantId, insumo_id: f.insumo_id, loja_id: lojaId, quantidade: q, tipo: f.tipo, motivo: (f.motivo || '').trim() || null, responsavel: (f.responsavel || '').trim() || null, criado_em: dataStr + 'T12:00:00.000Z' })
      if (e1) throw e1
      await upsertSaldo(f.insumo_id, (s.quantidade || 0) - q, custoOrigem, lojaId)
      if (f.tipo === 'transferencia' && destinoId) {
        const sd = saldos.find((x) => x.insumo_id === f.insumo_id && x.loja_id === destinoId) || { quantidade: 0, custo_medio: 0 }
        const qd = sd.quantidade || 0, cmd = sd.custo_medio || 0, nq = qd + q
        const ncm = nq > 0 ? (qd * cmd + q * custoOrigem) / nq : custoOrigem
        const { error: e2 } = await supabase.from('entradas_estoque').insert({ tenant_id: tenantId, insumo_id: f.insumo_id, loja_id: destinoId, quantidade: q, custo_unitario: custoOrigem, tipo: 'transferencia', criado_em: dataStr + 'T12:00:00.000Z' })
        if (e2) throw e2
        await upsertSaldo(f.insumo_id, nq, ncm, destinoId)
      }
      return f.tipo
    },
    onSuccess: (tipo) => {
      qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /sald|said|entrad/i.test(k) } })
      setModal(false)
      showToast(tipo === 'transferencia' ? 'Transferência registrada (saída + entrada no destino)!' : 'Saída registrada!', 'ok')
    },
    onError: (e: Error) => { if (e.message !== '__cancel__') showToast(e.message, 'err') },
  })

  const verSaida = (s: Saida) => { const ins = insMap[s.insumo_id]; const u = ins?.unidade_medida || ins?.unidade_compra || 'un'; alert(`Saída\n\nInsumo: ${ins?.nome || '—'}\nQuantidade: ${qtd(s.quantidade)} ${u}\nTipo: ${s.tipo}\nMotivo: ${s.motivo || '—'}\nResponsável: ${s.responsavel || '—'}\nData: ${fmtDH(s.criado_em)}`) }
  const setPreset = (v: string) => {
    const n = new Date()
    if (v === 'mes_atual') { setDe(iso(new Date(n.getFullYear(), n.getMonth(), 1))); setAte(iso(n)) }
    else if (v === 'mes_anterior') { setDe(iso(new Date(n.getFullYear(), n.getMonth() - 1, 1))); setAte(iso(new Date(n.getFullYear(), n.getMonth(), 0))) }
    setPag(1)
  }

  return (
    <div className="est-screen">
      <div className="act-bar">
        <button className="btn-pri" disabled={!lojaId} title={!lojaId ? 'Selecione uma loja específica no topo' : ''} onClick={() => { if (!lojaId) { showToast('Selecione uma loja específica no topo para registrar a saída.', 'err'); return } setModal(true) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nova saída
        </button>
        <div className="srch">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar insumo..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} />
        </div>
        <select className="field" value={fTipo} onChange={(e) => { setFTipo(e.target.value); setPag(1) }}>
          <option value="">Tipo: Todos</option><option value="consumo">Consumo</option><option value="perda">Perda</option><option value="vencimento">Vencimento</option><option value="transferencia">Transferência</option><option value="descarte">Descarte</option><option value="ajuste">Ajuste</option>
        </select>
        <select className="field" value={fResp} onChange={(e) => { setFResp(e.target.value); setPag(1) }}>
          <option value="">Responsável: Todos</option>{resps.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <select className="field" style={{ minWidth: 130 }} defaultValue="mes_atual" onChange={(e) => setPreset(e.target.value)}>
            <option value="periodo">Período</option>
            <option value="mes_atual">Mês Atual</option>
            <option value="mes_anterior">Mês Anterior</option>
          </select>
          <input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} />
          <span style={{ color: '#94a3b8' }}>–</span>
          <input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Data / Hora</th><th>Insumo</th><th className="c">Tipo</th><th>Motivo</th><th className="r">Quantidade</th><th>Unidade</th><th>Responsável</th><th className="c">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="empty">Carregando…</td></tr>
              : page.length === 0 ? <tr><td colSpan={8} className="empty">Nenhuma saída encontrada</td></tr>
              : page.map((s) => {
                const ins = insMap[s.insumo_id]; const u = ins?.unidade_medida || ins?.unidade_compra || 'un'
                const tb = TIPO_BADGE[s.tipo || ''] || { label: s.tipo, color: '#64748b', bg: '#f1f5f9' }
                return (
                  <tr key={s.id}>
                    <td className="mono" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDH(s.criado_em)}</td>
                    <td style={{ fontWeight: 500 }}>{ins ? ins.nome : '—'}</td>
                    <td className="c"><span className="badge-pill" style={{ background: tb.bg, color: tb.color }}>{tb.label}</span></td>
                    <td style={{ color: '#64748b' }}>{s.motivo || '—'}</td>
                    <td className="r mono">{qtd(s.quantidade)}</td>
                    <td style={{ color: '#64748b' }}>{u}</td>
                    <td style={{ color: '#64748b' }}>{s.responsavel || '—'}</td>
                    <td className="c"><button className="icon-btn" title="Ver detalhes" onClick={() => verSaida(s)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      <div className="pag-bar">
        <span>{total ? `${start + 1}–${Math.min(start + porPag, total)} de ${total}` : '0 registros'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button>
          <span className="pag-btn active">{pagAtual}</span>
          <button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
        </div>
        <select className="field" style={{ height: 30, fontSize: 11 }} value={porPag} onChange={(e) => { setPorPag(Number(e.target.value)); setPag(1) }}>
          <option value={10}>10 por página</option><option value={20}>20 por página</option><option value={50}>50 por página</option>
        </select>
      </div>

      {modal && <SaidaModal insumos={insumos} lojas={lojas.filter((l) => l.id !== lojaId)} getSaldo={getSaldo} saving={saveMut.isPending} onClose={() => setModal(false)} onSave={(f) => saveMut.mutate(f)} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function SaidaModal({ insumos, lojas, getSaldo, saving, onClose, onSave }: { insumos: Insumo[]; lojas: { id: string; nome: string }[]; getSaldo: (id: string) => Saldo; saving: boolean; onClose: () => void; onSave: (f: SaiForm) => void }) {
  const [f, setF] = useState<SaiForm>({ insumo_id: '', quantidade: '', tipo: 'consumo', responsavel: '', data: hojeStr(), motivo: '', destino: '' })
  const set = (k: keyof SaiForm, v: string) => setF((p) => ({ ...p, [k]: v }))
  const insOptions = insumos.map((i) => i.nome)
  const insByName = new Map(insumos.map((i) => [i.nome, i.id]))
  const insSel = insumos.find((i) => i.id === f.insumo_id)
  const s = f.insumo_id ? getSaldo(f.insumo_id) : null

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nova Saída</h2>
        <div className="fg"><label>Insumo *</label><SearchSelect value={insSel?.nome || ''} onChange={(nm) => set('insumo_id', insByName.get(nm) || '')} options={insOptions} placeholder="Selecione..." /></div>
        {s && <div className="saldo-info">Saldo disponível: {qtd(s.quantidade || 0)} · Custo médio: {brl(s.custo_medio)}</div>}
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Quantidade *</label><input type="number" min="0" step="0.001" placeholder="0.000" value={f.quantidade} onChange={(e) => set('quantidade', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Tipo *</label>
            <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="consumo">Consumo (produção)</option><option value="perda">Perda</option><option value="vencimento">Vencimento</option><option value="transferencia">Transferência</option><option value="descarte">Descarte</option></select>
          </div>
        </div>
        {f.tipo === 'transferencia' && <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Loja de destino *</label>
            <select value={f.destino} onChange={(e) => set('destino', e.target.value)}><option value="">Selecione...</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          </div>
          <div className="fg" style={{ margin: 0 }} />
        </div>}
        <div className="row2" style={{ marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}><label>Responsável</label><input type="text" placeholder="Nome do responsável" value={f.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Data *</label><input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></div>
        </div>
        <div className="fg"><label>Motivo / Observação</label><textarea placeholder="Descreva o motivo da saída..." value={f.motivo} onChange={(e) => set('motivo', e.target.value)} /></div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="btn-pri" disabled={saving} onClick={() => onSave(f)}>{saving ? 'Salvando…' : 'Registrar saída'}</button>
        </div>
      </div>
    </div>
  )
}
