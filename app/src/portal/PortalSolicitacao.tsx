import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Solicitação de Compra — o gerente seleciona insumos por grupo,
// informa quantidades e envia a solicitação para Compras. Fiel ao loja.html.

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; preco_compra?: number; unidade_medida?: string; unidade_compra?: string }
type Grupo = { id: string; nome?: string; ativo?: boolean }
type GI = { grupo_id: string; insumo_id: string }
type Saldo = { insumo_id: string; quantidade?: number }

const UNIDADES = ['kg', 'g', 'un', 'pct', 'litro', 'ml', 'cx', 'fardo', 'bd', 'sc']
const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0
const hoje7 = () => new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
const hojeStr = () => new Date().toLocaleDateString('en-CA')
const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const EMB: Record<string, string> = { kg: 'QUILOGRAMA', g: 'GRAMA', l: 'LITRO', litro: 'LITRO', ml: 'MILILITRO', un: 'UNIDADE', unid: 'UNIDADE', cx: 'CAIXA', pct: 'PACOTE', fd: 'FARDO', fardo: 'FARDO' }
const embalagem = (i?: { unidade_compra?: string; unidade_medida?: string }) => { const u = (i?.unidade_compra || i?.unidade_medida || '').toLowerCase().trim(); return EMB[u] || (u ? u.toUpperCase() : '—') }

