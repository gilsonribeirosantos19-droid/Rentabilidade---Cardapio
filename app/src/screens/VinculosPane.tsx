import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'

type Fornecedor = { id: string; codigo?: string; razao_social?: string; nome_fantasia?: string; nome?: string; cnpj?: string; contato?: string; whatsapp?: string; cidade?: string }
type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; categoria?: string }
type Vinculo = {
  id: string; tenant_id?: string; insumo_id: string; fornecedor_id: string
  descricao_fornecedor?: string | null; codigo_fornecedor?: string | null; ean?: string | null
  embalagem_descricao?: string | null; qtd_por_embalagem?: number | null
  preco_unitario?: number | null; ultima_entrada?: string | null; embalagem_padrao?: boolean
}
type VForm = Partial<Vinculo>

const brl = (n?: number | null) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const num = (n?: number | null) => n != null ? Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'
const low = (s: string) => s.toLowerCase()

// Calcula a Qt. na embalagem a partir da descrição (ex: "27x0,375"→10,125; "965ML"→0,965; "FARDO 20KG"→20)
function calcQtdEmb(desc: string): number | null {
  const d = desc.trim()
  const mult = d.replace(/,/g, '.').match(/(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)/)
  if (mult) return Math.round(parseFloat(mult[1]) * parseFloat(mult[2]) * 1000) / 1000
  const withU = d.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\s*$/i)
  if (withU) return Math.round(parseFloat(withU[1].replace(',', '.')) / 1000 * 1000) / 1000
  const nums = d.replace(/,/g, '.').match(/\d+\.?\d*/g)
  if (nums && nums.length) return parseFloat(nums[nums.length - 1])
  if (d.length > 0) return 1
  return null
}

