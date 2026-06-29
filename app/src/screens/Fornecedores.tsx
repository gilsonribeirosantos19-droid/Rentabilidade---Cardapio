import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Fornecedor = {
  id: string
  tenant_id?: string
  codigo?: string
  razao_social?: string
  nome_fantasia?: string
  nome?: string
  cnpj?: string
  contato?: string
  whatsapp?: string
  email?: string
  cidade?: string
  estado?: string
  status?: string
  observacoes?: string
  ativo?: boolean
}

type Form = Partial<Fornecedor>

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function Fornecedores() {
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
    queryKey: ['fornecedores', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .order('razao_social')
      if (error) throw error
      return data as Fornecedor[]
    },
  })

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    if (!q) return lista
    return lista.filter((f) =>
      [f.nome_fantasia, f.razao_social, f.nome, f.cnpj, f.codigo]
        .some((v) => v && norm(String(v)).includes(q))
    )
  }, [lista, busca])

  const saveMut = useMutation({
    mutationFn: async (form: Form) => {
      const razao = (form.razao_social || '').trim()
      if (!razao) throw new Error('Informe a Razão Social.')
      const fantasia = (form.nome_fantasia || '').trim()
      const payload: Form = {
        razao_social: razao,
        nome_fantasia: fantasia || null as unknown as undefined,
        nome: fantasia || razao,
        cnpj: (form.cnpj || '').trim() || null as unknown as undefined,
        contato: (form.contato || '').trim() || null as unknown as undefined,
        whatsapp: (form.whatsapp || '').trim() || null as unknown as undefined,
        email: (form.email || '').trim() || null as unknown as undefined,
        cidade: (form.cidade || '').trim() || null as unknown as undefined,
        estado: (form.estado || '').trim().toUpperCase() || null as unknown as undefined,
        status: form.status || 'ativo',
        observacoes: (form.observacoes || '').trim() || null as unknown as undefined,
        ativo: (form.status || 'ativo') !== 'inativo',
      }
      if (form.id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { data: mx } = await supabase
          .from('fornecedores')
          .select('codigo')
          .eq('tenant_id', tenantId)
          .not('codigo', 'is', null)
          .order('codigo', { ascending: false })
          .limit(1)
        const prox = String(Math.max(parseInt(mx?.[0]?.codigo) || 1000, 1000) + 1)
        const { error } = await supabase
          .from('fornecedores')
          .insert({ ...payload, tenant_id: tenantId, codigo: prox })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      setEditing(null)
      showToast('Fornecedor salvo.', 'ok')
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fornecedores')
        .update({ ativo: false, status: 'inativo' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      showToast('Fornecedor desativado.', 'ok')
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="pane">
      <div className="scr-h">Fornecedores</div>
      <div className="scr-d">Cadastro de fornecedores — {lista.length} ativo(s).</div>

      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar por nome, CNPJ ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setEditing({ status: 'ativo' })}>
          + Novo Fornecedor
        </button>
      </div>

      {isLoading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtrada.length === 0 ? (
        <div className="empty">Nenhum fornecedor encontrado.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Fornecedor</th>
              <th>CNPJ</th>
              <th>Contato</th>
              <th>Cidade/UF</th>
              <th>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((f) => (
              <tr key={f.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{f.codigo || '—'}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.nome_fantasia || f.nome || f.razao_social || '—'}</div>
                  {f.razao_social && (f.nome_fantasia || f.nome) && (
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{f.razao_social}</div>
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{f.cnpj || '—'}</td>
                <td style={{ color: 'var(--text2)' }}>{f.contato || '—'}</td>
                <td style={{ color: 'var(--text2)' }}>
                  {[f.cidade, f.estado].filter(Boolean).join(' / ') || '—'}
                </td>
                <td>
                  <span className={'badge ' + (f.ativo !== false ? 'ok' : 'off')}>
                    {f.ativo !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="icon-btn" title="Editar" onClick={() => setEditing(f)}>✎</button>
                    <button
                      className="icon-btn"
                      title="Desativar"
                      onClick={() => {
                        if (confirm(`Desativar "${f.nome_fantasia || f.nome || f.razao_social}"?`)) delMut.mutate(f.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <FornModal
          inicial={editing}
          saving={saveMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(form) => saveMut.mutate(form)}
        />
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function FornModal({
  inicial,
  saving,
  onClose,
  onSave,
}: {
  inicial: Form
  saving: boolean
  onClose: () => void
  onSave: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>{form.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</b>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">
          <div className="grid2">
            <div className="span2">
              <label className="lbl">Razão Social *</label>
              <input className="input" value={form.razao_social || ''} onChange={(e) => set('razao_social', e.target.value)} placeholder="Ex: Distribuidora de Alimentos Ltda" autoFocus />
            </div>
            <div>
              <label className="lbl">Nome Fantasia</label>
              <input className="input" value={form.nome_fantasia || ''} onChange={(e) => set('nome_fantasia', e.target.value)} placeholder="Ex: FrisFrios" />
            </div>
            <div>
              <label className="lbl">CNPJ</label>
              <input className="input" value={form.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <div>
              <label className="lbl">Nome do contato</label>
              <input className="input" value={form.contato || ''} onChange={(e) => set('contato', e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <label className="lbl">WhatsApp</label>
              <input className="input" value={form.whatsapp || ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(92) 9 9999-9999" />
            </div>
            <div className="span2">
              <label className="lbl">E-mail</label>
              <input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="contato@fornecedor.com" />
            </div>
            <div>
              <label className="lbl">Cidade</label>
              <input className="input" value={form.cidade || ''} onChange={(e) => set('cidade', e.target.value)} placeholder="Ex: Manaus" />
            </div>
            <div>
              <label className="lbl">Estado (UF)</label>
              <input className="input" maxLength={2} value={form.estado || ''} onChange={(e) => set('estado', e.target.value.toUpperCase())} placeholder="AM" />
            </div>
            <div>
              <label className="lbl">Status</label>
              <select className="input" value={form.status || 'ativo'} onChange={(e) => set('status', e.target.value)}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div className="span2">
              <label className="lbl">Observações</label>
              <textarea className="input" value={form.observacoes || ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Informações adicionais…" />
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? 'Salvando…' : 'Salvar Fornecedor'}
          </button>
        </div>
      </div>
    </div>
  )
}
