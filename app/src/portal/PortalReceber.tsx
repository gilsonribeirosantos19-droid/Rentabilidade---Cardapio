import { useMemo, useState } from 'react'
import { useToastErr } from '../lib/toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Receber Mercadoria — o gerente confere as NF-e que chegaram (status "A receber" =
// status 'pronta' + ainda sem recebimento) e confirma. O lançamento no estoque roda na RPC
// `processar_recebimento_nfe` (atômica, server-side): grava qtd recebida + lança a entrada.
// Só aparece quando o parâmetro estoque.recebimento_portal = 'sim' (a casca decide).

type Nfe = { id: string; numero?: string; serie?: string; cnpj_emitente?: string; nome_emitente?: string; data_emissao?: string; valor_total?: number }
type Item = { id: string; descricao_nfe?: string; codigo_item_fornecedor?: string; quantidade?: number; unidade_nfe?: string; valor_unitario?: number; vinculacao_id?: string | null }
type Insumo = { id: string; nome?: string; unidade_medida?: string }
type IFV = { id: string; insumo_id: string; fornecedor_id?: string | null; codigo_fornecedor?: string; qtd_por_embalagem?: number }
type Forn = { id: string; cnpj?: string }

const fmtData = (d?: string) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const brl = (v?: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtQ = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('pt-BR')
const onlyDigits = (s?: string) => (s || '').replace(/\D/g, '')
const MOTIVOS = ['Avaria / quebra', 'Falta na entrega', 'Sobra', 'Validade curta', 'Divergência de preço', 'Outro']

export function PortalReceber() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastErr(3200, 6000)

  const { data: insumos = [] } = useQuery({ queryKey: ['prec-ins', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const { data: ifv = [] } = useQuery({ queryKey: ['prec-ifv', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumo_fornecedores').select('id,insumo_id,fornecedor_id,codigo_fornecedor,qtd_por_embalagem').eq('tenant_id', tenantId); return (data ?? []) as IFV[] } })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['prec-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', tenantId); return (data ?? []) as Forn[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const ifvMap = useMemo(() => Object.fromEntries(ifv.map((v) => [v.id, v])) as Record<string, IFV>, [ifv])
  const fornByCnpj = (cnpj?: string) => fornecedores.find((f) => onlyDigits(f.cnpj) === onlyDigits(cnpj))
  // resolve o vínculo de um item (pelo vinculacao_id, senão por fornecedor+código) → fator + insumo
  const resolve = (it: Item, cnpj?: string): IFV | null => {
    if (it.vinculacao_id && ifvMap[it.vinculacao_id]) return ifvMap[it.vinculacao_id]
    const f = fornByCnpj(cnpj)
    if (f && it.codigo_item_fornecedor) return ifv.find((v) => v.fornecedor_id === f.id && (v.codigo_fornecedor || '') === it.codigo_item_fornecedor) || null
    return null
  }

  // notas "A receber" da loja: prontas (itens vinculados) e ainda sem recebimento
  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['prec-notas', tenantId, lojaId], enabled: !!tenantId && !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('nfe_recebidas').select('id,numero,serie,cnpj_emitente,nome_emitente,data_emissao,valor_total')
        .eq('tenant_id', tenantId).eq('loja_id', lojaId).eq('status', 'pronta').is('recebida_em', null).is('excluida_em', null)
        .order('data_emissao', { ascending: false })
      if (error) throw error; return (data ?? []) as Nfe[]
    },
  })

  // ---- conferência ----
  const [sel, setSel] = useState<Nfe | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [receb, setReceb] = useState<Record<string, { q: string; m: string }>>({})
  const [loadingItens, setLoadingItens] = useState(false)
  // filtros da lista
  const [fForn, setFForn] = useState(''); const [fNum, setFNum] = useState(''); const [fDe, setFDe] = useState(''); const [fAte, setFAte] = useState('')

  const abrir = async (n: Nfe) => {
    setSel(n); setLoadingItens(true); setReceb({})
    const { data } = await supabase.from('nfe_itens').select('id,descricao_nfe,codigo_item_fornecedor,quantidade,unidade_nfe,valor_unitario,vinculacao_id').eq('nfe_id', n.id).order('id')
    setItens((data ?? []) as Item[])
    setLoadingItens(false)
  }
  const voltar = () => { setSel(null); setItens([]); setReceb({}) }

  const setQ = (id: string, q: string) => setReceb((p) => ({ ...p, [id]: { q, m: p[id]?.m || '' } }))
  const setM = (id: string, m: string) => setReceb((p) => ({ ...p, [id]: { q: p[id]?.q ?? '', m } }))
  const num = (v?: string) => parseFloat(String(v ?? '').replace(',', '.'))

  // dados por item pra exibir (fator, unidades, conversão, diferença)
  const linha = (it: Item) => {
    const v = resolve(it, sel?.cnpj_emitente)
    const fator = v?.qtd_por_embalagem || 1
    const ins = v ? insMap[v.insumo_id] : null
    const unc = (it.unidade_nfe || 'un').toLowerCase()
    const une = (ins?.unidade_medida || unc).toLowerCase()
    const nota = it.quantidade || 0
    const rq = receb[it.id]?.q
    const val = rq !== undefined && rq !== '' && !isNaN(num(rq)) ? num(rq) : nota
    const dif = Math.round((val - nota) * 1000) / 1000
    const est = Math.round(val * fator * 1000) / 1000
    return { v, fator, ins, unc, une, nota, rq, val, dif, est, nome: ins?.nome || it.descricao_nfe || '—' }
  }

  const divergencias = useMemo(() => itens.filter((it) => linha(it).dif !== 0).length, [itens, receb, sel])

  const fornOpts = useMemo(() => [...new Set(notas.map((n) => n.nome_emitente || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [notas])
  const notasFil = useMemo(() => notas.filter((n) => {
    if (fForn && (n.nome_emitente || '') !== fForn) return false
    if (fNum.trim() && !String(n.numero || '').includes(fNum.trim())) return false
    const d = (n.data_emissao || '').split('T')[0]
    if (fDe && d && d < fDe) return false
    if (fAte && d && d > fAte) return false
    return true
  }), [notas, fForn, fNum, fDe, fAte])
  const temFiltro = !!(fForn || fNum.trim() || fDe || fAte)
  const limparFiltros = () => { setFForn(''); setFNum(''); setFDe(''); setFAte('') }

  const confirmar = useMutation({
    mutationFn: async (semConf: boolean) => {
      if (!sel) return
      if (!lojaId) throw new Error('Sua conta não está ligada a uma loja.')
      const p_recebido: Record<string, { q: number; m: string }> = {}
      if (!semConf) for (const it of itens) { const l = linha(it); p_recebido[it.id] = { q: l.val, m: l.dif !== 0 ? (receb[it.id]?.m || '') : '' } }
      const { data, error } = await supabase.rpc('processar_recebimento_nfe', { p_nfe_id: sel.id, p_recebido, p_sem_conf: semConf, p_usuario: usuario?.nome || null })
      if (error) throw error
      return data as { ok?: boolean }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prec-notas'] }); showToast('Recebimento confirmado — entrou no estoque! ✅'); voltar() },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  // ─────────── LISTA ───────────
  if (!sel) {
    return (
      <div>
        <div className="p-ttl">Receber Mercadoria</div>
        <div className="p-sub">Confira o que chegou e dê entrada no estoque da sua loja.</div>
        {!lojaId ? <div className="p-card"><div className="p-empty">Sua conta não está ligada a uma loja.</div></div>
          : isLoading ? <div className="p-card"><div className="p-empty">Carregando…</div></div>
            : notas.length === 0 ? <div className="p-card"><div className="p-empty">Nenhuma mercadoria para receber no momento. 👍</div></div>
              : (
                <>
                  <div className="pf-bar">
                    <div className="pf-fld"><label>Fornecedor</label>
                      <select className="p-field" value={fForn} onChange={(e) => setFForn(e.target.value)}><option value="">Todos</option>{fornOpts.map((f) => <option key={f} value={f}>{f}</option>)}</select>
                    </div>
                    <div className="pf-fld"><label>Número</label><input className="p-field" value={fNum} onChange={(e) => setFNum(e.target.value)} placeholder="Nº da NF-e" /></div>
                    <div className="pf-fld"><label>De</label><input type="date" className="p-field" value={fDe} onChange={(e) => setFDe(e.target.value)} /></div>
                    <div className="pf-fld"><label>Até</label><input type="date" className="p-field" value={fAte} onChange={(e) => setFAte(e.target.value)} /></div>
                    {temFiltro && <button className="p-btn" onClick={limparFiltros} style={{ alignSelf: 'flex-end' }}>▽ Limpar</button>}
                  </div>
                  {notasFil.length === 0
                    ? <div className="p-card"><div className="p-empty">Nenhuma nota com esse filtro.</div></div>
                    : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {notasFil.map((n) => (
                          <button key={n.id} className="p-card prec-card" onClick={() => abrir(n)} style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e3e8f0', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 800 }}>{n.nome_emitente || '—'}</div>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>NF-e {n.numero}/{n.serie} · {fmtData(n.data_emissao)} · {brl(n.valor_total)}</div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '4px 10px', borderRadius: 20 }}>A receber ›</span>
                          </button>
                        ))}
                      </div>
                    )}
                </>
              )}
        {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
      </div>
    )
  }

  // ─────────── CONFERÊNCIA ───────────
  return (
    <div>
      <button className="p-btn" onClick={voltar} style={{ marginBottom: 12 }}>‹ Voltar</button>
      <div className="p-card" style={{ padding: 14, marginBottom: 12, borderColor: '#d6caf5', background: '#faf7ff' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{sel.nome_emitente || '—'}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>NF-e {sel.numero}/{sel.serie} · {fmtData(sel.data_emissao)} · {itens.length} itens · {brl(sel.valor_total)}</div>
      </div>

      {loadingItens ? <div className="p-card"><div className="p-empty">Carregando itens…</div></div>
        : (
          <div className="p-card" style={{ overflowX: 'auto' }}>
            <table className="p-tbl prec-tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Na nota</th>
                  <th className="r">Q. Recebida</th>
                  <th className="r">No estoque</th>
                  <th className="r">Diferença</th>
                  <th>Não Conformidade</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const l = linha(it)
                  const unc = l.unc.toUpperCase()
                  return (
                    <tr key={it.id} style={l.dif !== 0 ? { background: '#fff7f7' } : undefined}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{l.nome}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{l.fator !== 1 ? `1 ${unc} = ${fmtQ(l.fator)} ${l.une}` : `em ${l.une}`}</div>
                      </td>
                      <td className="r mono" style={{ whiteSpace: 'nowrap' }}>{fmtQ(l.nota)} {unc}</td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        <input className="p-field" type="number" inputMode="decimal" step="0.001" min="0" style={{ width: 74, textAlign: 'right', fontFamily: 'DM Mono, monospace' }}
                          value={l.rq !== undefined ? l.rq : String(l.nota)} onChange={(e) => setQ(it.id, e.target.value)} /> <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{unc}</span>
                      </td>
                      <td className="r mono" style={{ fontWeight: 700, color: '#14315f', whiteSpace: 'nowrap' }}>{fmtQ(l.est)} {l.une}</td>
                      <td className="r mono" style={{ whiteSpace: 'nowrap', color: l.dif !== 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{l.dif === 0 ? 'ok' : `${l.dif > 0 ? '+' : ''}${fmtQ(l.dif)} ${unc}`}</td>
                      <td>{l.dif !== 0
                        ? <select className="p-field" style={{ minWidth: 150, borderColor: '#f3c6c6' }} value={receb[it.id]?.m || ''} onChange={(e) => setM(it.id, e.target.value)}>
                            <option value="">Motivo…</option>
                            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      <div className="p-card" style={{ padding: 12, margin: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#5b6b85' }}>{itens.length} itens</span>
        <b style={{ fontSize: 14, color: divergencias ? '#dc2626' : '#15803d' }}>{divergencias ? `${divergencias} divergência${divergencias > 1 ? 's' : ''}` : 'Tudo conferido'}</b>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <button className="p-btn p-btn-pri" disabled={confirmar.isPending || loadingItens} onClick={() => confirmar.mutate(false)} style={{ padding: 14, fontSize: 15 }}>{confirmar.isPending ? 'Confirmando…' : '✓ Confirmar Recebimento'}</button>
        <button className="p-btn" disabled={confirmar.isPending || loadingItens} onClick={() => confirmar.mutate(true)}>Receber sem conferência (igual à nota)</button>
      </div>

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
