import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './fiscal.css'
import './distribuicao.css'

// Distribuição › Central de Distribuição — o CD (matriz) atende as requisições das
// filiais: separa, gera romaneio e confirma o envio (dispara transferir_estoque CD→filial).

type Req = { id: string; numero?: number; loja_id?: string; cd_loja_id?: string; status?: string; origem?: string; modo?: string; observacao?: string; valor_total?: number; created_at?: string; requisicao_itens?: { count: number }[] }
type Item = { id: string; requisicao_id: string; insumo_id: string; qtd_pedida?: number; qtd_atendida?: number; unidade?: string; custo_unitario?: number }
type Insumo = { id: string; nome?: string; unidade_medida?: string }
type Saldo = { insumo_id: string; quantidade?: number }
type Loja = { id: string; nome?: string; cnpj?: string; is_cd?: boolean }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0
const reqNo = (n?: number) => 'REQ-' + String(n ?? 0).padStart(6, '0')

const ST: Record<string, { lb: string; cls: string }> = {
  enviada: { lb: 'Nova', cls: 'd-nova' }, em_separacao: { lb: 'Em separação', cls: 'd-sep' },
  a_caminho: { lb: 'Enviada', cls: 'd-env' }, recebida: { lb: 'Recebida', cls: 'd-rec' }, cancelada: { lb: 'Cancelada', cls: 'd-can' },
}