export function PortalSolicitacao() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()

  const [busca, setBusca] = useState(''); const [filGrupo, setFilGrupo] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [un, setUn] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [colapso, setColapso] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState(false)
  const [entrega, setEntrega] = useState(hoje7()); const [obs, setObs] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ msg: m, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  const { data: insumos = [] } = useQuery({ queryKey: ['psol-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,categoria,codigo_interno,preco_compra,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Insumo[] } })
  const { data: grupos = [] } = useQuery({ queryKey: ['psol-grupos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra').select('id,nome,ativo').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Grupo[] } })
  const { data: gci = [] } = useQuery({ queryKey: ['psol-gci', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra_itens').select('grupo_id,insumo_id').eq('tenant_id', tenantId); return (data ?? []) as GI[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['psol-saldos', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Saldo[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const saldoMap = useMemo(() => Object.fromEntries(saldos.map((s) => [s.insumo_id, s.quantidade])) as Record<string, number>, [saldos])
  const gruposItens = useMemo(() => { const m: Record<string, string[]> = {}; gci.forEach((g) => { if (insMap[g.insumo_id]) (m[g.grupo_id] ||= []).push(g.insumo_id) }); return m }, [gci, insMap])
  const defUn = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'

  const gruposVis = useMemo(() => grupos.filter((g) => (gruposItens[g.id] || []).length && (!filGrupo || g.id === filGrupo)), [grupos, gruposItens, filGrupo])
  const gruposComGrupos = useMemo(() => { const b = busca.toLowerCase().trim(); return gruposVis.map((g) => { let itens = (gruposItens[g.id] || []).map((id) => insMap[id]).filter(Boolean) as Insumo[]; if (b) itens = itens.filter((i) => (i.nome || '').toLowerCase().includes(b) || (i.categoria || '').toLowerCase().includes(b)); return { g, itens } }).filter((x) => x.itens.length) }, [gruposVis, gruposItens, insMap, busca])

  const toggle = (id: string, on: boolean) => {
    setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n })
    if (on) { setQty((q) => (q[id] ? q : { ...q, [id]: '1' })); setUn((u) => (u[id] ? u : { ...u, [id]: defUn(insMap[id]) })) }
  }
  const onQty = (id: string, v: string) => { setQty((q) => ({ ...q, [id]: v })); setSel((s) => { const n = new Set(s); num(v) > 0 ? n.add(id) : n.delete(id); return n }); setUn((u) => (u[id] ? u : { ...u, [id]: defUn(insMap[id]) })) }

  const selIds = [...sel]
  const nSel = selIds.length
  const totalEst = selIds.reduce((a, id) => a + (insMap[id]?.preco_compra || 0) * num(qty[id]), 0)
  const kgTotal = selIds.reduce((a, id) => a + num(qty[id]), 0)

  const enviarMut = useMutation({
    mutationFn: async () => {
      if (!lojaId) throw new Error('Loja não associada ao seu perfil.')
      for (const id of selIds) if (num(qty[id]) <= 0) throw new Error('Informe a quantidade de todos os itens.')
      if (!selIds.length) throw new Error('Selecione ao menos um item.')
      const { data: ped, error } = await supabase.from('pedidos_compra').insert({ tenant_id: tenantId, loja_id: lojaId, fornecedor_id: null, status: 'solicitado', data_pedido: hojeStr(), data_entrega_prevista: entrega || null, observacao: obs.trim() || null, solicitante_id: usuario?.id || null }).select('id').single()
      if (error) throw error
      const pedId = (ped as { id: string }).id
      const rows = selIds.map((id) => ({ pedido_id: pedId, insumo_id: id, quantidade: num(qty[id]), unidade: un[id] || defUn(insMap[id]), preco_unitario: null }))
      const { error: e2 } = await supabase.from('itens_pedido').insert(rows); if (e2) throw e2
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['psol'] }); setSel(new Set()); setQty({}); setUn({}); setSheet(false); showToast('Solicitação enviada com sucesso!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const fmtV = (v: number | undefined, u: string) => (v != null ? `${v} ${u}` : '—')

  return (
    <div style={{ paddingBottom: nSel > 0 ? 70 : 0 }}>
      <div className="p-ttl">Solicitação de Compra</div>
      <div className="p-sub">Selecione os itens por grupo, informe as quantidades e envie para Compras.</div>

      <div className="pf-bar">
        <input className="p-field" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar item, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="p-field" value={filGrupo} onChange={(e) => setFilGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.filter((g) => (gruposItens[g.id] || []).length).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
      </div>

      {gruposComGrupos.length === 0 ? <div className="p-card"><div className="p-empty">Nenhum grupo/item encontrado.</div></div>
        : gruposComGrupos.map(({ g, itens }) => {
          const aberto = !colapso.has(g.id)
          return (
            <div className="p-card" key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', background: '#f8fafc' }} onClick={() => setColapso((c) => { const n = new Set(c); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{g.nome}</span>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{itens.length} itens</span>
                <span style={{ marginLeft: 'auto', color: '#94a3b8', transform: aberto ? 'none' : 'rotate(-90deg)', transition: '.15s' }}>▾</span>
              </div>
              {aberto && (
                <table className="p-tbl">
                  <thead><tr><th style={{ width: 36 }}></th><th>Código</th><th>Item</th><th>Embalagem</th><th>Estoque atual</th><th>Estoque mínimo</th><th>Solicitar</th></tr></thead>
                  <tbody>
                    {itens.map((ins) => {
                      const u = defUn(ins)
                      const atual = saldoMap[ins.id]
                      return (
                        <tr key={ins.id} style={{ background: sel.has(ins.id) ? '#fff7ed' : undefined }}>
                          <td className="c"><input type="checkbox" style={{ width: 16, height: 16, accentColor: '#f97316' }} checked={sel.has(ins.id)} onChange={(e) => toggle(ins.id, e.target.checked)} /></td>
                          <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{fmtCod(ins.codigo_interno)}</td>
                          <td style={{ fontWeight: 600 }}>{ins.nome}</td>
                          <td style={{ fontSize: 12, color: '#475569' }}>{embalagem(ins)}</td>
                          <td style={{ color: '#64748b' }}>{fmtV(atual, u)}</td>
                          <td style={{ color: '#64748b' }}>—</td>
                          <td><input type="number" min="0" step="0.001" value={qty[ins.id] ?? ''} onChange={(e) => onQty(ins.id, e.target.value)} style={{ width: 90, height: 24, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12 }} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}

      {/* barra inferior */}
      {nSel > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 220, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16, zIndex: 40, boxShadow: '0 -4px 16px rgba(0,0,0,.06)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🛒 {nSel} {nSel === 1 ? 'item selecionado' : 'itens selecionados'}</span>
          <span style={{ fontSize: 12.5, color: '#64748b' }}>{kgTotal.toFixed(1)} kg no total</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>Total estimado: <b style={{ color: '#0f172a' }}>{brl(totalEst)}</b></span>
          <button className="p-btn p-btn-pri" style={{ marginLeft: 'auto' }} onClick={() => { setEntrega(hoje7()); setObs(''); setSheet(true) }}>Continuar pedido →</button>
        </div>
      )}

      {/* sheet finalizar */}
      {sheet && (
        <div className="p-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false) }}>
          <div className="p-modal">
            <div className="mh"><h2>Finalizar solicitação</h2><button className="p-mx" onClick={() => setSheet(false)}>✕</button></div>
            <div className="mb">
              <table className="p-tbl">
                <thead><tr><th>Item</th><th>Atual</th><th>Mínimo</th><th>Sugestão</th><th className="r">Quantidade *</th><th>Embalagem</th></tr></thead>
                <tbody>
                  {selIds.map((id) => { const ins = insMap[id]; const u = defUn(ins); return (
                    <tr key={id}>
                      <td style={{ fontWeight: 600 }}>{ins?.nome || id}</td>
                      <td style={{ color: '#64748b' }}>{fmtV(saldoMap[id], u)}</td>
                      <td style={{ color: '#64748b' }}>—</td>
                      <td style={{ color: '#64748b' }}>—</td>
                      <td className="r"><input type="number" min="0" step="0.001" value={qty[id] ?? ''} onChange={(e) => onQty(id, e.target.value)} style={{ width: 90, height: 24, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12 }} /></td>
                      <td><select value={un[id] || u} onChange={(e) => setUn((uu) => ({ ...uu, [id]: e.target.value }))} style={{ height: 24, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>{UNIDADES.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                    </tr>
                  ) })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                <div className="pf-fld"><label>Entrega prevista</label><input type="date" className="p-field" value={entrega} onChange={(e) => setEntrega(e.target.value)} /></div>
                <div className="pf-fld" style={{ flex: 1, minWidth: 220 }}><label>Observação</label><input className="p-field" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="(opcional)" /></div>
              </div>
            </div>
            <div className="mf" style={{ justifyContent: 'flex-end' }}>
              <button className="p-btn" onClick={() => setSheet(false)}>Voltar</button>
              <button className="p-btn p-btn-pri" disabled={enviarMut.isPending} onClick={() => enviarMut.mutate()}>{enviarMut.isPending ? 'Enviando…' : 'Enviar Solicitação'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
