import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Requisição ao CD — o gerente da filial pede itens ao Centro de Distribuição.
// Espelha a Solicitação de Compra (mesma UX), mas grava em `requisicoes`/`requisicao_itens`
// e mostra o estoque disponível no CD. O CD atende na "Central de Distribuição" (app).

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; preco_compra?: number; unidade_medida?: string; unidade_compra?: string }
type Grupo = { id: string; nome?: string; ativo?: boolean }
type GI = { grupo_id: string; insumo_id: string }
type Saldo = { insumo_id: string; quantidade?: number }
type Loja = { id: string; nome?: string; is_cd?: boolean }
type Req = { id: string; numero?: number; status?: string; created_at?: string; requisicao_itens?: { count: number }[] }

const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0
const hojeStr = () => new Date().toLocaleDateString('en-CA')
const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const fmtV = (v?: number) => (v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000')
const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'

const ST: Record<string, { lb: string; cls: string }> = {
  enviada:      { lb: 'Enviada ao CD',       cls: 'st-env' },
  em_separacao: { lb: 'Em separação no CD',  cls: 'st-sep' },
  a_caminho:    { lb: 'A caminho',           cls: 'st-cam' },
  recebida:     { lb: 'Recebida',            cls: 'st-rec' },
  cancelada:    { lb: 'Cancelada',           cls: 'st-can' },
}

export function PortalRequisicaoCD() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()

  const [busca, setBusca] = useState(''); const [filGrupo, setFilGrupo] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [colapso, setColapso] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState(false)
  const [obs, setObs] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ msg: m, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  const { data: insumos = [] } = useQuery({ queryKey: ['preq-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,categoria,codigo_interno,preco_compra,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Insumo[] } })
  const { data: grupos = [] } = useQuery({ queryKey: ['preq-grupos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra').select('id,nome,ativo').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Grupo[] } })
  const { data: gci = [] } = useQuery({ queryKey: ['preq-gci', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra_itens').select('grupo_id,insumo_id').eq('tenant_id', tenantId); return (data ?? []) as GI[] } })
  const { data: lojas = [] } = useQuery({ queryKey: ['preq-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome,is_cd').eq('tenant_id', tenantId); return (data ?? []) as Loja[] } })
  const { data: meusSaldos = [] } = useQuery({ queryKey: ['preq-saldo-loja', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Saldo[] } })

  const cdLoja = useMemo(() => lojas.find((l) => l.is_cd && l.id !== lojaId) || lojas.find((l) => l.is_cd) || null, [lojas, lojaId])
  const { data: saldosCd = [] } = useQuery({ queryKey: ['preq-saldo-cd', tenantId, cdLoja?.id], enabled: !!tenantId && !!cdLoja?.id, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', cdLoja!.id); return (data ?? []) as Saldo[] } })

  // modo de distribuição do tenant (default 'transferencia' quando o parâmetro não existe)
  const { data: modo = 'transferencia' } = useQuery({ queryKey: ['preq-modo', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('valor').eq('tenant_id', tenantId).eq('modulo', 'distribuicao').eq('chave', 'modo').limit(1); return (data?.[0]?.valor as string) || 'transferencia' } })

  const { data: minhas = [], refetch: refetchMinhas } = useQuery({ queryKey: ['preq-minhas', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('requisicoes').select('id,numero,status,created_at,requisicao_itens(count)').eq('tenant_id', tenantId).eq('loja_id', lojaId!).order('created_at', { ascending: false }).limit(20); return (data ?? []) as Req[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const meuSaldoMap = useMemo(() => Object.fromEntries(meusSaldos.map((s) => [s.insumo_id, s.quantidade])) as Record<string, number>, [meusSaldos])
  const cdSaldoMap = useMemo(() => Object.fromEntries(saldosCd.map((s) => [s.insumo_id, s.quantidade])) as Record<string, number>, [saldosCd])
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
    if (on) setQty((q) => (q[id] ? q : { ...q, [id]: '1' }))
  }
  const onQty = (id: string, v: string) => setQty((q) => ({ ...q, [id]: v }))

  const selIds = [...sel]
  const nSel = selIds.length

  const enviarMut = useMutation({
    mutationFn: async () => {
      if (!lojaId) throw new Error('Loja não associada ao seu perfil.')
      if (!cdLoja) throw new Error('Nenhum Centro de Distribuição configurado. Fale com o administrador.')
      if (!selIds.length) throw new Error('Selecione ao menos um item.')
      for (const id of selIds) if (num(qty[id]) <= 0) throw new Error('Informe a quantidade de todos os itens.')
      const { data: req, error } = await supabase.from('requisicoes').insert({ tenant_id: tenantId, loja_id: lojaId, cd_loja_id: cdLoja.id, status: 'enviada', origem: 'portal', modo, observacao: obs.trim() || null, solicitante_id: usuario?.id || null }).select('id').single()
      if (error) throw error
      const reqId = (req as { id: string }).id
      const rows = selIds.map((id) => ({ requisicao_id: reqId, tenant_id: tenantId, insumo_id: id, qtd_pedida: num(qty[id]), unidade: defUn(insMap[id]), custo_unitario: insMap[id]?.preco_compra ?? null }))
      const { error: e2 } = await supabase.from('requisicao_itens').insert(rows); if (e2) throw e2
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['preq-minhas'] }); setSel(new Set()); setQty({}); setSheet(false); setBuscado(null); showToast('Requisição enviada ao CD!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const receberMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('requisicoes').update({ status: 'recebida', recebido_em: new Date().toISOString() }).eq('id', id); if (error) throw error },
    onSuccess: () => { refetchMinhas(); showToast('Recebimento confirmado!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  return (
    <div style={{ paddingBottom: nSel > 0 ? 70 : 0 }}>
      <div className="p-ttl">Requisição ao CD</div>
      <div className="p-sub">Peça ao Centro de Distribuição{cdLoja ? ` (${cdLoja.nome})` : ''} o que a sua loja precisa. O CD separa e envia.</div>

      {!cdLoja && <div className="p-card" style={{ marginBottom: 14 }}><div className="p-empty">Nenhum Centro de Distribuição configurado ainda. Peça ao administrador para marcar a loja-matriz como CD em Configurações.</div></div>}

      {/* MINHAS REQUISIÇÕES */}
      {minhas.length > 0 && (
        <div className="p-card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13.5, borderBottom: '1px solid #e2e8f0' }}>Minhas requisições</div>
          <table className="p-tbl">
            <thead><tr><th style={{ width: 90 }}>Nº</th><th>Data</th><th className="r">Itens</th><th>Situação</th><th className="c">Ação</th></tr></thead>
            <tbody>
              {minhas.map((r) => { const st = ST[r.status || 'enviada'] || ST.enviada; const n = r.requisicao_itens?.[0]?.count ?? 0; return (
                <tr key={r.id}>
                  <td className="mono">REQ-{String(r.numero ?? 0).padStart(6, '0')}</td>
                  <td style={{ color: '#64748b' }}>{fmtD(r.created_at)}</td>
                  <td className="r">{n}</td>
                  <td><span className={'req-chip ' + st.cls}>{st.lb}</span></td>
                  <td className="c">{r.status === 'a_caminho' ? <button className="p-btn p-btn-pri" style={{ height: 30, padding: '0 11px', fontSize: 12 }} disabled={receberMut.isPending} onClick={() => receberMut.mutate(r.id)}>✓ Confirmar recebimento</button> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
      )}

      {/* NOVA REQUISIÇÃO */}
      <div className="pf-bar" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <input className="p-field" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar item, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} />
        <select className="p-field" value={filGrupo} onChange={(e) => setFilGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.filter((g) => (gruposItens[g.id] || []).length).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
        <button className="p-btn p-btn-pri" onClick={buscar}>Buscar</button>
      </div>

      {!buscado ? <div className="p-card"><div className="p-empty">Selecione um grupo e clique em <b>Buscar</b> para ver os itens e montar a requisição.</div></div>
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
                  <thead><tr><th style={{ width: 36 }}></th><th>Código</th><th>Item</th><th>Meu estoque</th><th>Estoque no CD</th></tr></thead>
                  <tbody>
                    {itens.map((ins) => {
                      const cd = cdSaldoMap[ins.id]
                      const temCd = (cd ?? 0) > 0
                      return (
                        <tr key={ins.id} style={{ background: sel.has(ins.id) ? '#fff7ed' : undefined }}>
                          <td className="c"><input type="checkbox" style={{ width: 16, height: 16, accentColor: '#f97316' }} checked={sel.has(ins.id)} onChange={(e) => toggle(ins.id, e.target.checked)} /></td>
                          <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{fmtCod(ins.codigo_interno)}</td>
                          <td style={{ fontWeight: 600 }}>{ins.nome}</td>
                          <td style={{ color: '#64748b' }}>{fmtV(meuSaldoMap[ins.id])}</td>
                          <td style={{ color: temCd ? '#0f766e' : '#dc2626', fontWeight: temCd ? 600 : 400 }}>{temCd ? '✅ ' + fmtV(cd) : '— sem estoque'}</td>
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
          <span style={{ fontSize: 13, fontWeight: 600 }}>📦 {nSel} {nSel === 1 ? 'item selecionado' : 'itens selecionados'}</span>
          <button className="p-btn p-btn-pri" style={{ marginLeft: 'auto' }} disabled={!cdLoja} onClick={() => { setObs(''); setSheet(true) }}>Continuar requisição →</button>
        </div>
      )}

      {/* sheet finalizar */}
      {sheet && (
        <div className="p-ov" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false) }}>
          <div className="p-modal">
            <div className="mh"><h2>Finalizar requisição ao CD</h2><button className="p-mx" onClick={() => setSheet(false)}>✕</button></div>
            <div className="mb">
              <table className="p-tbl">
                <thead><tr><th>Item</th><th>Meu estoque</th><th>No CD</th><th className="r">Quantidade que peço *</th></tr></thead>
                <tbody>
                  {selIds.map((id) => { const ins = insMap[id]; return (
                    <tr key={id}>
                      <td style={{ fontWeight: 600 }}>{ins?.nome || id}</td>
                      <td style={{ color: '#64748b' }}>{fmtV(meuSaldoMap[id])}</td>
                      <td style={{ color: '#64748b' }}>{fmtV(cdSaldoMap[id])}</td>
                      <td className="r"><input type="text" inputMode="decimal" value={qty[id] ?? ''} onChange={(e) => onQty(id, e.target.value)} style={{ width: 96, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 10px', fontFamily: 'DM Mono, monospace', fontSize: 13.5, color: '#0f172a', background: '#fff' }} /></td>
                    </tr>
                  ) })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
                <div className="pf-fld" style={{ flex: 1, minWidth: 220 }}><label>Observação</label><input className="p-field" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="(opcional)" /></div>
              </div>
            </div>
            <div className="mf" style={{ justifyContent: 'flex-end' }}>
              <button className="p-btn" onClick={() => setSheet(false)}>Voltar</button>
              <button className="p-btn p-btn-pri" disabled={enviarMut.isPending} onClick={() => enviarMut.mutate()}>{enviarMut.isPending ? 'Enviando…' : '📤 Enviar ao CD'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
