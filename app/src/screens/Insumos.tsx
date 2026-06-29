import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './insumos.css'

type Insumo = {
  id: string
  tenant_id?: string
  codigo_interno?: number
  nome?: string
  tipo_item?: string
  familia?: string
  categoria?: string
  subgrupo?: string
  unidade_medida?: string
  unidade_compra?: string
  preco_compra?: number
  rendimento_pct?: number
  participa_cmv?: string
  observacao?: string | null
  ativo?: boolean
}
type Form = Partial<Insumo>

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const fmtCodigo = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const getStatus = (i: Insumo) => {
  const r = Number(i.rendimento_pct ?? 100)
  return r < 60 ? 'critico' : r < 72 ? 'atencao' : 'ativo'
}
const uniq = (arr: (string | undefined)[]) => [...new Set(arr.filter(Boolean) as string[])].sort()

export function Insumos() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'cadastro' | 'produtos' | 'custos'>('produtos')
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fFam, setFFam] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fSub, setFSub] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fEstq, setFEstq] = useState('')
  const [editing, setEditing] = useState<Form | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)

  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['insumos', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos').select('*').eq('tenant_id', tenantId).order('nome')
      if (error) throw error
      return data as Insumo[]
    },
  })

  const opts = useMemo(() => ({
    tipos: uniq(lista.map((i) => i.tipo_item)),
    familias: uniq(lista.map((i) => i.familia)),
    grupos: uniq(lista.map((i) => i.categoria)),
    subgrupos: uniq(lista.map((i) => i.subgrupo)),
    unidades: uniq(lista.map((i) => i.unidade_medida)),
  }), [lista])

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    return lista.filter((i) => {
      if (q && !norm([i.nome, i.codigo_interno, i.categoria].filter(Boolean).join(' ')).includes(q)) return false
      if (fTipo && (i.tipo_item || '') !== fTipo) return false
      if (fFam && (i.familia || '') !== fFam) return false
      if (fGrupo && (i.categoria || '') !== fGrupo) return false
      if (fSub && (i.subgrupo || '') !== fSub) return false
      if (fStatus && String(i.ativo !== false) !== fStatus) return false
      if (fEstq && getStatus(i) !== fEstq) return false
      return true
    })
  }, [lista, busca, fTipo, fFam, fGrupo, fSub, fStatus, fEstq])

  const saveMut = useMutation({
    mutationFn: async (form: Form) => {
      const nome = (form.nome || '').trim()
      if (!nome) throw new Error('Informe a descrição.')
      const payload = {
        nome,
        tipo_item: form.tipo_item || null,
        familia: form.familia || null,
        categoria: form.categoria || null,
        subgrupo: form.subgrupo || null,
        unidade_medida: form.unidade_medida || null,
        participa_cmv: form.participa_cmv === 'nao' ? 'nao' : 'sim',
        preco_compra: form.preco_compra != null ? Number(form.preco_compra) : null,
        rendimento_pct: Number(form.rendimento_pct) || 100,
        observacao: (form.observacao || '').trim() || null,
      }
      if (form.id) {
        const { error } = await supabase.from('insumos').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const prox = lista.reduce((m, i) => Math.max(m, Number(i.codigo_interno) || 0), 0) + 1
        const { error } = await supabase.from('insumos').insert({ ...payload, tenant_id: tenantId, ativo: true, codigo_interno: prox })
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); setEditing(null); showToast('Item salvo.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insumos').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); showToast('Item desativado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="ins-screen">
      <div className="mod-tabs">
        <button className={'mod-tab' + (tab === 'cadastro' ? ' active' : '')} onClick={() => setTab('cadastro')}>Cadastro de Item</button>
        <button className={'mod-tab' + (tab === 'produtos' ? ' active' : '')} onClick={() => setTab('produtos')}>Produtos / Itens</button>
        <button className={'mod-tab' + (tab === 'custos' ? ' active' : '')} onClick={() => setTab('custos')}>Base de Custos da Ficha Técnica</button>
      </div>

      {tab !== 'produtos' ? (
        <div className="ins-body">
          <div className="empty">🚧 Esta aba será migrada em breve. (A lista "Produtos / Itens" já está pronta.)</div>
        </div>
      ) : (
        <div className="ins-body">
          {/* FILTROS */}
          <div className="prod-toolbar">
            <div className="prod-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Buscar item..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className="prod-filter" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">Tipo do item ▾</option>
              {opts.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="prod-filter" value={fFam} onChange={(e) => setFFam(e.target.value)}>
              <option value="">Família ▾</option>
              {opts.familias.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="prod-filter" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}>
              <option value="">Grupo ▾</option>
              {opts.grupos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="prod-filter" value={fSub} onChange={(e) => setFSub(e.target.value)}>
              <option value="">Subgrupo ▾</option>
              {opts.subgrupos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="prod-filter" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Status ▾</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
            <select className="prod-filter" value={fEstq} onChange={(e) => setFEstq(e.target.value)}>
              <option value="">Situação de estoque ▾</option>
              <option value="ativo">Em estoque</option>
              <option value="atencao">Estoque baixo</option>
              <option value="critico">Crítico</option>
            </select>
          </div>

          {/* TABELA */}
          <div className="tbl-card">
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <svg className="colgrid" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                      Código Interno
                    </th>
                    <th>Descrição</th>
                    <th>Tipo do Item</th>
                    <th>Grupo</th>
                    <th>Unidade</th>
                    <th className="r">Qtd. Emb.</th>
                    <th className="c">Calcula CMV</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="empty">Carregando…</td></tr>
                  ) : filtrada.length === 0 ? (
                    <tr><td colSpan={8} className="empty">Nenhum item encontrado</td></tr>
                  ) : (
                    filtrada.map((i) => (
                      <tr key={i.id} onClick={() => setEditing(i)}>
                        <td className="td-mono" style={{ color: '#64748b', fontSize: 11 }}>{fmtCodigo(i.codigo_interno)}</td>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{i.nome}</td>
                        <td style={{ color: '#64748b' }}>{i.tipo_item || '—'}</td>
                        <td><span className="badge b-cat">{i.categoria || '—'}</span></td>
                        <td style={{ color: '#64748b' }}>{i.unidade_medida || '—'}</td>
                        <td className="r td-mono" style={{ color: '#64748b' }}>—</td>
                        <td className="c">{i.participa_cmv !== 'nao' ? <span className="cmv-on">✓</span> : <span className="cmv-off" />}</td>
                        <td>
                          <button className="acoes-btn" onClick={(e) => { e.stopPropagation(); setMenu({ id: i.id, x: e.clientX, y: e.clientY }) }}>⋮</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div style={{ position: 'fixed', top: menu.y + 4, left: menu.x - 120, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,.14)', zIndex: 1000, minWidth: 130, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
          <button className="menu-i" style={menuItemStyle} onClick={() => { const ins = lista.find((x) => x.id === menu.id); setEditing(ins || null); setMenu(null) }}>✎ Editar</button>
          <button className="menu-i" style={{ ...menuItemStyle, color: '#ef4444' }} onClick={() => { const ins = lista.find((x) => x.id === menu.id); if (ins && confirm(`Desativar "${ins.nome}"?`)) delMut.mutate(ins.id); setMenu(null) }}>🗑 Desativar</button>
        </div>
      )}

      {editing && (
        <InsumoModal inicial={editing} opts={opts} saving={saveMut.isPending} onClose={() => setEditing(null)} onSave={(f) => saveMut.mutate(f)} />
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

const menuItemStyle: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', background: 'none', border: 'none', fontSize: 13, fontFamily: 'inherit', color: '#334155', cursor: 'pointer' }

function InsumoModal({ inicial, opts, saving, onClose, onSave }: {
  inicial: Form
  opts: { tipos: string[]; familias: string[]; grupos: string[]; subgrupos: string[]; unidades: string[] }
  saving: boolean
  onClose: () => void
  onSave: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b>{form.id ? 'Editar Item' : 'Novo Item'}</b><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <div className="grid2">
            <div className="span2"><label className="lbl">Descrição *</label><input className="input" value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} autoFocus /></div>
            <div><label className="lbl">Tipo do Item</label><EditableSelect value={form.tipo_item || ''} options={opts.tipos} onChange={(v) => set('tipo_item', v)} /></div>
            <div><label className="lbl">Família</label><EditableSelect value={form.familia || ''} options={opts.familias} onChange={(v) => set('familia', v)} /></div>
            <div><label className="lbl">Grupo</label><EditableSelect value={form.categoria || ''} options={opts.grupos} onChange={(v) => set('categoria', v)} /></div>
            <div><label className="lbl">Subgrupo</label><EditableSelect value={form.subgrupo || ''} options={opts.subgrupos} onChange={(v) => set('subgrupo', v)} /></div>
            <div><label className="lbl">Unidade</label><EditableSelect value={form.unidade_medida || ''} options={opts.unidades} onChange={(v) => set('unidade_medida', v)} /></div>
            <div><label className="lbl">Calcula CMV</label>
              <select className="input" value={form.participa_cmv === 'nao' ? 'nao' : 'sim'} onChange={(e) => set('participa_cmv', e.target.value)}>
                <option value="sim">Sim</option><option value="nao">Não</option>
              </select>
            </div>
            <div><label className="lbl">Preço de compra (R$)</label><input className="input" type="number" step="0.01" value={form.preco_compra ?? ''} onChange={(e) => set('preco_compra', e.target.value)} /></div>
            <div><label className="lbl">Rendimento (%)</label><input className="input" type="number" value={form.rendimento_pct ?? 100} onChange={(e) => set('rendimento_pct', e.target.value)} /></div>
            <div className="span2"><label className="lbl">Observação</label><input className="input" value={form.observacao || ''} onChange={(e) => set('observacao', e.target.value)} /></div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function EditableSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione…</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
