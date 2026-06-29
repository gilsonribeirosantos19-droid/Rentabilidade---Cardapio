import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Insumo = {
  id: string
  tenant_id?: string
  codigo_interno?: number
  nome?: string
  categoria?: string
  unidade_compra?: string
  preco_compra?: number
  rendimento_pct?: number
  observacao?: string | null
  ativo?: boolean
}
type Form = Partial<Insumo>

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const custoReal = (preco: number, rend: number) => (rend > 0 ? preco / (rend / 100) : preco)

export function Insumos() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [editing, setEditing] = useState<Form | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)

  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 2600)
  }

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['insumos', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insumos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data as Insumo[]
    },
  })

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-insumo', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('categorias')
        .select('nome')
        .eq('tenant_id', tenantId)
        .eq('tipo', 'insumo')
        .order('nome')
      return (data ?? []).map((c: { nome: string }) => c.nome)
    },
  })

  const { data: unidades = [] } = useQuery({
    queryKey: ['unidades', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('unidades_medida')
        .select('nome, abreviacao')
        .eq('tenant_id', tenantId)
        .order('nome')
      return (data ?? []) as { nome: string; abreviacao?: string }[]
    },
  })

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    if (!q) return lista
    return lista.filter((i) =>
      [i.nome, i.categoria, i.codigo_interno].some((v) => v != null && norm(String(v)).includes(q))
    )
  }, [lista, busca])

  const saveMut = useMutation({
    mutationFn: async (form: Form) => {
      const nome = (form.nome || '').trim()
      if (!nome || !form.categoria || !form.unidade_compra || form.preco_compra == null)
        throw new Error('Preencha nome, categoria, unidade e preço.')
      const payload = {
        nome,
        categoria: form.categoria,
        unidade_compra: form.unidade_compra,
        preco_compra: Number(form.preco_compra),
        rendimento_pct: Number(form.rendimento_pct) || 100,
        observacao: (form.observacao || '').trim() || null,
      }
      if (form.id) {
        const { error } = await supabase.from('insumos').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const prox = lista.reduce((m, i) => Math.max(m, Number(i.codigo_interno) || 0), 0) + 1
        const { error } = await supabase
          .from('insumos')
          .insert({ ...payload, tenant_id: tenantId, ativo: true, codigo_interno: prox })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      setEditing(null)
      showToast('Insumo salvo.', 'ok')
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insumos').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      showToast('Insumo desativado.', 'ok')
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="pane">
      <div className="scr-h">Insumos</div>
      <div className="scr-d">Matéria-prima — {lista.length} ativo(s). Custo calculado por R$/kg considerando o rendimento.</div>

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar por nome, categoria ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setEditing({ rendimento_pct: 100 })}>
          + Novo Insumo
        </button>
      </div>

      {isLoading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtrada.length === 0 ? (
        <div className="empty">Nenhum insumo encontrado.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Un.</th>
              <th style={{ textAlign: 'right' }}>Preço compra</th>
              <th style={{ textAlign: 'right' }}>Rend.</th>
              <th style={{ textAlign: 'right' }}>Custo real</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((i) => {
              const preco = Number(i.preco_compra) || 0
              const rend = Number(i.rendimento_pct) || 100
              return (
                <tr key={i.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{i.codigo_interno ?? '—'}</td>
                  <td style={{ fontWeight: 600 }}>{i.nome}</td>
                  <td style={{ color: 'var(--text2)' }}>{i.categoria || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{i.unidade_compra || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{brl(preco)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{rend}%</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{brl(custoReal(preco, rend))}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="icon-btn" title="Editar" onClick={() => setEditing(i)}>✎</button>
                      <button
                        className="icon-btn"
                        title="Desativar"
                        onClick={() => { if (confirm(`Desativar "${i.nome}"?`)) delMut.mutate(i.id) }}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <InsumoModal
          inicial={editing}
          categorias={categorias}
          unidades={unidades}
          saving={saveMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(form) => saveMut.mutate(form)}
        />
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function InsumoModal({
  inicial,
  categorias,
  unidades,
  saving,
  onClose,
  onSave,
}: {
  inicial: Form
  categorias: string[]
  unidades: { nome: string; abreviacao?: string }[]
  saving: boolean
  onClose: () => void
  onSave: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const preco = Number(form.preco_compra) || 0
  const rend = Number(form.rendimento_pct) || 100
  const custo = custoReal(preco, rend)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>{form.id ? 'Editar Insumo' : 'Novo Insumo'}</b>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">
          <div className="grid2">
            <div className="span2">
              <label className="lbl">Nome *</label>
              <input className="input" value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Salmão fresco" autoFocus />
            </div>
            <div>
              <label className="lbl">Categoria *</label>
              <select className="input" value={form.categoria || ''} onChange={(e) => set('categoria', e.target.value)}>
                <option value="">Selecione…</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Unidade *</label>
              <select className="input" value={form.unidade_compra || ''} onChange={(e) => set('unidade_compra', e.target.value)}>
                <option value="">Selecione…</option>
                {unidades.map((u) => {
                  const v = u.abreviacao || u.nome
                  return <option key={v} value={v}>{u.nome}</option>
                })}
              </select>
            </div>
            <div>
              <label className="lbl">Preço de compra (R$) *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.preco_compra ?? ''} onChange={(e) => set('preco_compra', e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className="lbl">Rendimento / FC (%)</label>
              <input className="input" type="number" step="1" min="1" max="100" value={form.rendimento_pct ?? 100} onChange={(e) => set('rendimento_pct', e.target.value)} placeholder="100" />
            </div>
            <div className="span2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Custo real (considerando rendimento)</span>
              <b style={{ fontFamily: 'monospace', fontSize: 16, color: 'var(--orange)' }}>{brl(custo)}</b>
            </div>
            <div className="span2">
              <label className="lbl">Observação</label>
              <input className="input" value={form.observacao || ''} onChange={(e) => set('observacao', e.target.value)} placeholder="Ex: limpar espinha e pele antes de usar" />
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? 'Salvando…' : 'Salvar Insumo'}
          </button>
        </div>
      </div>
    </div>
  )
}