export function VinculosPane({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [selId, setSelId] = useState<string | null>(null)
  const [buscaForn, setBuscaForn] = useState('')
  const [filtroItens, setFiltroItens] = useState('')
  const [form, setForm] = useState<VForm | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600) }

  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos-vin', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,categoria').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Insumo[] },
  })
  const { data: vinculos = [] } = useQuery({
    queryKey: ['vinculos-full', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId); return (data ?? []) as Vinculo[] },
  })
  const { data: embOpcoes = [] } = useQuery({
    queryKey: ['emb-opcoes', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('item_classificacoes').select('nome,tipo').eq('tenant_id', tenantId).eq('tipo', 'embalagem').order('nome'); return ((data ?? []) as { nome: string }[]).map((e) => e.nome) },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const insLabel = (i: Insumo) => i.nome + (i.unidade_medida ? ' (' + i.unidade_medida + ')' : '')
  const insOptions = useMemo(() => insumos.map(insLabel), [insumos])
  const insByLabel = useMemo(() => new Map(insumos.map((i) => [insLabel(i), i.id])), [insumos])
  const countForn = (fid: string) => vinculos.filter((v) => v.fornecedor_id === fid).length

  const listaForn = useMemo(() => {
    const q = low(buscaForn.trim())
    if (!q) return fornecedores
    return fornecedores.filter((f) => low(f.nome || f.razao_social || f.nome_fantasia || '').includes(q) || (f.cnpj || '').includes(q) || (f.codigo || '').includes(q))
  }, [fornecedores, buscaForn])

  const selForn = selId ? fornecedores.find((f) => f.id === selId) || null : null
  const itensForn = useMemo(() => {
    if (!selForn) return []
    let l = vinculos.filter((v) => v.fornecedor_id === selForn.id)
    const q = low(filtroItens.trim())
    if (q) l = l.filter((v) => low(insMap[v.insumo_id]?.nome || '').includes(q) || low(v.descricao_fornecedor || '').includes(q) || low(v.codigo_fornecedor || '').includes(q))
    return l
  }, [vinculos, selForn, filtroItens, insMap])

  const saveMut = useMutation({
    mutationFn: async (f: VForm) => {
      if (!f.insumo_id) throw new Error('Selecione o item interno.')
      if (!selForn) throw new Error('Nenhum fornecedor selecionado.')
      const codigo = (f.codigo_fornecedor || '').trim()
      const dupeItem = vinculos.find((v) => v.insumo_id === f.insumo_id && v.fornecedor_id === selForn.id && (v.codigo_fornecedor || '').trim() === codigo && (!f.id || v.id !== f.id))
      if (dupeItem) throw new Error('Este item já está vinculado a este fornecedor com este mesmo código.')
      if (codigo) {
        const dupeCod = vinculos.find((v) => v.fornecedor_id === selForn.id && low(v.codigo_fornecedor || '') === low(codigo) && (!f.id || v.id !== f.id))
        if (dupeCod) throw new Error(`Código "${codigo}" já está em uso pelo item "${insMap[dupeCod.insumo_id]?.nome || '—'}".`)
      }
      const payload = {
        insumo_id: f.insumo_id, fornecedor_id: selForn.id,
        descricao_fornecedor: (f.descricao_fornecedor || '').toString().trim() || null,
        codigo_fornecedor: codigo || null, ean: (f.ean || '').toString().trim() || null,
        embalagem_descricao: f.embalagem_descricao || null,
        qtd_por_embalagem: f.qtd_por_embalagem != null && f.qtd_por_embalagem !== ('' as any) ? Number(f.qtd_por_embalagem) : null,
        preco_unitario: f.preco_unitario != null && f.preco_unitario !== ('' as any) ? Number(f.preco_unitario) : null,
        ultima_entrada: f.ultima_entrada || null, embalagem_padrao: !!f.embalagem_padrao,
      }
      if (f.id) { const { error } = await supabase.from('insumo_fornecedores').update(payload).eq('id', f.id); if (error) throw error }
      else { const { error } = await supabase.from('insumo_fornecedores').insert({ ...payload, tenant_id: tenantId }); if (error) throw error }
    },
    onSuccess: (_d, f) => { qc.invalidateQueries({ queryKey: ['vinculos-full'] }); qc.invalidateQueries({ queryKey: ['insumo-forn'] }); setForm(null); showToast(f.id ? 'Vínculo atualizado.' : 'Item vinculado com sucesso.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('insumo_fornecedores').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vinculos-full'] }); qc.invalidateQueries({ queryKey: ['insumo-forn'] }); showToast('Vínculo removido.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  // ---- NÍVEL 1: lista de fornecedores ----
  if (!selForn) {
    return (
      <>
        <div style={{ marginBottom: 14, maxWidth: 320 }}>
          <div className="fl-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Buscar por código, nome ou CNPJ..." value={buscaForn} onChange={(e) => setBuscaForn(e.target.value)} />
          </div>
        </div>
        <div className="tbl-card"><div className="tbl-scroll">
          <table>
            <thead><tr><th style={{ width: 72 }}>Código</th><th>Fornecedor</th><th>CNPJ</th><th>Contato / WhatsApp</th><th>Cidade</th><th className="c">Itens vinculados</th></tr></thead>
            <tbody>
              {listaForn.length === 0 ? <tr><td colSpan={6} className="empty">Nenhum fornecedor encontrado</td></tr>
                : listaForn.map((f) => {
                  const qtd = countForn(f.id); const contato = [f.contato, f.whatsapp].filter(Boolean).join(' / ') || '—'
                  return (
                    <tr key={f.id} onClick={() => { setSelId(f.id); setForm(null); setFiltroItens('') }}>
                      <td className="td-mono" style={{ fontSize: 12 }}>{f.codigo || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{f.nome_fantasia || f.nome || f.razao_social || '—'}</td>
                      <td className="td-mono" style={{ fontSize: 12, color: '#64748b' }}>{f.cnpj || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{contato}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{f.cidade || '—'}</td>
                      <td className="c"><span className="b-cat">{qtd} {qtd !== 1 ? 'itens' : 'item'}</span></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div></div>
        {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
      </>
    )
  }

  // ---- NÍVEL 2: detalhe do fornecedor ----
  const sub = [selForn.contato, selForn.whatsapp, selForn.cidade].filter(Boolean).join(' · ') || 'Sem informações adicionais'
  const totalItens = countForn(selForn.id)
  const selUnd = form?.insumo_id ? (insMap[form.insumo_id]?.unidade_medida || 'un. estoque') : 'un. estoque'
  const showConv = !!(form?.embalagem_descricao && form?.qtd_por_embalagem)

  const abrir = (v?: Vinculo) => setForm(v ? { ...v } : { embalagem_padrao: false })
  const setF = (k: keyof VForm, val: any) => setForm((f) => f ? { ...f, [k]: val } : f)
  const onEmbChange = (val: string) => setForm((f) => { if (!f) return f; const c = calcQtdEmb(val); return { ...f, embalagem_descricao: val, qtd_por_embalagem: c != null ? c : f.qtd_por_embalagem } })

  return (
    <>
      <div className="vin-head">
        <button className="vin-back" onClick={() => { setSelId(null); setForm(null) }}>← Voltar</button>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={1.5}><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v4h-7V8Z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
        <div style={{ flex: 1 }}>
          <div className="vin-h-nome">{selForn.nome_fantasia || selForn.nome || selForn.razao_social || '—'}</div>
          <div className="vin-h-sub">{sub}</div>
        </div>
        <span className="b-cat" style={{ fontSize: 12 }}>{totalItens} itens</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="vin-filter">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Filtrar itens..." value={filtroItens} onChange={(e) => setFiltroItens(e.target.value)} />
          </div>
          <button className="vin-add" onClick={() => abrir()}>+ Vincular Item</button>
        </div>
      </div>

      {form && (
        <div className="vin-form">
          <div className="vin-form-title">{form.id ? 'Editar Vínculo' : 'Vincular Item ao Fornecedor'}</div>
          <div className="form-section">
            <div className="form-section-title">Item interno</div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Insumo / Matéria-prima *</label>
                <SearchSelect value={form.insumo_id ? insLabel(insMap[form.insumo_id] || ({} as Insumo)) : ''} options={insOptions} placeholder="Selecione o item interno..." onChange={(lbl) => setF('insumo_id', insByLabel.get(lbl) || '')} />
              </div>
              <div className="form-group"><label className="form-label">Descrição no fornecedor</label><input className="form-input" value={form.descricao_fornecedor || ''} onChange={(e) => setF('descricao_fornecedor', e.target.value)} placeholder="Como o fornecedor chama o produto" /></div>
              <div className="form-group"><label className="form-label">Código no fornecedor</label><input className="form-input" value={form.codigo_fornecedor || ''} onChange={(e) => setF('codigo_fornecedor', e.target.value)} placeholder="Cód. do produto no catálogo" /></div>
              <div className="form-group"><label className="form-label">EAN/GTIN</label><input className="form-input" style={{ fontFamily: 'DM Mono, monospace' }} value={form.ean || ''} onChange={(e) => setF('ean', e.target.value)} placeholder="Código de barras" /></div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title">Embalagem e Conversão</div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Embalagem fornecedor</label>
                <SearchSelect value={form.embalagem_descricao || ''} options={embOpcoes} placeholder="Selecione a embalagem..." onChange={(v) => onEmbChange(v)} />
              </div>
              <div className="form-group"><label className="form-label">Qt. na Embalagem (un. estoque)</label><input className="form-input" style={{ fontFamily: 'DM Mono, monospace' }} type="number" step="0.001" min="0" placeholder="Auto" value={form.qtd_por_embalagem ?? ''} onChange={(e) => setF('qtd_por_embalagem', e.target.value)} /></div>
            </div>
            <label className="vin-chk"><input type="checkbox" checked={!!form.embalagem_padrao} onChange={(e) => setF('embalagem_padrao', e.target.checked)} /> Embalagem padrão deste fornecedor</label>
            {showConv && <div className="conv-preview"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg><span>1 {form.embalagem_descricao} = {num(Number(form.qtd_por_embalagem))} {selUnd}</span></div>}
          </div>
          <div className="form-section" style={{ marginBottom: 0 }}>
            <div className="form-section-title">Preço</div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Último preço de compra (R$)</label><input className="form-input" type="number" step="0.01" min="0" placeholder="0,00" value={form.preco_unitario ?? ''} onChange={(e) => setF('preco_unitario', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Data da última entrada</label><input className="form-input" type="date" value={form.ultima_entrada || ''} onChange={(e) => setF('ultima_entrada', e.target.value)} /></div>
            </div>
          </div>
          <div className="vin-form-foot">
            <button className="fm-btn" onClick={() => setForm(null)}>Cancelar</button>
            <button className="fm-btn primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate(form)}>{saveMut.isPending ? 'Salvando…' : 'Salvar Vínculo'}</button>
          </div>
        </div>
      )}

      <div className="tbl-card"><div className="tbl-scroll">
        <table>
          <thead><tr><th>Item interno</th><th>Descrição no fornecedor</th><th>Código</th><th>Embalagem</th><th className="r">Qtd. Emb.</th><th className="c">Padrão</th><th className="r">Último preço</th><th className="r">Última entrada</th><th>Ações</th></tr></thead>
          <tbody>
            {itensForn.length === 0 ? <tr><td colSpan={9} className="empty">Nenhum item vinculado a este fornecedor</td></tr>
              : itensForn.map((v) => (
                <tr key={v.id} onClick={() => abrir(v)}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{insMap[v.insumo_id]?.nome || '—'}</td>
                  <td style={{ color: '#64748b' }}>{v.descricao_fornecedor || '—'}</td>
                  <td className="td-mono" style={{ color: '#64748b', fontSize: 11 }}>{v.codigo_fornecedor || '—'}</td>
                  <td style={{ color: '#64748b' }}>{v.embalagem_descricao || '—'}</td>
                  <td className="r td-mono" style={{ color: '#64748b' }}>{v.qtd_por_embalagem != null ? v.qtd_por_embalagem : '—'}</td>
                  <td className="c">{v.embalagem_padrao ? <span className="b-star">★ Padrão</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td className="r td-mono" style={{ fontWeight: 600, color: '#0f172a' }}>{brl(v.preco_unitario)}</td>
                  <td className="r td-mono" style={{ color: '#64748b', fontSize: 12 }}>{fmtDate(v.ultima_entrada)}</td>
                  <td><button className="act-btn" onClick={(e) => { e.stopPropagation(); if (confirm(`Remover vínculo do item "${insMap[v.insumo_id]?.nome || '—'}"?`)) delMut.mutate(v.id) }}>⋮</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
