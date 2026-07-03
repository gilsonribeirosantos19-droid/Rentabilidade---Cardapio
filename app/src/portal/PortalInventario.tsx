import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Inventário — consulta inventários da loja e preenche a contagem.
// Fiel ao loja.html: salvar só GRAVA a contagem (o estoque só ajusta ao FECHAR o inventário).

type Inv = { id: string; numero?: number; descricao?: string; status?: string; data_inicial?: string; data_final?: string }
type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; unidade_medida?: string; unidade_compra?: string }
type InvItem = { id: string; inventario_id: string; insumo_id: string; qtd_contada?: number | null }
type Linha = { id: string; insumo_id: string; codigo: string; nome: string; categoria: string; embalagem: string; unidade: string; qtd: string }

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtData = (d?: string) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const EMB: Record<string, string> = { kg: 'QUILOGRAMA', g: 'GRAMA', l: 'LITRO', litro: 'LITRO', ml: 'MILILITRO', un: 'UNIDADE', unid: 'UNIDADE', cx: 'CAIXA', pct: 'PACOTE', fd: 'FARDO', fardo: 'FARDO' }
const embalagem = (i?: Insumo) => { const u = (i?.unidade_compra || i?.unidade_medida || '').toLowerCase().trim(); return EMB[u] || (u ? u.toUpperCase() : '—') }
const unidade = (i?: Insumo) => { const u = (i?.unidade_medida || i?.unidade_compra || 'un').toLowerCase().trim(); return u === 'un' ? 'unid' : u }
const ST: Record<string, { bg: string; c: string; l: string }> = { ativo: { bg: '#f0fdf4', c: '#16a34a', l: 'Ativo' }, encerrado: { bg: '#eff6ff', c: '#2563eb', l: 'Encerrado' }, cancelado: { bg: '#fff1f2', c: '#e11d48', l: 'Cancelado' } }

