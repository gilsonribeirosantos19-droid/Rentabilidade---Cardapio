import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string }
type Loja = { id: string; nome: string }
type Saldo = { insumo_id: string; loja_id: string; quantidade?: number; custo_medio?: number }
type Log = { insumo_id?: string; quantidade?: number; motivo?: string; criado_em?: string; dir: 'pos' | 'neg' }

const fmtQ = (v?: number | null) => { const n = Number(v) || 0; return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) }
const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MOTIVOS = [['contagem', 'Correção de contagem'], ['nota_errada', 'Nota fiscal errada'], ['perda', 'Perda / Quebra'], ['furto', 'Furto / Extravio'], ['outro', 'Outro']]

export function AjusteEstoque() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [insumoId, setInsumoId] = useState('')
  const [data, setData] = useState(isoD(new Date()))
  const [motivo, setMotivo] = useState('contagem')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [nova, setNova] = useState<Record<string, string>>({})
  const [logDe, setLogDe] = useState(isoD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [logAte, setLogAte] = useState(isoD(new Date()))
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data: insumos = [] } = useQuery({ queryKey: ['ae-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['ae-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Loja[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['ae-sld', tenantId, insumoId], enabled: !!tenantId && !!insumoId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).eq('insumo_id', insumoId); return (data ?? []) as Saldo[] } })
  const { data: logs = [] } = useQuery({
    queryKey: ['ae-log', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const [e, s] = await Promise.all([
        supabase.from('entradas_estoque').select('insumo_id,quantidade,motivo,criado_em').eq('tenant_id', tenantId).eq('tipo', 'ajuste').order('criado_em', { ascending: false }).limit(50),
        supabase.from('saidas_estoque').select('insumo_id,quantidade,motivo,criado_em').eq('tenant_id', tenantId).eq('tipo', 'ajuste').order('criado_em', { ascending: false }).limit(50),
      ])
      return [...(e.data ?? []).map((x) => ({ ...x, dir: 'pos' as const })), ...(s.data ?? []).map((x) => ({ ...x, dir: 'neg' as const }))].sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')) as Log[]
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const insByNome = useMemo(() => { const m: Record<string, string> = {}; insumos.forEach((i) => { m[i.nome] = i.id }); return m }, [insumos])
  const ins = insMap[insumoId]
  const un = ins ? (ins.unidade_medida || ins.unidade_compra || 'un') : ''
  const saldoDe = (lojaId: string) => saldos.find((s) => s.loja_id === lojaId) || { quantidade: 0, custo_medio: 0 }

  const vis = useMemo(() => lojas.filter((l) => (l.nome || '').toLowerCase().includes(busca.toLowerCase())), [lojas, busca])
  const logsFiltrados = useMemo(() => logs.filter((r) => { const d = (r.criado_em || '').split('T')[0]; return (!logDe || d >= logDe) && (!logAte || d <= logAte) }), [logs, logDe, logAte])

  const trocarInsumo = (id: string) => { setInsumoId(id); setSel(new Set()); setNova({}) }
  const toggleLoja = (id: string, on: boolean) => { setSel((prev) => { const n = new Set(prev); if (on) n.add(id); else { n.delete(id); setNova((nv) => { const c = { ...nv }; delete c[id]; return c }) } return n }) }
  const toggleTodas = (on: boolean) => { if (on) setSel(new Set(lojas.map((l) => l.id))); else { setSel(new Set()); setNova({}) } }

  const limpar = () => { setInsumoId(''); setBusca(''); setSel(new Set()); setNova({}) }

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!insumoId) throw new Error('Selecione um insumo.')
      const itens: { lId: string; nova: number; dif: number; custo: number }[] = []
      for (const lId of sel) {
        const nv = nova[lId]; if (nv === undefined || nv === '' || isNaN(parseFloat(nv)) || parseFloat(nv) < 0) continue
        const s = saldoDe(lId); const atual = Number(s.quantidade) || 0; const nvNum = parseFloat(nv); const dif = +(nvNum - atual).toFixed(4)
        if (dif === 0) continue
        itens.push({ lId, nova: nvNum, dif, custo: Number(s.custo_medio) || 0 })
      }
      if (!itens.length) throw new Error('Marque uma loja e informe uma nova quantidade diferente do saldo atual.')
      const agora = data + 'T12:00:00.000Z'
      for (const it of itens) {
        const tabela = it.dif > 0 ? 'entradas_estoque' : 'saidas_estoque'
        const payload: Record<string, unknown> = { tenant_id: tenantId, insumo_id: insumoId, loja_id: it.lId, quantidade: Math.abs(it.dif), tipo: 'ajuste', motivo, observacao: 'Ajuste de estoque', criado_em: agora }
        // ajuste POSITIVO = entrada: carrega o custo médio vigente (senão o recálculo entra com custo 0 e derruba a média)
        if (it.dif > 0) payload.custo_unitario = +it.custo.toFixed(6)
        const { error: e1 } = await supabase.from(tabela).insert(payload); if (e1) throw e1
        const { error: e2 } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, insumo_id: insumoId, loja_id: it.lId, quantidade: +it.nova.toFixed(4), custo_medio: +it.custo.toFixed(6), atualizado_em: agora }, { onConflict: 'tenant_id,insumo_id,loja_id' }); if (e2) throw e2
      }
      return itens.length
    },
    onSuccess: (n) => { showToast(`Estoque ajustado em ${n} loja(s)!`, 'ok'); limpar(); qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /ae-|sald|mov|kardex/i.test(k) } }) },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="est-screen">
      <div className="adj-tbar">
        <button className="adj-tbtn pri" title="Salvar ajuste" disabled={salvarMut.isPending} onClick={() => salvarMut.mutate()}>💾</button>
        <button className="adj-tbtn" title="Limpar / novo" onClick={limpar}>✕</button>
      </div>

      <div className="adj-card" style={{ maxWidth: 940 }}>
        <div className="adj-sec-head">▣ Informações do Ajuste</div>
        <div className="adj-grid">
          <div className="adj-fg"><label>Insumo *</label><SearchSelect value={insumoId ? (insMap[insumoId]?.nome || '') : ''} options={['Selecione um insumo...', ...insumos.map((i) => i.nome)]} placeholder="Selecione um insumo..." onChange={(nm) => trocarInsumo(nm === 'Selecione um insumo...' ? '' : (insByNome[nm] || ''))} /></div>
          <div className="adj-fg"><label>Data do Ajuste *</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="adj-fg"><label>Unidade</label><input type="text" readOnly value={un} /></div>
          <div className="adj-fg"><label>Motivo *</label><select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8' }}>Lojas — marque e informe a nova quantidade</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{sel.size} loja(s) selecionada(s)</div>
          </div>
          <input className="cm-grid-search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="cm-grid-wrap">
            <table className="cm-grid">
              <thead><tr>
                <th className="c-sel"><input type="checkbox" checked={lojas.length > 0 && sel.size === lojas.length} onChange={(e) => toggleTodas(e.target.checked)} /></th>
                <th>Loja</th><th>Un.</th><th className="c-num">Saldo Atual</th><th className="c-num">Nova Quantidade</th><th className="c-num">Diferença</th><th>Situação</th>
              </tr></thead>
              <tbody>
                {!insumoId ? <tr><td colSpan={7} className="cm-grid-empty">Selecione um insumo primeiro</td></tr>
                  : vis.length === 0 ? <tr><td colSpan={7} className="cm-grid-empty">Nenhuma loja encontrada.</td></tr>
                  : vis.map((l) => {
                    const s = saldoDe(l.id); const atual = Number(s.quantidade) || 0; const on = sel.has(l.id); const nv = nova[l.id]
                    const tem = nv !== undefined && nv !== '' && !isNaN(parseFloat(nv))
                    let dif: React.ReactNode = '—', sit: React.ReactNode = <span style={{ color: '#94a3b8' }}>—</span>
                    if (on && tem) { const d = parseFloat(nv) - atual; dif = d === 0 ? '0,000' : <span className={d > 0 ? 'up' : 'down'}>{d > 0 ? '+' : ''}{fmtQ(d)}</span>; sit = d === 0 ? <span style={{ color: '#94a3b8' }}>sem mudança</span> : <span style={{ color: '#16a34a' }}>● Será ajustada</span> }
                    else if (on) sit = <span style={{ color: '#f59e0b' }}>aguardando quantidade</span>
                    return (
                      <tr key={l.id} className={on ? 'sel' : ''}>
                        <td className="c-sel"><input type="checkbox" checked={on} onChange={(e) => toggleLoja(l.id, e.target.checked)} /></td>
                        <td>{l.nome}</td><td>{un}</td><td className="c-num">{fmtQ(atual)}</td>
                        <td className="c-num"><input className="gnova" type="number" step="0.001" value={nv ?? ''} disabled={!on} onChange={(e) => setNova((prev) => ({ ...prev, [l.id]: e.target.value }))} /></td>
                        <td className="c-num">{dif}</td><td>{sit}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adj-card" style={{ maxWidth: 940 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div className="adj-sec-head" style={{ margin: 0 }}>Histórico de Ajustes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>Período:<input type="date" className="field" style={{ height: 30 }} value={logDe} onChange={(e) => setLogDe(e.target.value)} />até<input type="date" className="field" style={{ height: 30 }} value={logAte} onChange={(e) => setLogAte(e.target.value)} /></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Data</th><th>Insumo</th><th>Tipo</th><th className="r">Qtd</th><th>Motivo</th></tr></thead>
          <tbody>
            {logsFiltrados.length === 0 ? <tr><td colSpan={5} className="empty">Nenhum ajuste encontrado.</td></tr>
              : logsFiltrados.map((r, i) => <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{fmtDH(r.criado_em)}</td><td style={{ fontWeight: 500 }}>{insMap[r.insumo_id || '']?.nome || '—'}</td><td><span className={'badge ' + (r.dir === 'pos' ? 'b-pos' : 'b-neg')}>{r.dir === 'pos' ? '＋ Entrada' : '－ Saída'}</span></td><td className="r mono">{fmtQ(r.quantidade)}</td><td style={{ color: '#64748b', fontSize: 12 }}>{r.motivo || '—'}</td></tr>)}
          </tbody>
        </table></div>
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
