import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Perdas — registra perdas reais (insumo ou produto) + dashboard
// (histórico recente, resumo do período, donut por motivo). Fiel ao loja.html.

type Insumo = { id: string; nome?: string; ativo?: boolean; unidade_medida?: string; unidade_compra?: string; preco_compra?: number }
type ItemFicha = { insumo_id?: string | null; quantidade_g?: number }
type Ficha = { id: string; nome?: string; itens_ficha?: ItemFicha[] }
type Motivo = { id: string; nome?: string }
type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number }
type Perda = { id: string; motivo_id?: string; data_perda?: string }
type PerdaItem = { perda_id: string; insumo_id: string; quantidade?: number }

const num = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const hojeStr = () => new Date().toLocaleDateString('en-CA')
const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const fmtData = (d?: string) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const CORES = ['#e11d48', '#f97316', '#f59e0b', '#10b981', '#6366f1', '#94a3b8']
const SETORES = ['Sushibar', 'Cozinha', 'Confeitaria', 'Expedição', 'Almoxarifado']

export function PortalPerdas() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()

  const [tipo, setTipo] = useState<'insumo' | 'produto'>('insumo')
  const [data, setData] = useState(hojeStr())
  const [itemId, setItemId] = useState('')
  const [qtd, setQtd] = useState('')
  const [setor, setSetor] = useState('')
  const [resp, setResp] = useState(usuario?.nome || '')
  const [motivoId, setMotivoId] = useState('')
  const [obs, setObs] = useState('')
  const [resumoDe, setResumoDe] = useState(primeiroDiaMes())
  const [resumoAte, setResumoAte] = useState(hojeStr())
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ msg: m, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  const { data: insumos = [] } = useQuery({ queryKey: ['pperdas-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,ativo,unidade_medida,unidade_compra,preco_compra').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const { data: fichas = [] } = useQuery({ queryKey: ['pperdas-fichas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fichas_tecnicas').select('id,nome, itens_ficha(insumo_id,quantidade_g)').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Ficha[] } })
  const { data: motivos = [] } = useQuery({ queryKey: ['pperdas-motivos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('motivos_perda').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Motivo[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['pperdas-saldos', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade,custo_medio').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Saldo[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const fichaMap = useMemo(() => Object.fromEntries(fichas.map((f) => [f.id, f])) as Record<string, Ficha>, [fichas])
  const cmMap = useMemo(() => Object.fromEntries(saldos.map((s) => [s.insumo_id, Number(s.custo_medio) || 0])) as Record<string, number>, [saldos])
  const saldoMap = useMemo(() => Object.fromEntries(saldos.map((s) => [s.insumo_id, Number(s.quantidade) || 0])) as Record<string, number>, [saldos])
  const custoBase = (id: string) => (cmMap[id] > 0 ? cmMap[id] : insMap[id]?.preco_compra || 0)

  const insSel = insMap[itemId]
  const fichaSel = tipo === 'produto' ? fichaMap[itemId] : undefined
  const custoMedio = tipo === 'insumo' && itemId ? custoBase(itemId) : 0
  const unidade = tipo === 'insumo' ? (insSel?.unidade_medida || insSel?.unidade_compra || '') : 'un'
  const valorPerda = custoMedio * num(qtd)
  const temSaldo = tipo === 'insumo' && itemId ? (saldoMap[itemId] || 0) > 0 : false

  // ---- dashboard ----
  const { data: hist } = useQuery({
    queryKey: ['pperdas-hist', tenantId, lojaId], enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('perdas').select('id,motivo_id,data_perda').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5)
      if (lojaId) q = q.eq('loja_id', lojaId)
      const { data } = await q; const ps = (data ?? []) as Perda[]
      const map: Record<string, PerdaItem[]> = {}
      if (ps.length) { const { data: its } = await supabase.from('perdas_itens').select('perda_id,insumo_id,quantidade').in('perda_id', ps.map((p) => p.id)); (its ?? []).forEach((it) => { (map[(it as PerdaItem).perda_id] ||= []).push(it as PerdaItem) }) }
      return { perdas: ps, itens: map }
    },
  })
  const { data: resumo } = useQuery({
    queryKey: ['pperdas-resumo', tenantId, lojaId, resumoDe, resumoAte], enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('perdas').select('id,motivo_id,data_perda').eq('tenant_id', tenantId).gte('data_perda', resumoDe).lte('data_perda', resumoAte).limit(500)
      if (lojaId) q = q.eq('loja_id', lojaId)
      const { data } = await q; const ps = (data ?? []) as Perda[]
      let its: PerdaItem[] = []
      if (ps.length) { const { data: d2 } = await supabase.from('perdas_itens').select('perda_id,insumo_id,quantidade').in('perda_id', ps.map((p) => p.id)); its = (d2 ?? []) as PerdaItem[] }
      return { perdas: ps, itens: its }
    },
  })

  const calcValor = (it: PerdaItem) => custoBase(it.insumo_id) * (Number(it.quantidade) || 0)
  const resumoCalc = useMemo(() => {
    const ps = resumo?.perdas ?? [], its = resumo?.itens ?? []
    const totalKg = its.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)
    const totalRs = its.reduce((s, it) => s + calcValor(it), 0)
    const dias = Math.max(1, Math.round((new Date(resumoAte).getTime() - new Date(resumoDe).getTime()) / 86400000) + 1)
    const porMotivo: Record<string, number> = {}
    ps.forEach((p) => { const m = motivos.find((x) => x.id === p.motivo_id); const key = m?.nome || 'Outros'; const val = its.filter((it) => it.perda_id === p.id).reduce((s, it) => s + calcValor(it), 0); porMotivo[key] = (porMotivo[key] || 0) + val })
    const entradas = Object.entries(porMotivo).sort((a, b) => b[1] - a[1])
    return { totalKg, totalRs, media: totalRs / dias, n: ps.length, entradas, totalVal: entradas.reduce((s, [, v]) => s + v, 0) || 1 }
  }, [resumo, motivos, cmMap, insMap, resumoDe, resumoAte])

  // donut paths
  const donut = useMemo(() => {
    const R = 55, r = 32, cx = 60, cy = 60; let ang = -Math.PI / 2; const paths: { d: string; c: string }[] = []
    resumoCalc.entradas.forEach(([, val], i) => { const theta = (val / resumoCalc.totalVal) * 2 * Math.PI; if (theta > 0.01) { const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang), x2 = cx + R * Math.cos(ang + theta), y2 = cy + R * Math.sin(ang + theta), x3 = cx + r * Math.cos(ang + theta), y3 = cy + r * Math.sin(ang + theta), x4 = cx + r * Math.cos(ang), y4 = cy + r * Math.sin(ang), la = theta > Math.PI ? 1 : 0; paths.push({ d: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${la} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} A${r} ${r} 0 ${la} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`, c: CORES[i % CORES.length] }) } ang += theta })
    return paths
  }, [resumoCalc])

  const limpar = () => { setItemId(''); setQtd(''); setMotivoId(''); setSetor(''); setObs('') }
  const registrarMut = useMutation({
    mutationFn: async () => {
      if (!itemId) throw new Error('Selecione o item.')
      if (num(qtd) <= 0) throw new Error('Informe a quantidade.')
      if (!motivoId) throw new Error('Selecione o motivo.')
      const { data: p, error } = await supabase.from('perdas').insert({ tenant_id: tenantId, loja_id: lojaId, motivo_id: motivoId, data_perda: data || hojeStr(), observacao: obs.trim() || null, solicitante_id: usuario?.id || null }).select('id').single()
      if (error) throw error
      const perdaId = (p as { id: string }).id
      let rows: { perda_id: string; insumo_id: string; quantidade: number; origem: string }[] = []
      if (tipo === 'insumo') rows = [{ perda_id: perdaId, insumo_id: itemId, quantidade: num(qtd), origem: 'insumo' }]
      else { const f = fichaMap[itemId]; rows = (f?.itens_ficha ?? []).filter((it) => it.insumo_id).map((it) => ({ perda_id: perdaId, insumo_id: it.insumo_id as string, quantidade: (Number(it.quantidade_g) || 0) / 1000 * num(qtd), origem: 'produto' })) }
      if (rows.length) { const { error: e2 } = await supabase.from('perdas_itens').insert(rows); if (e2) throw e2 }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pperdas-hist'] }); qc.invalidateQueries({ queryKey: ['pperdas-resumo'] }); limpar(); showToast('Perda registrada com sucesso!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const lbl: React.CSSProperties = { fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }
  const cardTtl: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginBottom: 10 }

  return (
    <div>
      <div className="p-ttl">Perdas</div>
      <div className="p-sub">Registre as perdas reais de insumos e produtos.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16, alignItems: 'start' }}>
        {/* ===== FORM ===== */}
        <div className="p-card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Tipo</label>
              <div style={{ display: 'inline-flex', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                {(['insumo', 'produto'] as const).map((t) => <button key={t} onClick={() => { setTipo(t); setItemId(''); setQtd('') }} style={{ border: 0, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', background: tipo === t ? '#fff7ed' : '#fff', color: tipo === t ? '#ea6a0a' : '#475569', fontWeight: tipo === t ? 700 : 500 }}>{t === 'insumo' ? 'Insumo' : 'Produto'}</button>)}
              </div>
            </div>
            <div><label style={lbl}>Data</label><input type="date" className="p-field" style={{ width: '100%' }} value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>

          <div style={{ marginBottom: 12 }}><label style={lbl}>{tipo === 'insumo' ? 'Insumo *' : 'Produto acabado *'} {temSaldo && <span style={{ color: '#16a34a', fontSize: 10.5, fontWeight: 700 }}>· Em estoque</span>}</label>
            <select className="p-field" style={{ width: '100%' }} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Selecione…</option>
              {tipo === 'insumo' ? insumos.filter((i) => i.ativo !== false).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)
                : fichas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Unidade</label><input className="p-field" style={{ width: '100%', background: '#f1f5f9' }} readOnly value={unidade} /></div>
            <div><label style={lbl}>Quantidade *</label><input type="number" min="0" step="0.001" className="p-field" style={{ width: '100%', textAlign: 'right', fontFamily: 'DM Mono, monospace' }} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0,000" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Custo médio ({unidade || 'un'})</label><div style={{ fontSize: 15, fontWeight: 700, height: 34, display: 'flex', alignItems: 'center' }}>{custoMedio > 0 ? brl(custoMedio) : '—'}</div></div>
            <div><label style={lbl}>Valor da perda</label><div style={{ fontSize: 15, fontWeight: 700, height: 34, display: 'flex', alignItems: 'center', color: valorPerda > 0 ? '#f97316' : '#94a3b8' }}>{valorPerda > 0 ? brl(valorPerda) : '—'}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Setor</label><select className="p-field" style={{ width: '100%' }} value={setor} onChange={(e) => setSetor(e.target.value)}><option value="">Selecione…</option>{SETORES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Responsável</label><input className="p-field" style={{ width: '100%' }} value={resp} onChange={(e) => setResp(e.target.value)} /></div>
          </div>

          <div style={{ marginBottom: 12 }}><label style={lbl}>Motivo da perda</label>
            <select className="p-field" style={{ width: '100%' }} value={motivoId} onChange={(e) => setMotivoId(e.target.value)}><option value="">Selecione…</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
          </div>

          <div style={{ marginBottom: 12 }}><label style={lbl}>Observação <span style={{ color: '#94a3b8' }}>{obs.length}/300</span></label>
            <textarea className="p-field" style={{ width: '100%', height: 60, padding: 8, resize: 'vertical' }} maxLength={300} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          {tipo === 'produto' && fichaSel && (fichaSel.itens_ficha?.length ?? 0) > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 11.5, color: '#475569' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Insumos que serão debitados (por unidade):</div>
              {(fichaSel.itens_ficha ?? []).map((it, i) => <div key={i}>• {insMap[it.insumo_id || '']?.nome || it.insumo_id}: {(Number(it.quantidade_g) || 0).toFixed(1)}g</div>)}
            </div>
          )}

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#92400e', marginBottom: 14 }}>
            ⚠️ Apenas perdas reais devem ser registradas aqui. Aparas, cabeças, peles etc. são controladas no <b>Porcionamento</b>.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="p-btn" onClick={limpar}>Cancelar</button>
            <button className="p-btn" style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }} disabled={registrarMut.isPending} onClick={() => registrarMut.mutate()}>{registrarMut.isPending ? 'Registrando…' : '🗑 Registrar Perda'}</button>
          </div>
        </div>

        {/* ===== DASHBOARD ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="p-card" style={{ padding: 14 }}>
            <div style={cardTtl}>Histórico recente</div>
            {!hist?.perdas.length ? <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 14 }}>Nenhuma perda registrada.</div>
              : <table className="p-tbl"><thead><tr><th>Data</th><th>Insumo</th><th className="r">Qtd.</th><th className="r">Valor</th><th>Motivo</th></tr></thead>
                <tbody>{hist.perdas.map((p) => { const its = hist.itens[p.id] || []; const it = its[0]; const ins = it ? insMap[it.insumo_id] : null; const nome = ins?.nome || (its.length > 1 ? `${its.length} insumos` : '—'); const val = it ? calcValor(it) : 0; const m = motivos.find((x) => x.id === p.motivo_id); return (
                  <tr key={p.id}><td style={{ color: '#64748b' }}>{fmtData(p.data_perda)}</td><td style={{ fontWeight: 600 }}>{nome}</td><td className="r mono">{it ? q3(Number(it.quantidade) || 0) : '—'}</td><td className="r mono" style={{ color: '#dc2626' }}>{val > 0 ? brl(val) : '—'}</td><td>{m?.nome || '—'}</td></tr>
                ) })}</tbody></table>}
          </div>

          <div className="p-card" style={{ padding: 14 }}>
            <div style={cardTtl}>Resumo do período</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="date" className="p-field" style={{ flex: 1 }} value={resumoDe} onChange={(e) => setResumoDe(e.target.value)} />
              <input type="date" className="p-field" style={{ flex: 1 }} value={resumoAte} onChange={(e) => setResumoAte(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[['Total perdas (kg)', q3(resumoCalc.totalKg)], ['Total perdas (R$)', brl(resumoCalc.totalRs)], ['Média diária (R$)', brl(resumoCalc.media)], ['Registros', String(resumoCalc.n)]].map(([k, v]) => (
                <div key={k} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'DM Mono, monospace' }}>{v}</div></div>
              ))}
            </div>
            <div style={cardTtl}>Perdas por motivo</div>
            {resumoCalc.entradas.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 10 }}>Sem perdas no período.</div>
              : <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>{donut.map((p, i) => <path key={i} d={p.d} fill={p.c} />)}<circle cx="60" cy="60" r="20" fill="#fff" /></svg>
                <div style={{ flex: 1 }}>{resumoCalc.entradas.map(([nome, val], i) => (
                  <div key={nome} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: CORES[i % CORES.length], display: 'inline-block' }} />{nome}</div>
                    <div style={{ display: 'flex', gap: 10 }}><span className="mono" style={{ fontWeight: 700 }}>{brl(val)}</span><span style={{ color: '#94a3b8' }}>{(val / resumoCalc.totalVal * 100).toFixed(1)}%</span></div>
                  </div>
                ))}</div>
              </div>}
          </div>
        </div>
      </div>

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
