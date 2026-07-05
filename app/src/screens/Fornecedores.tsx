import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import { VinculosPane } from './VinculosPane'
import './fornecedores.css'

type Fornecedor = {
  id: string; tenant_id?: string; codigo?: string
  razao_social?: string; nome_fantasia?: string; nome?: string; cnpj?: string
  inscricao_estadual?: string; categoria?: string
  contato?: string; whatsapp?: string; email?: string; telefone?: string
  cep?: string; logradouro?: string; numero?: string; bairro?: string; cidade?: string; estado?: string
  prazo_entrega_dias?: number | string | null; pedido_minimo?: number | string | null; condicao_pagamento?: string
  status?: string; observacoes?: string | null; ativo?: boolean
}
type Form = Partial<Fornecedor>

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()

export function Fornecedores() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'fornecedores' | 'vinculos'>('fornecedores')
  const [busca, setBusca] = useState('')
  const [fCidade, setFCidade] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [editing, setEditing] = useState<Form | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600) }

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['fornecedores', tenantId], enabled: !!tenantId,
    // fetchAll: vence o teto de 1000 do PostgREST
    queryFn: () => fetchAll<Fornecedor>((f, t) => supabase.from('fornecedores').select('*').eq('tenant_id', tenantId).order('razao_social').range(f, t)),
  })
  const { data: vinculos = [] } = useQuery({
    queryKey: ['insumo-forn', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      // filtra por tenant explicitamente (não depende só da RLS), igual às demais queries
      const { data } = await supabase.from('insumo_fornecedores').select('fornecedor_id').eq('tenant_id', tenantId)
      return (data ?? []) as { fornecedor_id: string }[]
    },
  })
  const itensPorForn = useMemo(() => {
    const m: Record<string, number> = {}
    vinculos.forEach((v) => { m[v.fornecedor_id] = (m[v.fornecedor_id] || 0) + 1 })
    return m
  }, [vinculos])
  const cidades = useMemo(() => uniq(lista.map((f) => f.cidade)), [lista])

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    return lista.filter((f) => {
      if (q && !norm([f.nome, f.razao_social, f.nome_fantasia, f.cnpj, f.codigo].filter(Boolean).join(' ')).includes(q)) return false
      if (fCidade && (f.cidade || '') !== fCidade) return false
      if (fStatus && (f.status || (f.ativo === false ? 'inativo' : 'ativo')) !== fStatus) return false
      return true
    })
  }, [lista, busca, fCidade, fStatus])

  const saveMut = useMutation({
    mutationFn: async (form: Form) => {
      const razao = (form.razao_social || '').trim()
      if (!razao) throw new Error('Informe a Razão Social.')
      // CNPJ único (evita auto-vínculo ambíguo da NF-e por CNPJ do emitente)
      const cnpjDigits = (form.cnpj || '').replace(/\D/g, '')
      if (cnpjDigits) {
        const dup = lista.find((x) => x.id !== form.id && (x.cnpj || '').replace(/\D/g, '') === cnpjDigits)
        if (dup) throw new Error(`CNPJ já cadastrado em "${dup.nome_fantasia || dup.nome || dup.razao_social}".`)
      }
      const fantasia = (form.nome_fantasia || '').trim()
      const numOrNull = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null }
      const payload = {
        razao_social: razao, nome_fantasia: fantasia || null, nome: fantasia || razao,
        cnpj: (form.cnpj || '').trim() || null, inscricao_estadual: (form.inscricao_estadual || '').trim() || null,
        categoria: (form.categoria || '').trim() || null,
        contato: (form.contato || '').trim() || null, whatsapp: (form.whatsapp || '').trim() || null,
        email: (form.email || '').trim() || null, telefone: (form.telefone || '').trim() || null,
        cep: (form.cep || '').trim() || null, logradouro: (form.logradouro || '').trim() || null,
        numero: (form.numero || '').trim() || null, bairro: (form.bairro || '').trim() || null,
        cidade: (form.cidade || '').trim() || null, estado: (form.estado || '').trim().toUpperCase() || null,
        prazo_entrega_dias: numOrNull(form.prazo_entrega_dias), pedido_minimo: numOrNull(form.pedido_minimo),
        condicao_pagamento: (form.condicao_pagamento || '').trim() || null,
        status: form.status || 'ativo', observacoes: (form.observacoes || '').trim() || null,
        ativo: (form.status || 'ativo') !== 'inativo',
      }
      if (form.id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', form.id); if (error) throw error
      } else {
        // maior código NUMÉRICO (o codigo é texto — ordenar por texto quebra: "999" > "1000").
        // Fornecedores são poucos, então buscar todos e calcular o max em JS é barato e correto.
        const { data: cods } = await supabase.from('fornecedores').select('codigo').eq('tenant_id', tenantId).not('codigo', 'is', null)
        const maxNum = (cods ?? []).reduce((m, r: { codigo?: string }) => Math.max(m, parseInt(String(r.codigo)) || 0), 1000)
        const cod = String(maxNum + 1)
        const { error } = await supabase.from('fornecedores').insert({ ...payload, tenant_id: tenantId, codigo: cod }); if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fornecedores'] }); setEditing(null); showToast('Fornecedor salvo.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('fornecedores').update({ ativo: false, status: 'inativo' }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fornecedores'] }); showToast('Fornecedor desativado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="forn-screen">
      <div className="mod-tabs">
        <button className={'mod-tab' + (tab === 'fornecedores' ? ' active' : '')} onClick={() => setTab('fornecedores')}>Cadastro de Fornecedor</button>
        <button className={'mod-tab' + (tab === 'vinculos' ? ' active' : '')} onClick={() => setTab('vinculos')}>Item × Fornecedor</button>
      </div>
      {tab === 'vinculos' ? (
        <VinculosPane fornecedores={lista} />
      ) : (
      <>
      <div className="fl-toolbar">
        <div className="fl-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar por código, nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="fl-cidade"><SearchSelect value={fCidade} onChange={setFCidade} options={cidades} placeholder="Cidade ▾" /></div>
        <select className="fl-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Status ▾</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
        </select>
        <button className="fl-novo" onClick={() => setEditing({ status: 'ativo' })}>+ Novo Fornecedor</button>
      </div>

      <div className="tbl-card"><div className="tbl-scroll">
        <table>
          <thead><tr>
            <th style={{ width: 72 }}>Código</th><th>Fornecedor</th><th>CNPJ</th><th>Cidade / UF</th><th>Contato</th><th>Status</th><th className="r">Última compra</th><th className="r">Itens</th><th>Ações</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : filtrada.length === 0 ? <tr><td colSpan={9} className="empty">Nenhum fornecedor encontrado</td></tr>
              : filtrada.map((f) => {
                const inativo = f.status === 'inativo' || f.ativo === false
                const cidUF = [f.cidade, f.estado].filter(Boolean).join(' / ') || '—'
                return (
                  <tr key={f.id} onClick={() => setEditing(f)}>
                    <td className="td-mono" style={{ fontSize: 12 }}>{f.codigo || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{f.nome_fantasia || f.nome || f.razao_social || '—'}</div>
                      {f.razao_social && (f.nome_fantasia || f.nome) && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{f.razao_social}</div>}
                    </td>
                    <td className="td-mono" style={{ color: '#64748b', fontSize: 12 }}>{f.cnpj || '—'}</td>
                    <td style={{ color: '#64748b' }}>{cidUF}</td>
                    <td style={{ color: '#64748b' }}>{f.contato || '—'}</td>
                    <td><span className={'badge ' + (inativo ? 'b-inativo' : 'b-ativo')}>{inativo ? 'Inativo' : 'Ativo'}</span></td>
                    <td className="r td-mono" style={{ color: '#64748b', fontSize: 12 }}>—</td>
                    <td className="r" style={{ color: '#64748b' }}>{itensPorForn[f.id] || '—'}</td>
                    <td><button className="act-btn" title="Desativar" onClick={(e) => { e.stopPropagation(); if (confirm(`Desativar "${f.nome_fantasia || f.nome || f.razao_social}"?`)) delMut.mutate(f.id) }}>⋮</button></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>
      <div className="list-foot">Mostrando {filtrada.length ? 1 : 0}–{filtrada.length} de {filtrada.length}</div>
      </>
      )}

      {editing && <FornModal inicial={editing} saving={saveMut.isPending} onClose={() => setEditing(null)} onSave={(f) => saveMut.mutate(f)} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function FornModal({ inicial, saving, onClose, onSave }: { inicial: Form; saving: boolean; onClose: () => void; onSave: (f: Form) => void }) {
  const [form, setForm] = useState<Form>(inicial)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="fm" onClick={(e) => e.stopPropagation()}>
        <div className="fm-head">
          <h2>{form.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
          <button className="fm-close" onClick={onClose}>✕</button>
        </div>
        <div className="fm-body">
          <div className="form-section">
            <div className="form-section-title">Identificação</div>
            <div className="fg-1">
              <div className="form-group"><label className="form-label">Razão Social *</label><input className="form-input" value={form.razao_social || ''} onChange={(e) => set('razao_social', e.target.value)} placeholder="Ex: SPN Restaurante, Lanchonete e Fornecimento de Alimentos Ltda" autoFocus /></div>
            </div>
            <div className="fg-ident">
              <div className="form-group"><label className="form-label">Nome Fantasia</label><input className="form-input" value={form.nome_fantasia || ''} onChange={(e) => set('nome_fantasia', e.target.value)} placeholder="Ex: Sushi Ponta Negra Matriz" /></div>
              <div className="form-group"><label className="form-label">CNPJ</label><input className="form-input" maxLength={18} value={form.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" /></div>
              <div className="form-group"><label className="form-label">Inscrição Estadual</label><input className="form-input" value={form.inscricao_estadual || ''} onChange={(e) => set('inscricao_estadual', e.target.value)} placeholder="12.345.678-9 / ISENTO" /></div>
              <div className="form-group"><label className="form-label">Categoria</label>
                <select className="form-select" value={form.categoria || ''} onChange={(e) => set('categoria', e.target.value)}>
                  <option value="">Selecione...</option><option>Hortifruti</option><option>Proteína</option><option>Bebidas</option><option>Embalagens</option><option>Limpeza</option><option>Mercearia</option><option>Outros</option>
                </select>
              </div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title">Contato</div>
            <div className="fg-contato">
              <div className="form-group"><label className="form-label">Nome do contato</label><input className="form-input" value={form.contato || ''} onChange={(e) => set('contato', e.target.value)} placeholder="Ex: João Silva" /></div>
              <div className="form-group"><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp || ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(92) 9 9999-9999" /></div>
              <div className="form-group"><label className="form-label">Telefone fixo</label><input className="form-input" value={form.telefone || ''} onChange={(e) => set('telefone', e.target.value)} placeholder="(92) 3xxx-xxxx" /></div>
              <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="contato@fornecedor.com" /></div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title">Localização</div>
            <div className="fg-loc">
              <div className="form-group"><label className="form-label">CEP</label><input className="form-input" value={form.cep || ''} onChange={(e) => set('cep', e.target.value)} placeholder="69000-000" /></div>
              <div className="form-group"><label className="form-label">Logradouro</label><input className="form-input" value={form.logradouro || ''} onChange={(e) => set('logradouro', e.target.value)} placeholder="Rua / Av." /></div>
              <div className="form-group"><label className="form-label">Nº</label><input className="form-input" value={form.numero || ''} onChange={(e) => set('numero', e.target.value)} placeholder="123" /></div>
              <div className="form-group"><label className="form-label">Bairro</label><input className="form-input" value={form.bairro || ''} onChange={(e) => set('bairro', e.target.value)} placeholder="Centro" /></div>
              <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" value={form.cidade || ''} onChange={(e) => set('cidade', e.target.value)} placeholder="Manaus" /></div>
              <div className="form-group"><label className="form-label">UF</label><input className="form-input" maxLength={2} value={form.estado || ''} onChange={(e) => set('estado', e.target.value.toUpperCase())} placeholder="AM" /></div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title">Condições comerciais</div>
            <div className="fg-cond">
              <div className="form-group"><label className="form-label">Prazo de entrega (dias)</label><input className="form-input" type="number" min="0" value={form.prazo_entrega_dias ?? ''} onChange={(e) => set('prazo_entrega_dias', e.target.value)} placeholder="Ex: 2" /><div className="fld-hint">Dias que o fornecedor leva pra entregar — usado no ponto de pedido / Sugestão de Compra.</div></div>
              <div className="form-group"><label className="form-label">Pedido mínimo (R$)</label><input className="form-input" value={form.pedido_minimo ?? ''} onChange={(e) => set('pedido_minimo', e.target.value)} placeholder="300,00" /></div>
              <div className="form-group"><label className="form-label">Condição de pagamento</label>
                <select className="form-select" value={form.condicao_pagamento || ''} onChange={(e) => set('condicao_pagamento', e.target.value)}>
                  <option value="">Selecione...</option><option>À vista</option><option>7 dias</option><option>14 dias</option><option>21 dias</option><option>28 dias</option><option>30 dias</option><option>Boleto / faturado</option>
                </select>
              </div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title">Observações e situação</div>
            <div className="fg-obs">
              <div className="form-group"><label className="form-label">Observações</label><textarea className="form-input form-textarea" value={form.observacoes || ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Ex: entrega só de manhã, vendedor Carlos, aceita devolução..." /></div>
              <div className="form-group"><label className="form-label">Situação</label>
                <select className="form-select" value={form.status || 'ativo'} onChange={(e) => set('status', e.target.value)}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
              </div>
            </div>
          </div>
        </div>
        <div className="fm-foot">
          <button className="fm-btn" onClick={onClose}>Cancelar</button>
          <button className="fm-btn primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Salvando…' : 'Salvar Fornecedor'}</button>
        </div>
      </div>
    </div>
  )
}