export function PortalInventario() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()

  const hoje = new Date()
  const [dataIni, setDataIni] = useState(`${hoje.getFullYear()}-${pad2(hoje.getMonth() + 1)}-01`)
  const [dataFim, setDataFim] = useState(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toLocaleDateString('en-CA'))
  const [sit, setSit] = useState({ ativo: true, encerrado: true, cancelado: false })
  const [applied, setApplied] = useState({ dataIni, dataFim, sit } as { dataIni: string; dataFim: string; sit: typeof sit })

  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3200) }
  const setPeriodo = (t: string) => {
    const d = new Date()
    if (t === 'mes_atual') { setDataIni(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`); setDataFim(new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA')) }
    else if (t === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); setDataIni(`${p.getFullYear()}-${pad2(p.getMonth() + 1)}-01`); setDataFim(new Date(d.getFullYear(), d.getMonth(), 0).toLocaleDateString('en-CA')) }
  }

  const { data: insumos = [] } = useQuery({ queryKey: ['pinv-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,categoria,codigo_interno,unidade_medida,unidade_compra').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])

  const sitList = useMemo(() => { const s: string[] = []; if (applied.sit.ativo) s.push('ativo'); if (applied.sit.encerrado) s.push('encerrado'); if (applied.sit.cancelado) s.push('cancelado'); return s }, [applied])
  const { data: invs = [], isLoading, error: qErr } = useQuery({
    queryKey: ['pinv-list', tenantId, lojaId, applied], enabled: !!tenantId && sitList.length > 0,
    queryFn: async () => {
      let q = supabase.from('inventarios').select('*').eq('tenant_id', tenantId).order('criado_em', { ascending: false })
      if (lojaId) q = q.eq('loja_id', lojaId)
      q = sitList.length === 1 ? q.eq('status', sitList[0]) : q.in('status', sitList)
      if (applied.dataIni) q = q.gte('data_inicial', applied.dataIni)
      if (applied.dataFim) q = q.lte('data_final', applied.dataFim)
      const { data, error } = await q; if (error) throw error; return (data ?? []) as Inv[]
    },
  })

  // ---- modal de preenchimento ----
  const [inv, setInv] = useState<Inv | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [wide, setWide] = useState(false)
  const [fCat, setFCat] = useState(''); const [fBusca, setFBusca] = useState(''); const [fMostrar, setFMostrar] = useState<'todos' | 'sim' | 'nao'>('todos')

  const abrir = async (i: Inv) => {
    const { data } = await supabase.from('inventario_itens').select('id,inventario_id,insumo_id,qtd_contada').eq('inventario_id', i.id)
    const its = (data ?? []) as InvItem[]
    setLinhas(its.map((it) => { const ins = insMap[it.insumo_id]; return { id: it.id, insumo_id: it.insumo_id, codigo: fmtCod(ins?.codigo_interno), nome: ins?.nome || it.insumo_id, categoria: ins?.categoria || '', embalagem: embalagem(ins), unidade: unidade(ins), qtd: it.qtd_contada == null ? '' : String(it.qtd_contada) } }))
    setFCat(''); setFBusca(''); setFMostrar('todos'); setWide(false); setInv(i)
  }
  const cats = useMemo(() => [...new Set(linhas.map((l) => l.categoria).filter(Boolean))].sort(), [linhas])
  const setQtd = (id: string, v: string) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, qtd: v } : l)))
  const lancado = (l: Linha) => l.qtd !== '' && l.qtd != null
  const filtradas = useMemo(() => linhas.filter((l) => { if (fCat && l.categoria !== fCat) return false; const b = fBusca.toLowerCase().trim(); if (b && !l.nome.toLowerCase().includes(b) && !l.codigo.includes(b)) return false; if (fMostrar === 'sim' && !lancado(l)) return false; if (fMostrar === 'nao' && lancado(l)) return false; return true }), [linhas, fCat, fBusca, fMostrar])
  const total = linhas.length, nLanc = linhas.filter(lancado).length, pct = total ? Math.round((nLanc / total) * 100) : 0

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!inv) return
      const num = (v: string) => parseFloat(String(v).replace(',', '.')) || 0
      const rows = linhas.map((l) => ({ id: l.id, inventario_id: inv.id, qtd_contada: lancado(l) ? num(l.qtd) : null, tenant_id: tenantId }))
      const { error } = await supabase.from('inventario_itens').upsert(rows, { onConflict: 'id' }); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pinv-list'] }); setInv(null); showToast('Contagem salva! O estoque só será ajustado quando o inventário for fechado.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  return (
    <div>
      <div className="p-ttl">Inventário</div>
      <div className="p-sub">Consulte os inventários da sua loja e preencha a contagem dos itens.</div>

      <div className="pf-bar">
        <div className="pf-fld"><label>Período</label><select className="p-field" defaultValue="mes_atual" onChange={(e) => setPeriodo(e.target.value)}><option value="personalizado">Personalizado</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option></select></div>
        <div className="pf-fld"><label>De *</label><input type="date" className="p-field" value={dataIni} onChange={(e) => setDataIni(e.target.value)} /></div>
        <div className="pf-fld"><label>Até *</label><input type="date" className="p-field" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
        <div className="pf-fld"><label>Situação</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label className="pf-chk"><input type="checkbox" checked={sit.ativo} onChange={(e) => setSit({ ...sit, ativo: e.target.checked })} />Ativo</label>
            <label className="pf-chk"><input type="checkbox" checked={sit.encerrado} onChange={(e) => setSit({ ...sit, encerrado: e.target.checked })} />Encerrado</label>
            <label className="pf-chk"><input type="checkbox" checked={sit.cancelado} onChange={(e) => setSit({ ...sit, cancelado: e.target.checked })} />Cancelado</label>
          </div>
        </div>
        <button className="p-btn p-btn-pri" onClick={() => setApplied({ dataIni, dataFim, sit })}>Consultar</button>
      </div>

      <div className="p-card">
        {sitList.length === 0 ? <div className="p-empty">Selecione ao menos uma situação.</div>
          : isLoading ? <div className="p-empty">Carregando…</div>
            : qErr ? <div className="p-empty" style={{ color: '#b91c1c' }}>Erro: {(qErr as Error).message}</div>
              : invs.length === 0 ? <div className="p-empty">Nenhum inventário encontrado.</div>
                : (
                  <table className="p-tbl">
                    <thead><tr><th>N. Inventário</th><th>Descrição</th><th>D. Inicial</th><th>D. Final</th><th>Situação</th><th className="c">Ações</th></tr></thead>
                    <tbody>
                      {invs.map((i) => { const sc = ST[i.status || ''] || { bg: '#f1f5f9', c: '#64748b', l: i.status || '—' }; return (
                        <tr key={i.id} className="clik" onClick={() => abrir(i)}>
                          <td className="mono" style={{ color: '#64748b', fontSize: 12 }}>{i.numero ? `Nº ${i.numero}` : '—'}</td>
                          <td style={{ fontWeight: 600 }}>{i.descricao || 'Inventário'}</td>
                          <td style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtData(i.data_inicial)}</td>
                          <td style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtData(i.data_final)}</td>
                          <td><span className="p-badge" style={{ background: sc.bg, color: sc.c }}>{sc.l}</span></td>
                          <td className="c">{i.status === 'ativo' ? <button className="p-btn p-btn-pri p-btn-sm" onClick={(e) => { e.stopPropagation(); abrir(i) }}>Preencher</button> : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}</td>
                        </tr>
                      ) })}
                    </tbody>
                  </table>
                )}
      </div>

      {/* ===== modal preenchimento ===== */}
      {inv && (
        <div className="p-ov" onClick={(e) => { if (e.target === e.currentTarget) setInv(null) }}>
          <div className={'p-modal' + (wide ? ' wide' : '')}>
            <div className="mh">
              <div><h2>{inv.numero ? `Nº ${inv.numero} — ` : ''}{inv.descricao || 'Inventário'}</h2><div className="info">{inv.data_inicial ? `Período: ${fmtData(inv.data_inicial)} a ${fmtData(inv.data_final)}` : ''}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="p-btn p-btn-sm" onClick={() => setWide((w) => !w)}>{wide ? '↙ Recolher' : '⤢ Expandir'}</button>
                <button className="p-mx" onClick={() => setInv(null)}>✕</button>
              </div>
            </div>
            <div className="mb">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <select className="p-field" value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <input className="p-field" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar por nome ou código…" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['todos', 'sim', 'nao'] as const).map((m) => <label key={m} className="pf-chk"><input type="radio" name="inv-mostrar" checked={fMostrar === m} onChange={() => setFMostrar(m)} style={{ accentColor: '#f97316' }} />{m === 'todos' ? 'Todos' : m === 'sim' ? 'Lançados' : 'Não lançados'}</label>)}
                </div>
              </div>
              <table className="p-tbl">
                <thead><tr><th>Código</th><th>Item</th><th>Embalagem</th><th>Un.</th><th className="r">Q. Contada</th><th className="r">Q. Sistema</th><th className="r">Saldo</th></tr></thead>
                <tbody>
                  {!linhas.length ? <tr><td colSpan={7} className="p-empty">Nenhum item neste inventário. Contate o administrador.</td></tr>
                    : !filtradas.length ? <tr><td colSpan={7} className="p-empty">Nenhum item para este filtro.</td></tr>
                      : filtradas.map((l) => { const c = parseFloat(String(l.qtd).replace(',', '.')) || 0; return (
                        <tr key={l.id}>
                          <td className="mono" style={{ fontSize: 11 }}>{l.codigo}</td>
                          <td style={{ fontWeight: 500 }}>{l.nome}</td>
                          <td style={{ fontSize: 12 }}>{l.embalagem}</td>
                          <td>{l.unidade}</td>
                          <td className="r"><input type="number" className="p-qtd" min="0" step="0.001" placeholder="0,000" value={l.qtd} onChange={(e) => setQtd(l.id, e.target.value)} /></td>
                          <td className="r mono">0,000</td>
                          <td className="r mono">{(c >= 0 ? '+' : '') + c.toFixed(3)}</td>
                        </tr>
                      ) })}
                </tbody>
              </table>
            </div>
            <div className="mf">
              <div className="p-prog">
                <div className="txt"><span>{nLanc} de {total}</span><span>{pct}% concluído</span></div>
                <div className="p-prog-bar-wrap"><div className="p-prog-bar" style={{ width: pct + '%' }} /></div>
              </div>
              <button className="p-btn" onClick={() => setInv(null)}>Fechar</button>
              <button className="p-btn p-btn-pri" disabled={salvarMut.isPending || total === 0} onClick={() => salvarMut.mutate()}>{salvarMut.isPending ? 'Salvando…' : '✓ Salvar Inventário'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
