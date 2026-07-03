import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string }
type Loja = { id: string; nome: string }
type Saldo = { insumo_id: string; loja_id: string; quantidade?: number; custo_medio?: number }
type Log = { insumo_id?: string; loja_id?: string; custo_anterior?: number; custo_novo?: number; criado_em?: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function AjusteCustoMedio() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [insumoId, setInsumoId] = useState('')
  const [data, setData] = useState(isoD(new Date()))
  const [novo, setNovo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [logDe, setLogDe] = useState(isoD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [logAte, setLogAte] = useState(isoD(new Date()))
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data: insumos = [] } = useQuery({ queryKey: ['cm-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['cm-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Loja[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['cm-sld', tenantId, insumoId], enabled: !!tenantId && !!insumoId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).eq('insumo_id', insumoId); return (data ?? []) as Saldo[] } })
  const { data: logs = [] } = useQuery({ queryKey: ['cm-log', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('ajustes_custo_medio').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).limit(50); return (data ?? []) as Log[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.nome])) as Record<string, string>, [insumos])
  const insByNome = useMemo(() => { const m: Record<string, string> = {}; insumos.forEach((i) => { m[i.nome] = i.id }); return m }, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const saldoDe = (lojaId: string) => saldos.find((s) => s.loja_id === lojaId) || { quantidade: 0, custo_medio: 0 }
  const novoNum = parseFloat(novo)

  const vis = useMemo(() => lojas.filter((l) => (l.nome || '').toLowerCase().includes(busca.toLowerCase())), [lojas, busca])
  const logsFiltrados = useMemo(() => logs.filter((r) => { const d = (r.criado_em || '').split('T')[0]; return (!logDe || d >= logDe) && (!logAte || d <= logAte) }), [logs, logDe, logAte])

  const trocarInsumo = (id: string) => { setInsumoId(id); setSel(new Set()) }
  const toggleLoja = (id: string, on: boolean) => setSel((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })
  const toggleTodas = (on: boolean) => setSel(on ? new Set(lojas.map((l) => l.id)) : new Set())
  const limpar = () => { setInsumoId(''); setNovo(''); setMotivo(''); setBusca(''); setSel(new Set()) }

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!insumoId) throw new Error('Selecione um insumo.')
      if (!(novoNum > 0)) throw new Error('Informe o novo custo médio.')
      const selecionadas = [...sel]; if (!selecionadas.length) throw new Error('Selecione ao menos uma loja.')
      const agora = data + 'T12:00:00.000Z'
      for (const lId of selecionadas) {
        const s = saldoDe(lId)
        const { error: e1 } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, insumo_id: insumoId, loja_id: lId, quantidade: +Number(s.quantidade || 0).toFixed(4), custo_medio: +novoNum.toFixed(6), atualizado_em: agora }, { onConflict: 'tenant_id,insumo_id,loja_id' }); if (e1) throw e1
        const obs = motivo.trim() ? ('Ajuste de custo médio — ' + motivo.trim()) : 'Ajuste de custo médio'
        const { error: e2 } = await supabase.from('entradas_estoque').insert({ tenant_id: tenantId, insumo_id: insumoId, loja_id: lId, quantidade: 0, custo_unitario: +novoNum.toFixed(6), tipo: 'ajuste', observacao: obs, criado_em: agora }); if (e2) throw e2
      }
      return selecionadas.length
    },
    onSuccess: (n) => { showToast(`Custo médio ajustado em ${n} loja(s)!`, 'ok'); limpar(); qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /cm-|sald|mov|kardex|custo/i.test(k) } }) },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="est-screen">
      <div className="adj-tbar" style={{ maxWidth: 920 }}>
        <button className="adj-tbtn pri" title="Salvar ajuste" disabled={salvarMut.isPending} onClick={() => salvarMut.mutate()}>💾</button>
        <button className="adj-tbtn" title="Limpar / novo" onClick={limpar}>✕</button>
      </div>

      <div className="adj-card" style={{ maxWidth: 920 }}>
        <div className="adj-sec-head">▣ Informações do Ajuste</div>
        <div className="adj-grid">
          <div className="adj-fg"><label>Insumo *</label><SearchSelect value={insumoId ? (insMap[insumoId] || '') : ''} options={['Selecione um insumo...', ...insumos.map((i) => i.nome)]} placeholder="Selecione um insumo..." onChange={(nm) => trocarInsumo(nm === 'Selecione um insumo...' ? '' : (insByNome[nm] || ''))} /></div>
          <div className="adj-fg"><label>Data do Ajuste *</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="adj-fg"><label>Novo Custo Médio (R$/KG) *</label><input type="number" min="0.01" step="0.01" placeholder="0,00" value={novo} onChange={(e) => setNovo(e.target.value)} /></div>
          <div className="adj-fg"><label>Motivo / observação</label><input placeholder="Ex.: correção de nota, contagem…" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8' }}>Lojas — marque onde aplicar</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{sel.size} loja(s) selecionada(s)</div>
          </div>
          <input className="cm-grid-search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="cm-grid-wrap">
            <table className="cm-grid">
              <thead><tr>
                <th className="c-sel"><input type="checkbox" checked={lojas.length > 0 && sel.size === lojas.length} onChange={(e) => toggleTodas(e.target.checked)} /></th>
                <th>Loja</th><th className="c-num">Custo Médio Atual</th><th className="c-num">Novo Valor</th><th>Situação</th>
              </tr></thead>
              <tbody>
                {!insumoId ? <tr><td colSpan={5} className="cm-grid-empty">Selecione um insumo primeiro</td></tr>
                  : vis.length === 0 ? <tr><td colSpan={5} className="cm-grid-empty">Nenhuma loja encontrada.</td></tr>
                  : vis.map((l) => {
                    const s = saldoDe(l.id); const on = sel.has(l.id)
                    return (
                      <tr key={l.id} className={on ? 'sel' : ''}>
                        <td className="c-sel"><input type="checkbox" checked={on} onChange={(e) => toggleLoja(l.id, e.target.checked)} /></td>
                        <td>{l.nome}</td>
                        <td className="c-num">{s.custo_medio ? brl(s.custo_medio) : '—'}</td>
                        <td className="c-num">{(on && novoNum > 0) ? <span style={{ color: '#16a34a', fontWeight: 600 }}>{brl(novoNum)}</span> : '—'}</td>
                        <td>{on ? <span style={{ color: '#16a34a' }}>● Será ajustada</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adj-card" style={{ maxWidth: 920 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div className="adj-sec-head" style={{ margin: 0 }}>Histórico de Ajustes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>Período:<input type="date" className="field" style={{ height: 30 }} value={logDe} onChange={(e) => setLogDe(e.target.value)} />até<input type="date" className="field" style={{ height: 30 }} value={logAte} onChange={(e) => setLogAte(e.target.value)} /></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Data</th><th>Insumo</th><th>Loja</th><th className="r">Anterior</th><th className="r">Novo</th></tr></thead>
          <tbody>
            {logsFiltrados.length === 0 ? <tr><td colSpan={5} className="empty">Nenhum ajuste encontrado.</td></tr>
              : logsFiltrados.map((r, i) => <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{fmtDH(r.criado_em)}</td><td style={{ fontWeight: 500 }}>{insMap[r.insumo_id || ''] || '—'}</td><td style={{ fontSize: 12, color: '#64748b' }}>{lojaMap[r.loja_id || ''] || '—'}</td><td className="r mono" style={{ color: '#94a3b8' }}>{brl(r.custo_anterior)}</td><td className="r mono"><span className="badge b-cm">{brl(r.custo_novo)}</span></td></tr>)}
          </tbody>
        </table></div>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
