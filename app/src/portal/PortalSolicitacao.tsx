import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Solicitação de Compra — o gerente seleciona insumos por grupo,
// informa quantidades e envia a solicitação para Compras. Fiel ao loja.html.

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; preco_compra?: number; unidade_medida?: string; unidade_compra?: string }
type Grupo = { id: string; nome?: string; ativo?: boolean }
type GI = { grupo_id: string; insumo_id: string }
type Saldo = { insumo_id: string; quantidade?: number }
type PedidoMin = { id: string; status?: string; data_pedido?: string; created_at?: string; observacao?: string | null; data_entrega_prevista?: string | null; itens_pedido?: { count: number }[] }
type ItemPed = { id: string; insumo_id: string; quantidade?: number; unidade?: string }
const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

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
  const [aba, setAba] = useState<'nova' | 'minhas'>('nova')
  const [verPed, setVerPed] = useState<PedidoMin | null>(null)
  const [entrega, setEntrega] = useState(hoje7()); const [obs, setObs] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ msg: m, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  const { data: insumos = [] } = useQuery({ queryKey: ['psol-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,categoria,codigo_interno,preco_compra,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Insumo[] } })
  const { data: grupos = [] } = useQuery({ queryKey: ['psol-grupos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra').select('id,nome,ativo').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Grupo[] } })
  const { data: gci = [] } = useQuery({ queryKey: ['psol-gci', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra_itens').select('grupo_id,insumo_id').eq('tenant_id', tenantId); return (data ?? []) as GI[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['psol-saldos', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Saldo[] } })
  // solicitações já enviadas por esta loja (histórico)
  const { data: minhas = [] } = useQuery({ queryKey: ['psol-minhas', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('pedidos_compra').select('id,status,data_pedido,created_at,observacao,data_entrega_prevista,itens_pedido(count)').eq('tenant_id', tenantId).eq('loja_id', lojaId!).order('created_at', { ascending: false }).limit(50); return (data ?? []) as PedidoMin[] } })
  const { data: lojaNome = '' } = useQuery({ queryKey: ['psol-loja', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('lojas').select('nome').eq('id', lojaId!).single(); return (data?.nome as string) || '' } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const saldoMap = useMemo(() => Object.fromEntries(saldos.map((s) => [s.insumo_id, s.quantidade])) as Record<string, number>, [saldos])
  const gruposItens = useMemo(() => { const m: Record<string, string[]> = {}; gci.forEach((g) => { if (insMap[g.insumo_id]) (m[g.grupo_id] ||= []).push(g.insumo_id) }); return m }, [gci, insMap])
  const defUn = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'

  const [buscado, setBuscado] = useState<{ grupo: string; busca: string } | null>(null)
  const buscar = () => setBuscado({ grupo: filGrupo, busca })
  const resultado = useMemo(() => {
    if (!buscado) return []
    const b = buscado.busca.toLowerCase().trim()
    const gs = grupos.filter((g) => (gruposItens[g.id] || []).length && (!buscado.grupo || g.id === buscado.grupo))
    return gs.map((g) => { let itens = (gruposItens[g.id] || []).map((id) => insMap[id]).filter(Boolean) as Insumo[]; if (b) itens = itens.filter((i) => (i.nome || '').toLowerCase().includes(b) || (i.categoria || '').toLowerCase().includes(b)); return { g, itens } }).filter((x) => x.itens.length)
  }, [buscado, grupos, gruposItens, insMap])

  const toggle = (id: string, on: boolean) => {
    setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n })
    if (on) { setQty((q) => (q[id] ? q : { ...q, [id]: '1' })); setUn((u) => (u[id] ? u : { ...u, [id]: defUn(insMap[id]) })) }
  }
  // NÃO mexer na seleção ao editar a quantidade — senão limpar o campo remove a linha.
  // Quantidade vazia/zero é barrada no envio (ver enviarMut).
  const onQty = (id: string, v: string) => { setQty((q) => ({ ...q, [id]: v })); setUn((u) => (u[id] ? u : { ...u, [id]: defUn(insMap[id]) })) }

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['psol-minhas'] }); setSel(new Set()); setQty({}); setUn({}); setSheet(false); setAba('minhas'); showToast('Solicitação enviada com sucesso!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const fmtV = (v?: number) => (v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000')

  return (
    <div style={{ paddingBottom: nSel > 0 ? 70 : 0 }}>
      <div className="p-ttl">Solicitação de Compra</div>
      <div className="p-sub">Selecione os itens por grupo, informe as quantidades e envie para Compras.</div>

      <div style={{ display: 'flex', gap: 8, margin: '4px 0 14px' }}>
        <button className={'p-btn' + (aba === 'nova' ? ' p-btn-pri' : '')} onClick={() => setAba('nova')}>Nova solicitação</button>
        <button className={'p-btn' + (aba === 'minhas' ? ' p-btn-pri' : '')} onClick={() => setAba('minhas')}>Minhas solicitações{minhas.length ? ` (${minhas.length})` : ''}</button>
      </div>

      {aba === 'minhas' && <MinhasSolicitacoes lista={minhas} insMap={insMap} onVer={setVerPed} />}

      {aba === 'nova' && <>
      <div className="pf-bar" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <input className="p-field" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar item, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} />
        <select className="p-field" value={filGrupo} onChange={(e) => setFilGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.filter((g) => (gruposItens[g.id] || []).length).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
        <button className="p-btn p-btn-pri" onClick={buscar}>Buscar</button>
      </div>

      {!buscado ? <div className="p-card"><div className="p-empty">Selecione um grupo e clique em <b>Buscar</b> para ver os itens.</div></div>
        : resultado.length === 0 ? <div className="p-card"><div className="p-empty">Nenhum item encontrado.</div></div>
        : resultado.map(({ g, itens }) => {
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
                  <thead><tr><th style={{ width: 36 }}></th><th>Código</th><th>Item</th><th>Embalagem</th><th>Estoque atual</th><th>Estoque mínimo</th></tr></thead>
                  <tbody>
                    {itens.map((ins) => {
                      const atual = saldoMap[ins.id]
                      return (
                        <tr key={ins.id} style={{ background: sel.has(ins.id) ? '#fff7ed' : undefined }}>
                          <td className="c"><input type="checkbox" style={{ width: 16, height: 16, accentColor: '#f97316' }} checked={sel.has(ins.id)} onChange={(e) => toggle(ins.id, e.target.checked)} /></td>
                          <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{fmtCod(ins.codigo_interno)}</td>
                          <td style={{ fontWeight: 600 }}>{ins.nome}</td>
                          <td style={{ fontSize: 12, color: '#475569' }}>{embalagem(ins)}</td>
                          <td style={{ color: '#64748b' }}>{fmtV(atual)}</td>
                          <td style={{ color: '#64748b' }}>0,000</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </>}

      {/* barra inferior */}
      {nSel > 0 && aba === 'nova' && (
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
                      <td style={{ color: '#64748b' }}>{fmtV(saldoMap[id])}</td>
                      <td style={{ color: '#64748b' }}>—</td>
                      <td style={{ color: '#64748b' }}>—</td>
                      <td className="r"><input type="text" inputMode="decimal" value={qty[id] ?? ''} onChange={(e) => onQty(id, e.target.value)} style={{ width: 96, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 10px', fontFamily: 'DM Mono, monospace', fontSize: 13.5, color: '#0f172a', background: '#fff' }} /></td>
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

      {verPed && <VerEditarSolic pedido={verPed} insMap={insMap} lojaNome={lojaNome} onClose={() => setVerPed(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['psol-minhas'] }); setVerPed(null); showToast('Solicitação atualizada!') }} />}

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}

// ── Lista "Minhas solicitações" ──
function MinhasSolicitacoes({ lista, insMap, onVer }: { lista: PedidoMin[]; insMap: Record<string, Insumo>; onVer: (p: PedidoMin) => void }) {
  const ST: Record<string, { l: string; c: string; b: string }> = { solicitado: { l: 'Aguardando', c: '#92400e', b: '#fef3c7' }, processado: { l: 'Processado', c: '#166534', b: '#dcfce7' }, cancelado: { l: 'Cancelado', c: '#991b1b', b: '#fee2e2' } }
  if (!lista.length) return <div className="p-card"><div className="p-empty">Você ainda não enviou nenhuma solicitação.</div></div>
  return (
    <div className="p-card">
      <table className="p-tbl">
        <thead><tr><th>Data</th><th>Itens</th><th>Status</th><th>Observação</th><th></th></tr></thead>
        <tbody>
          {lista.map((p) => {
            const st = ST[p.status || ''] || { l: p.status || '—', c: '#475569', b: '#f1f5f9' }
            const n = p.itens_pedido?.[0]?.count ?? 0
            const dt = (p.created_at || p.data_pedido || '').slice(0, 10)
            return (
              <tr key={p.id}>
                <td className="mono" style={{ fontSize: 12 }}>{dt ? new Date(dt + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                <td>{n}</td>
                <td><span style={{ background: st.b, color: st.c, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>{st.l}</span></td>
                <td style={{ color: '#64748b', fontSize: 12 }}>{p.observacao || '—'}</td>
                <td className="r"><button className="p-btn" onClick={() => onVer(p)}>{p.status === 'solicitado' ? 'Ver / Editar' : 'Ver'}</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal Ver / Editar uma solicitação (edita só se status = solicitado/Aguardando) ──
function VerEditarSolic({ pedido, insMap, lojaNome, onClose, onSaved }: { pedido: PedidoMin; insMap: Record<string, Insumo>; lojaNome: string; onClose: () => void; onSaved: () => void }) {
  const editavel = pedido.status === 'solicitado'
  const [itens, setItens] = useState<{ id: string; insumo_id: string; qtd: string; un: string }[]>([])
  const [orig, setOrig] = useState<string[]>([])
  const [obs, setObs] = useState(pedido.observacao || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('itens_pedido').select('id,insumo_id,quantidade,unidade').eq('pedido_id', pedido.id)
      if (!alive) return
      const rows = (data ?? []) as ItemPed[]
      setItens(rows.map((r) => ({ id: r.id, insumo_id: r.insumo_id, qtd: String(r.quantidade ?? 0), un: r.unidade || 'un' })))
      setOrig(rows.map((r) => r.id))
    })()
    return () => { alive = false }
  }, [pedido.id])

  const salvar = async () => {
    setErr('')
    const val = itens.filter((x) => num(x.qtd) > 0)
    if (!val.length) { setErr('Deixe ao menos 1 item com quantidade maior que zero.'); return }
    setBusy(true)
    try {
      const removed = orig.filter((id) => !itens.some((x) => x.id === id))
      if (removed.length) { const { error } = await supabase.from('itens_pedido').delete().in('id', removed); if (error) throw error }
      for (const it of val) { const { error } = await supabase.from('itens_pedido').update({ quantidade: num(it.qtd), unidade: it.un }).eq('id', it.id); if (error) throw error }
      const { error: e2 } = await supabase.from('pedidos_compra').update({ observacao: obs.trim() || null }).eq('id', pedido.id); if (e2) throw e2
      onSaved()
    } catch (e) { setErr('Erro: ' + (e as Error).message) } finally { setBusy(false) }
  }
  const pdf = () => imprimirSolicitacao(pedido, itens.filter((x) => num(x.qtd) > 0).map((x) => ({ nome: insMap[x.insumo_id]?.nome || x.insumo_id, qtd: num(x.qtd), un: x.un })), lojaNome, obs)

  return (
    <div className="p-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="p-modal">
        <div className="mh"><h2>Solicitação {editavel ? '— editar' : '(processada)'}</h2><button className="p-mx" onClick={onClose}>✕</button></div>
        <div className="mb">
          {!editavel && <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 }}>Este pedido já foi <b>processado</b> por Compras — só pode ser visualizado.</div>}
          <table className="p-tbl">
            <thead><tr><th>Item</th><th className="r">Quantidade</th><th>Un.</th>{editavel && <th></th>}</tr></thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 600 }}>{insMap[it.insumo_id]?.nome || it.insumo_id}</td>
                  <td className="r">{editavel
                    ? <input type="text" inputMode="decimal" value={it.qtd} onChange={(e) => setItens((a) => a.map((x) => x.id === it.id ? { ...x, qtd: e.target.value } : x))} style={{ width: 90, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 10px', fontFamily: 'DM Mono, monospace', fontSize: 13.5 }} />
                    : <span className="mono">{it.qtd}</span>}</td>
                  <td>{editavel
                    ? <select value={it.un} onChange={(e) => setItens((a) => a.map((x) => x.id === it.id ? { ...x, un: e.target.value } : x))} style={{ height: 26, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    : it.un}</td>
                  {editavel && <td className="r"><button className="p-btn" title="Remover item" onClick={() => setItens((a) => a.filter((x) => x.id !== it.id))}>🗑</button></td>}
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={4} className="p-empty">Sem itens.</td></tr>}
            </tbody>
          </table>
          <div className="pf-fld" style={{ marginTop: 12 }}><label>Observação</label><input className="p-field" value={obs} disabled={!editavel} onChange={(e) => setObs(e.target.value)} placeholder="(opcional)" /></div>
          {err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
        <div className="mf" style={{ justifyContent: 'space-between' }}>
          <button className="p-btn" onClick={pdf}>🖨️ PDF / Imprimir</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="p-btn" onClick={onClose}>Fechar</button>
            {editavel && <button className="p-btn p-btn-pri" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// PDF/impressão de UMA solicitação — abre a folha com botão manual (não trava)
function imprimirSolicitacao(pedido: PedidoMin, itens: { nome: string; qtd: number; un: string }[], lojaNome: string, obs: string) {
  const dt = (pedido.created_at || pedido.data_pedido || '').slice(0, 10) || hojeStr()
  const data = new Date(dt + 'T12:00:00').toLocaleDateString('pt-BR')
  const stLbl: Record<string, string> = { solicitado: 'Aguardando', processado: 'Processado', cancelado: 'Cancelado' }
  const linhas = itens.map((it) => `<tr><td>${esc(it.nome)}</td><td class="q">${it.qtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${esc(it.un)}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Solicitação — ${esc(lojaNome)} — ${data}</title><style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}body{background:#fff;color:#0f172a;padding:24px;max-width:720px;margin:0 auto}
    .toolbar{position:sticky;top:0;background:#0f2a52;padding:12px;text-align:center;margin:-24px -24px 16px}
    .toolbar button{background:#f97316;color:#fff;border:0;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer}
    .brand{font-weight:800;font-size:16px;color:#00b890;border-bottom:2px solid #00d4aa;padding-bottom:6px;margin-bottom:10px}.brand span{color:#94a3b8;font-weight:600;font-size:12px}
    h1{font-size:15px;margin-bottom:2px}.meta{color:#64748b;font-size:12.5px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:13px}td,th{border:1px solid #cbd5e1;padding:7px 10px;text-align:left}th{background:#1e2030;color:#fff}.q{text-align:right;font-weight:700;white-space:nowrap}
    .obs{margin-top:12px;font-size:12.5px;color:#334155}
    @media print{.toolbar{display:none}body{padding:0}}
  </style></head><body>
    <div class="toolbar"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
    <div class="brand">Aiko <span>· solicitação de compra</span></div>
    <h1>${esc(lojaNome)}</h1><div class="meta">Data: ${data}${pedido.status ? ' · ' + (stLbl[pedido.status] || esc(pedido.status)) : ''}</div>
    <table><thead><tr><th>Item</th><th class="q">Quantidade</th></tr></thead><tbody>${linhas}</tbody></table>
    ${obs ? `<div class="obs"><b>Observação:</b> ${esc(obs)}</div>` : ''}
  </body></html>`
  const win = window.open('', '_blank')
  if (!win) { alert('O navegador bloqueou a janela do PDF. Libere os pop-ups deste site e tente de novo.'); return }
  win.document.write(html); win.document.close()
}
