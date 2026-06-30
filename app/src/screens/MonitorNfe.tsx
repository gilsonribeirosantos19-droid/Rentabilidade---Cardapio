import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './fiscal.css'

type Nfe = { id: string; numero?: string; serie?: string; chave_acesso?: string; cnpj_emitente?: string; nome_emitente?: string; data_emissao?: string; data_integracao?: string; valor_total?: number; valor_titulo?: number; data_vencimento?: string; portador?: string; status?: string; loja_id?: string | null }
type Item = { id: string; nfe_id: string; descricao_nfe?: string; codigo_item_fornecedor?: string; quantidade?: number; unidade_nfe?: string; valor_unitario?: number; vinculacao_id?: string | null }
type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; codigo_interno?: string }
type Forn = { id: string; nome: string; cnpj?: string; codigo?: string }
type IFV = { id: string; insumo_id: string; fornecedor_id?: string | null; descricao_fornecedor?: string; codigo_fornecedor?: string; embalagem_descricao?: string; qtd_por_embalagem?: number; preco_unitario?: number }
type Vinc = { id: string; descricao_nfe?: string; codigo_nfe?: string; insumo_id?: string; fator_conversao?: number }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtD = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—'
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const STATUS: Record<string, { dot: string; label: string }> = {
  pendente: { dot: '#f59e0b', label: 'Pendente' }, em_transito: { dot: '#f59e0b', label: 'Em trânsito' },
  aguard_vinculacao: { dot: '#dc2626', label: 'Aguard. vínculo' }, pronta: { dot: '#2563eb', label: 'Pronta' },
  processada: { dot: '#16a34a', label: 'Processada' }, com_erro: { dot: '#dc2626', label: 'Com erro' },
  recusada: { dot: '#475569', label: 'Recusada' }, cancelada: { dot: '#ef4444', label: 'Cancelada' },
}
const CHIPS: { key: string; label: string; st: string[] }[] = [
  { key: 'todas', label: 'Todas', st: [] },
  { key: 'pendente', label: 'Pendente', st: ['pendente', 'em_transito'] },
  { key: 'processar', label: 'Para processar', st: ['pronta'] },
  { key: 'processada', label: 'Processada', st: ['processada'] },
  { key: 'erro', label: 'Com Erro', st: ['aguard_vinculacao', 'com_erro'] },
  { key: 'cancelada', label: 'Cancelada', st: ['cancelada', 'recusada'] },
]

// fator a partir da descrição da embalagem (ex: "27x0,375"→10,125; "965ML"→0,965)
function calcFator(desc: string): number | null {
  const d = desc.trim(); if (!d) return null
  const mult = d.replace(/,/g, '.').match(/(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)/)
  if (mult) return Math.round(parseFloat(mult[1]) * parseFloat(mult[2]) * 1000) / 1000
  const withU = d.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\s*$/i)
  if (withU) return Math.round(parseFloat(withU[1].replace(',', '.')) / 1000 * 1000) / 1000
  const nums = d.replace(/,/g, '.').match(/\d+\.?\d*/g)
  if (nums && nums.length) return parseFloat(nums[nums.length - 1])
  return 1
}