export function DistribuicaoCentral() {
  const { tenantId, usuario } = useAuth()
  const qc = useQueryClient()
  const [fStatus, setFStatus] = useState('ativas')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Req | null>(null)
  const [atend, setAtend] = useState<Record<string, string>>({})
  const [rom, setRom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3500) }

  const { data: reqs = [], isLoading } = useQuery({ queryKey: ['dist-reqs', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Req>((f, t) => supabase.from('requisicoes').select('*, requisicao_itens(count)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['dist-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome,cnpj,is_cd').eq('tenant_id', tenantId); return (data ?? []) as Loja[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['dist-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId).range(f, t)) })

  // itens + saldo do CD da requisição selecionada
  const { data: itens = [] } = useQuery({ queryKey: ['dist-itens', sel?.id], enabled: !!sel?.id, queryFn: async () => { const { data } = await supabase.from('requisicao_itens').select('*').eq('requisicao_id', sel!.id).order('id'); return (data ?? []) as Item[] } })
  const { data: saldosCd = [] } = useQuery({ queryKey: ['dist-saldocd', sel?.cd_loja_id], enabled: !!sel?.cd_loja_id, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', sel!.cd_loja_id!); return (data ?? []) as Saldo[] } })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l])) as Record<string, Loja>, [lojas])
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const cdSaldoMap = useMemo(() => Object.fromEntries(saldosCd.map((s) => [s.insumo_id, s.quantidade ?? 0])) as Record<string, number>, [saldosCd])

  const cnt = useMemo(() => ({
    novas: reqs.filter((r) => r.status === 'enviada').length,
    sep: reqs.filter((r) => r.status === 'em_separacao').length,
    env: reqs.filter((r) => r.status === 'a_caminho').length,
  }), [reqs])

  const lista = useMemo(() => {
    const b = busca.toLowerCase().trim()
    return reqs.filter((r) => {
      if (fStatus === 'ativas' && !['enviada', 'em_separacao'].includes(r.status || '')) return false
      if (fStatus === 'transito' && r.status !== 'a_caminho') return false
      if (fStatus === 'concluidas' && r.status !== 'recebida') return false
      if (b) { const nome = (lojaMap[r.loja_id || '']?.nome || '').toLowerCase(); if (!reqNo(r.numero).toLowerCase().includes(b) && !nome.includes(b)) return false }
      return true
    })
  }, [reqs, fStatus, busca, lojaMap])

  const abrir = (r: Req) => { setSel(r); setAtend({}) }

  // quando itens/saldo chegam, inicializa o atendido (pedido limitado ao saldo do CD)
  useEffect(() => {
    if (!sel || !itens.length) return
    const init: Record<string, string> = {}
    for (const it of itens) { const ped = it.qtd_pedida ?? 0; const disp = cdSaldoMap[it.insumo_id] ?? 0; init[it.id] = String(it.qtd_atendida ?? Math.min(ped, disp)) }
    setAtend(init)
  }, [sel?.id, itens, cdSaldoMap])

  const resumo = useMemo(() => {
    let itensAt = 0, valor = 0
    for (const it of itens) { const q = num(atend[it.id]); if (q > 0) { itensAt++; valor += q * (it.custo_unitario ?? 0) } }
    return { itensAt, total: itens.length, valor }
  }, [itens, atend])

  const marcarSeparando = async () => {
    if (!sel) return
    setBusy(true)
    try { const { error } = await supabase.from('requisicoes').update({ status: 'em_separacao', separado_em: new Date().toISOString() }).eq('id', sel.id); if (error) throw error; setSel({ ...sel, status: 'em_separacao' }); qc.invalidateQueries({ queryKey: ['dist-reqs'] }); showToast('Requisição em separação.') }
    catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }

  const confirmarEnvio = async () => {
    if (!sel || !sel.cd_loja_id) { showToast('Requisição sem CD de origem definido.', 'err'); return }
    if (!confirm(`Confirmar o envio da ${reqNo(sel.numero)}? Isso dá baixa no CD e entrada na filial (transferência).`)) return
    setBusy(true)
    try {
      const nowIso = new Date().toISOString()
      let enviados = 0, valor = 0
      for (const it of itens) {
        const q = num(atend[it.id]); if (q <= 0) continue
        const { error } = await supabase.rpc('transferir_estoque', { p_tenant: tenantId, p_insumo: it.insumo_id, p_origem: sel.cd_loja_id, p_destino: sel.loja_id, p_qtd: q, p_data: nowIso, p_motivo: 'Distribuição ' + reqNo(sel.numero), p_responsavel: usuario?.nome || null })
        if (error) throw new Error(`Item ${insMap[it.insumo_id]?.nome || ''}: ${error.message}`)
        await supabase.from('requisicao_itens').update({ qtd_atendida: q }).eq('id', it.id)
        enviados++; valor += q * (it.custo_unitario ?? 0)
      }
      if (!enviados) throw new Error('Informe a quantidade atendida de ao menos um item.')
      const { error: e2 } = await supabase.from('requisicoes').update({ status: 'a_caminho', enviado_em: nowIso, valor_total: valor }).eq('id', sel.id); if (e2) throw e2
      qc.invalidateQueries({ queryKey: ['dist-reqs'] }); qc.invalidateQueries({ queryKey: ['dist-itens'] })
      showToast(`Envio confirmado — ${enviados} item(ns) transferido(s) para ${lojaMap[sel.loja_id || '']?.nome || 'a filial'}.`)
      setSel(null)
    } catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }

  const cd = sel ? lojaMap[sel.cd_loja_id || ''] : null
  const filial = sel ? lojaMap[sel.loja_id || ''] : null

  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">Central de Distribuição</div><div className="fh-sub">Atenda as requisições das filiais — separe, gere o romaneio e confirme o envio</div></div>
      </div>

      <div className="f1">
        <div className="ds-field"><label>Situação</label>
          <select className="field" value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ minWidth: 170 }}>
            <option value="ativas">A atender (novas + em separação)</option>
            <option value="transito">Em trânsito</option>
            <option value="concluidas">Concluídas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="ds-field"><label>Buscar</label><input className="field" style={{ minWidth: 220 }} placeholder="Nº da requisição ou filial…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#c2410c', fontWeight: 600 }}>● {cnt.novas} novas</span>
          <span style={{ color: '#1d4ed8', fontWeight: 600 }}>● {cnt.sep} em separação</span>
          <span style={{ color: '#0f766e', fontWeight: 600 }}>● {cnt.env} em trânsito</span>
        </div>
      </div>

      <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th style={{ width: 90 }}>Nº</th><th>Filial solicitante</th><th>Origem</th><th className="c">Data</th><th className="r">Itens</th><th className="r">Valor</th><th>Situação</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : lista.length === 0 ? <tr><td colSpan={7} className="empty">Nenhuma requisição nesta situação.</td></tr>
                : lista.map((r) => { const st = ST[r.status || 'enviada'] || ST.enviada; const n = r.requisicao_itens?.[0]?.count ?? 0; return (
                  <tr key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{reqNo(r.numero)}</td>
                    <td style={{ fontWeight: 600 }}>{lojaMap[r.loja_id || '']?.nome || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{r.origem === 'sugestao' ? 'Sugestão' : 'Portal'}</td>
                    <td className="c" style={{ color: '#64748b' }}>{fmtD(r.created_at)}</td>
                    <td className="r mono">{n}</td>
                    <td className="r mono">{brl(r.valor_total)}</td>
                    <td><span className={'dist-chip ' + st.cls}>{st.lb}</span></td>
                  </tr>
                ) })}
          </tbody>
        </table>
      </div></div>

      {/* DRAWER SEPARAÇÃO */}
      {sel && <>
        <div className="backdrop show" onClick={() => setSel(null)} />
        <aside className="drawer show" style={{ width: 640 }}>
          <div className="dr-head">
            <div><h2 style={{ fontSize: 16, fontWeight: 700 }}>{reqNo(sel.numero)} · {filial?.nome || '—'}</h2>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Solicitada {fmtD(sel.created_at)} · <span className={'dist-chip ' + (ST[sel.status || 'enviada']?.cls || '')}>{ST[sel.status || 'enviada']?.lb}</span></div>
            </div>
            <button className="dr-close" onClick={() => setSel(null)}>✕</button>
          </div>
          <div className="dr-body">
            {sel.observacao && <div style={{ fontSize: 12.5, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>📝 {sel.observacao}</div>}
            <h3 style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 8px' }}>Separação — informe o que está sendo enviado</h3>
            <table className="tbl" style={{ fontSize: 12 }}>
              <thead><tr><th>Item</th><th className="c">Un.</th><th className="r">Pedido</th><th className="r">Estoque CD</th><th className="r" style={{ width: 96 }}>Atendido</th></tr></thead>
              <tbody>
                {itens.map((it) => { const disp = cdSaldoMap[it.insumo_id] ?? 0; const ins = insMap[it.insumo_id]; const falta = num(atend[it.id]) > disp
                  return (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 600 }}>{ins?.nome || '—'}</td>
                      <td className="c" style={{ color: '#94a3b8' }}>{it.unidade || ins?.unidade_medida || '—'}</td>
                      <td className="r mono">{fmtQ(it.qtd_pedida)}</td>
                      <td className="r mono" style={{ color: disp <= 0 ? '#dc2626' : '#0f766e' }}>{fmtQ(disp)}</td>
                      <td className="r"><input value={atend[it.id] ?? ''} onChange={(e) => setAtend((a) => ({ ...a, [it.id]: e.target.value }))} style={{ width: 84, height: 28, border: '1px solid ' + (falta ? '#fca5a5' : '#cbd5e1'), borderRadius: 5, textAlign: 'right', padding: '0 7px', fontFamily: 'DM Mono, monospace', fontSize: 12, background: falta ? '#fef2f2' : '#fff' }} /></td>
                    </tr>
                  ) })}
                {!itens.length && <tr><td colSpan={5} className="empty">Sem itens.</td></tr>}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e9f0', borderRadius: 9, padding: '9px 13px' }}><div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase' }}>Itens atendidos</div><div style={{ fontSize: 18, fontWeight: 700 }}>{resumo.itensAt} / {resumo.total}</div></div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e9f0', borderRadius: 9, padding: '9px 13px' }}><div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase' }}>Valor da carga</div><div style={{ fontSize: 18, fontWeight: 700 }} className="mono">{brl(resumo.valor)}</div></div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #e5e9f0', padding: '12px 18px', display: 'flex', gap: 9, alignItems: 'center', background: '#fbfcfe' }}>
            <button className="btn-g" onClick={() => setRom(true)}>🖨 Romaneio</button>
            {sel.status === 'enviada' && <button className="btn-g" disabled={busy} onClick={marcarSeparando}>Pegar p/ separar</button>}
            <div style={{ marginLeft: 'auto' }} />
            <button className="btn-g" disabled title="Fase 3 — emissão fiscal" style={{ opacity: .5 }}>Emitir NF-e ⓕ</button>
            <button className="btn-g" style={{ background: '#0d9488', color: '#fff', borderColor: '#0d9488' }} disabled={busy} onClick={confirmarEnvio}>{busy ? 'Enviando…' : '✓ Confirmar envio'}</button>
          </div>
        </aside>
      </>}

      {/* ROMANEIO */}
      {sel && rom && <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.4)', overflow: 'auto', padding: '28px 16px' }} onClick={(e) => { if (e.target === e.currentTarget) setRom(false) }}>
        <div style={{ maxWidth: 660, margin: '0 auto 12px', display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <button className="btn-g" onClick={() => setRom(false)}>Fechar</button>
          <button className="btn-g" style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }} onClick={() => window.print()}>🖨 Imprimir</button>
        </div>
        <div style={{ maxWidth: 660, margin: '0 auto', background: '#fff', borderRadius: 10, padding: '26px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 12, marginBottom: 14 }}>
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>AIKO</div><div style={{ color: '#64748b', fontSize: 11 }}>Romaneio de Separação / Entrega</div></div>
            <div style={{ textAlign: 'right', fontSize: 11.5, color: '#64748b' }}><b>{reqNo(sel.numero)}</b><br />Emissão: {fmtD(new Date().toISOString())}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 12, marginBottom: 16 }}>
            <div><span style={{ color: '#94a3b8', fontSize: 10.5, textTransform: 'uppercase' }}>Origem (CD)</span><br />{cd?.nome || '—'}</div>
            <div><span style={{ color: '#94a3b8', fontSize: 10.5, textTransform: 'uppercase' }}>Destino (Filial)</span><br />{filial?.nome || '—'}</div>
            <div><span style={{ color: '#94a3b8', fontSize: 10.5, textTransform: 'uppercase' }}>CNPJ Origem</span><br /><span className="mono">{cd?.cnpj || '—'}</span></div>
            <div><span style={{ color: '#94a3b8', fontSize: 10.5, textTransform: 'uppercase' }}>CNPJ Destino</span><br /><span className="mono">{filial?.cnpj || '—'}</span></div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><th style={{ width: 34, textAlign: 'center', background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>#</th><th style={{ textAlign: 'left', background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Item</th><th style={{ textAlign: 'center', background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Un.</th><th style={{ textAlign: 'right', background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Qtd enviada</th><th style={{ textAlign: 'center', background: '#f1f5f9', padding: '6px 9px', border: '1px solid #e2e8f0', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Conf.</th></tr></thead>
            <tbody>
              {itens.filter((it) => num(atend[it.id]) > 0).map((it, i) => (
                <tr key={it.id}><td style={{ textAlign: 'center', padding: '6px 9px', border: '1px solid #eef2f6' }}>{i + 1}</td><td style={{ padding: '6px 9px', border: '1px solid #eef2f6' }}>{insMap[it.insumo_id]?.nome || '—'}</td><td style={{ textAlign: 'center', padding: '6px 9px', border: '1px solid #eef2f6' }}>{it.unidade || '—'}</td><td style={{ textAlign: 'right', padding: '6px 9px', border: '1px solid #eef2f6', fontFamily: 'DM Mono, monospace' }}>{fmtQ(num(atend[it.id]))}</td><td style={{ textAlign: 'center', padding: '6px 9px', border: '1px solid #eef2f6' }}>☐</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: 11.5, color: '#64748b' }}>
            <div>Total: <b>{resumo.itensAt} itens</b></div>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 5, width: 230, textAlign: 'center' }}>Recebido por / Data</div>
          </div>
        </div>
      </div>}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