export function MonitorNfe() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const qc = useQueryClient()
  const [chip, setChip] = useState('todas')
  const [sel, setSel] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<'itens' | 'erros'>('itens')
  const [vinc, setVinc] = useState<Item | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const { data: nfes = [], isLoading } = useQuery({ queryKey: ['mon-nfe', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Nfe>((f, t) => supabase.from('nfe_recebidas').select('*').eq('tenant_id', tenantId).order('data_emissao', { ascending: false }).range(f, t)) })
  const { data: insumos = [] } = useQuery({ queryKey: ['mon-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,codigo_interno').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['mon-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome,cnpj,codigo').eq('tenant_id', tenantId); return (data ?? []) as Forn[] } })
  const { data: ifv = [] } = useQuery({ queryKey: ['mon-ifv', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<IFV>((f, t) => supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId).range(f, t)) })
  const { data: vinculos = [] } = useQuery({ queryKey: ['mon-vinc', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Vinc>((f, t) => supabase.from('vinculos_nfe').select('*').eq('tenant_id', tenantId).range(f, t)) })
  const { data: itens = [] } = useQuery({ queryKey: ['mon-itens', sel], enabled: !!sel, queryFn: async () => { const { data } = await supabase.from('nfe_itens').select('*').eq('nfe_id', sel).order('id'); return (data ?? []) as Item[] } })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const ifvMap = useMemo(() => Object.fromEntries(ifv.map((v) => [v.id, v])) as Record<string, IFV>, [ifv])
  const fornByCnpj = (cnpj?: string) => { const c = (cnpj || '').replace(/\D/g, ''); return fornecedores.find((f) => (f.cnpj || '').replace(/\D/g, '') === c) }

  const counts = useMemo(() => { const m: Record<string, number> = {}; CHIPS.forEach((c) => { m[c.key] = c.st.length ? nfes.filter((n) => c.st.includes(n.status || '')).length : nfes.length }); return m }, [nfes])
  const lista = useMemo(() => { const st = CHIPS.find((c) => c.key === chip)?.st || []; return st.length ? nfes.filter((n) => st.includes(n.status || '')) : nfes }, [nfes, chip])
  const selNfe = nfes.find((n) => n.id === sel) || null
  const erros = itens.filter((i) => !i.vinculacao_id)

  return (
    <div className="fiscal-screen">
      <div className="fh-title">Monitor NF-e</div>
      <div className="fh-sub">Recebimento, vinculação e processamento de notas fiscais de entrada</div>

      <div className="mon-bar">
        <div className="chips">
          {CHIPS.map((c) => <button key={c.key} className={'chip' + (chip === c.key ? ' on' : '')} onClick={() => setChip(c.key)}>{c.label}<span className="n">{counts[c.key] || 0}</span></button>)}
        </div>
        <button className="btn-g" style={{ marginLeft: 'auto' }} onClick={() => qc.invalidateQueries({ queryKey: ['mon-nfe'] })}>↻ Atualizar</button>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th className="c">Sit.</th><th>Código</th><th>Fornecedor</th><th>Loja</th><th>NF-e</th><th className="c">Série</th><th>D. Emissão</th><th>D. Integração</th><th className="r">V. Total</th><th className="r">V. Título</th><th>D. Venc.</th><th>Portador</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={12} className="empty">Carregando…</td></tr>
              : lista.length === 0 ? <tr><td colSpan={12} className="empty">Nenhuma NF-e nesta situação.</td></tr>
              : lista.map((n) => {
                const st = STATUS[n.status || ''] || { dot: '#94a3b8', label: n.status || '—' }
                const forn = fornByCnpj(n.cnpj_emitente)
                const isErro = n.status === 'aguard_vinculacao' || n.status === 'com_erro'
                return (
                  <tr key={n.id} className={sel === n.id ? 'sel' : ''}>
                    <td className="c" title={st.label}>{isErro ? <span className="stat-err" onClick={() => { setSel(n.id); setSubtab('erros') }}>!</span> : <span className="stat-dot" style={{ background: st.dot }} />}</td>
                    <td className="mono" style={{ color: '#64748b', fontSize: 12 }}>{forn?.codigo || '—'}</td>
                    <td className="fornec nfe-fornec" onClick={() => { setSel(n.id); setSubtab('itens') }}><div style={{ fontWeight: 600 }}>{n.nome_emitente || '—'}</div><div style={{ fontSize: 10, color: '#94a3b8' }} className="mono">{n.cnpj_emitente || ''}</div></td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{lojaMap[n.loja_id || ''] || '—'}</td>
                    <td><span className="nfe-num" onClick={() => { setSel(n.id); setSubtab('itens') }}>{n.numero || '—'}</span></td>
                    <td className="c mono" style={{ color: '#94a3b8' }}>{n.serie || '1'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{fmtD(n.data_emissao)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{fmtD(n.data_integracao)}</td>
                    <td className="r mono" style={{ fontWeight: 600 }}>{brl(n.valor_total)}</td>
                    <td className="r mono" style={{ color: '#64748b' }}>{n.valor_titulo ? brl(n.valor_titulo) : '—'}</td>
                    <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{n.data_vencimento ? fmtD(n.data_vencimento) : '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{n.portador || '—'}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>

      {/* DETALHE DA NOTA SELECIONADA */}
      {!selNfe ? <div className="sel-hint">Clique numa NF-e acima para ver os itens e erros.</div> : (
        <>
          <div className="subtabs">
            <button className={'subtab' + (subtab === 'itens' ? ' on' : '')} onClick={() => setSubtab('itens')}>Itens NF <span className="n">{itens.length}</span></button>
            <button className={'subtab' + (subtab === 'erros' ? ' on' : '')} onClick={() => setSubtab('erros')}>Erros <span className="n">{erros.length}</span></button>
            <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#94a3b8', paddingRight: 4 }}>NF-e {selNfe.numero}/{selNfe.serie} · {selNfe.nome_emitente}</div>
          </div>

          {subtab === 'itens' ? (
            <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="tbl-scroll">
              <table className="tbl">
                <thead><tr><th className="c">Seq.</th><th>Item Fornecedor</th><th>Descrição</th><th>Item Interno</th><th>Embalagem</th><th className="c">UM</th><th className="r">Q. na Emb.</th><th className="r">Q. Embalagens</th><th className="r">V. Unit.</th><th className="r">V. Total</th><th className="r">Q. Estoque</th></tr></thead>
                <tbody>
                  {itens.length === 0 ? <tr><td colSpan={11} className="empty">Sem itens.</td></tr>
                    : itens.map((it, i) => {
                      const v = it.vinculacao_id ? ifvMap[it.vinculacao_id] : null
                      const ins = v ? insMap[v.insumo_id] : null
                      const total = (it.quantidade || 0) * (it.valor_unitario || 0)
                      const qEst = v ? (it.quantidade || 0) * (v.qtd_por_embalagem || 0) : null
                      return (
                        <tr key={it.id}>
                          <td className="c" style={{ color: '#94a3b8' }}>{i + 1}</td>
                          <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{it.codigo_item_fornecedor || '—'}</td>
                          <td>{it.descricao_nfe || '—'}</td>
                          <td className="mono">{ins ? (ins.codigo_interno || ins.nome) : <span style={{ color: '#dc2626' }}>—</span>}</td>
                          <td style={{ color: '#64748b' }}>{v?.embalagem_descricao || '—'}</td>
                          <td className="c">{it.unidade_nfe || '—'}</td>
                          <td className="r mono">{v ? fmtQ(v.qtd_por_embalagem) : '—'}</td>
                          <td className="r mono">{fmtQ(it.quantidade)}</td>
                          <td className="r mono">{brl(it.valor_unitario)}</td>
                          <td className="r mono">{brl(total)}</td>
                          <td className="r mono" style={{ fontWeight: 600 }}>{qEst != null ? `${fmtQ(qEst)} ${ins?.unidade_medida || ''}` : '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div></div>
          ) : (
            <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="tbl-scroll">
              <table className="tbl">
                <thead><tr><th>Descrição</th><th>Código</th><th className="c">UM</th><th className="r">Qtd.</th><th className="r">V. Unit.</th><th className="c">Ação</th></tr></thead>
                <tbody>
                  {erros.length === 0 ? <tr><td colSpan={6} className="empty" style={{ color: '#16a34a' }}>✓ Todos os itens estão vinculados.</td></tr>
                    : erros.map((it) => (
                      <tr key={it.id}>
                        <td>{it.descricao_nfe || '—'}</td>
                        <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{it.codigo_item_fornecedor || '—'}</td>
                        <td className="c">{it.unidade_nfe || '—'}</td>
                        <td className="r mono">{fmtQ(it.quantidade)}</td>
                        <td className="r mono">{brl(it.valor_unitario)}</td>
                        <td className="c"><button className="corrigir" onClick={() => setVinc(it)}>Corrigir</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div></div>
          )}
        </>
      )}

      {vinc && selNfe && <VincularModal item={vinc} nfe={selNfe} insumos={insumos} ifv={ifv} vinculos={vinculos} forn={fornByCnpj(selNfe.cnpj_emitente)} tenantId={tenantId!}
        onClose={() => setVinc(null)} onSaved={async () => { setVinc(null); await qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /mon-/i.test(k) } }); showToast('Vínculo salvo!', 'ok') }} onErr={(m) => showToast(m, 'err')} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function VincularModal({ item, nfe, insumos, ifv, vinculos, forn, tenantId, onClose, onSaved, onErr }: { item: Item; nfe: Nfe; insumos: Insumo[]; ifv: IFV[]; vinculos: Vinc[]; forn?: Forn; tenantId: string; onClose: () => void; onSaved: () => void; onErr: (m: string) => void }) {
  const [insId, setInsId] = useState('')
  const [codForn, setCodForn] = useState(item.codigo_item_fornecedor || '')
  const [descr, setDescr] = useState(item.descricao_nfe || '')
  const [embDesc, setEmbDesc] = useState('')
  const [fator, setFator] = useState('1')
  const [saving, setSaving] = useState(false)
  const insSel = insumos.find((i) => i.id === insId)
  const insByName = new Map(insumos.map((i) => [i.nome, i.id]))
  const q = Number(item.quantidade) || 0
  const f = parseFloat(fator) || 0
  const qEst = q * f

  const onEmb = (val: string) => { setEmbDesc(val); const c = calcFator(val); if (c != null) setFator(String(c)) }

  const salvar = async () => {
    if (!insId) return onErr('Selecione o insumo interno.')
    if (f <= 0) return onErr('Informe a quantidade na embalagem (fator).')
    setSaving(true)
    try {
      const fornId = forn?.id || null
      const preco = f > 0 ? +((item.valor_unitario || 0) / f).toFixed(4) : null
      // 1. insumo_fornecedores (PATCH existente ou POST)
      const existing = ifv.find((v) => v.insumo_id === insId && (!fornId || v.fornecedor_id === fornId) && (codForn ? v.codigo_fornecedor === codForn : v.embalagem_descricao === embDesc))
      let vincId: string
      if (existing) {
        const { error } = await supabase.from('insumo_fornecedores').update({ qtd_por_embalagem: f, codigo_fornecedor: codForn || null, preco_unitario: preco, embalagem_descricao: embDesc || existing.embalagem_descricao, descricao_fornecedor: descr.trim() || null }).eq('id', existing.id); if (error) throw error
        vincId = existing.id
      } else {
        const { data, error } = await supabase.from('insumo_fornecedores').insert({ tenant_id: tenantId, insumo_id: insId, fornecedor_id: fornId, embalagem_descricao: embDesc || null, qtd_por_embalagem: f, codigo_fornecedor: codForn || null, preco_unitario: preco, descricao_fornecedor: descr.trim() || null }).select('id'); if (error) throw error
        vincId = data![0].id
      }
      // 2. vinculos_nfe (de-para p/ auto-match futuro)
      const existVin = vinculos.find((v) => (item.codigo_item_fornecedor && v.codigo_nfe === item.codigo_item_fornecedor) || norm(v.descricao_nfe) === norm(item.descricao_nfe))
      if (existVin) await supabase.from('vinculos_nfe').update({ insumo_id: insId, fator_conversao: f }).eq('id', existVin.id)
      else await supabase.from('vinculos_nfe').insert({ tenant_id: tenantId, descricao_nfe: item.descricao_nfe, codigo_nfe: item.codigo_item_fornecedor || null, insumo_id: insId, fator_conversao: f })
      // 3. nfe_itens.vinculacao_id
      const { error: e3 } = await supabase.from('nfe_itens').update({ vinculacao_id: vincId }).eq('id', item.id); if (e3) throw e3
      // 4. se todos os itens da nota têm vínculo → status 'pronta'
      const { data: upd } = await supabase.from('nfe_itens').select('vinculacao_id').eq('nfe_id', nfe.id)
      if (upd && upd.length > 0 && upd.every((x: any) => x.vinculacao_id)) await supabase.from('nfe_recebidas').update({ status: 'pronta' }).eq('id', nfe.id)
      onSaved()
    } catch (e: any) { onErr('Erro: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vmodal" onClick={(e) => e.stopPropagation()}>
        <h2>Vincular item da NF-e</h2>
        <div className="vsub">Ligue o item da nota a um insumo interno e defina a conversão de embalagem.</div>
        <div className="vbox">
          <div>Descrição NF: <b>{item.descricao_nfe || '—'}</b></div>
          <div>Código: <b>{item.codigo_item_fornecedor || '—'}</b></div>
          <div>Qtd. NF: <b>{fmtQ(item.quantidade)} {item.unidade_nfe || ''}</b></div>
          <div>Fornecedor: <b>{nfe.nome_emitente || '—'}</b></div>
        </div>

        <div className="vsec">Item interno</div>
        <div className="vfg"><label>Insumo / Matéria-prima *</label><SearchSelect value={insSel?.nome || ''} options={insumos.map((i) => i.nome)} placeholder="Selecione o insumo..." onChange={(nm) => setInsId(insByName.get(nm) || '')} /></div>
        <div className="vfg"><label>Código no fornecedor</label><input value={codForn} onChange={(e) => setCodForn(e.target.value)} placeholder="SKU do fornecedor (opcional)" /></div>
        <div className="vfg"><label>Descrição no fornecedor</label><input value={descr} onChange={(e) => setDescr(e.target.value)} placeholder="Como o fornecedor chama" /></div>

        <div className="vsec">Embalagem e conversão</div>
        <div className="vfg"><label>Embalagem (descrição)</label><input value={embDesc} onChange={(e) => onEmb(e.target.value)} placeholder="Ex: CAIXA C/ 12, FARDO 20KG, 27x0,375…" /></div>
        <div className="vfg"><label>Qt. na embalagem (un. estoque) *</label><input type="number" step="0.001" min="0" value={fator} onChange={(e) => setFator(e.target.value)} /></div>
        {f > 0 && <div className="vconv">{fmtQ(q)} {item.unidade_nfe || ''} × {fmtQ(f)} = {fmtQ(qEst)} {insSel?.unidade_medida || ''} no estoque · Custo/un: {brl(f > 0 ? (item.valor_unitario || 0) / f : 0)}</div>}

        <div className="vfoot">
          <button className="v-sec" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="v-pri" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : 'Salvar vínculo'}</button>
        </div>
      </div>
    </div>
  )
}
