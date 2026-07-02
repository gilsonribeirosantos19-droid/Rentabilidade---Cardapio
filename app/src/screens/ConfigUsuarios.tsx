import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Configurações › Usuários — CRUD de usuários (tabela `usuarios`) + criação/senha
// via Edge Function `admin-users` (a chave admin fica no servidor).
// Papéis: admin / gerente / operador. Loja vinculada só para gerente.

type Usuario = { id: string; nome?: string; email?: string; role?: string; loja_id?: string | null }
type Loja = { id: string; nome: string }
type Modal = { id?: string; nome: string; email: string; role: string; lojaId: string; senha: string }

const ROLES = [{ v: 'admin', l: 'Administrador' }, { v: 'gerente', l: 'Gerente' }, { v: 'operador', l: 'Operador' }]
const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', gerente: 'Gerente', operador: 'Operador' }
const roleCls = (r?: string) => (r === 'admin' ? 'role-admin' : r === 'gerente' ? 'role-gerente' : 'role-operador')

// chama a Edge Function admin-users; extrai a mensagem de erro do corpo da resposta
async function invokeAdmin(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try { const b = await (error as unknown as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return data
}

export function ConfigUsuarios() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<Modal | null>(null)
  const [del, setDel] = useState<{ id: string; nome: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 7000 : 2600) }

  const { data: usuarios = [], isLoading, error: qErr } = useQuery({
    queryKey: ['cfg-usuarios', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data, error } = await supabase.from('usuarios').select('*').eq('tenant_id', tenantId).order('nome'); if (error) throw error; return (data ?? []) as Usuario[] },
  })
  const { data: lojas = [] } = useQuery({
    queryKey: ['cfg-usr-lojas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] },
  })
  const lojaNome = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])

  const novo = () => setModal({ nome: '', email: '', role: 'operador', lojaId: '', senha: '' })
  const editar = (u: Usuario) => setModal({ id: u.id, nome: u.nome ?? '', email: u.email ?? '', role: u.role ?? 'operador', lojaId: u.loja_id ?? '', senha: '' })

  const saveMut = useMutation({
    mutationFn: async (m: Modal) => {
      const nome = m.nome.trim(), email = m.email.trim()
      if (!nome) throw new Error('Informe o nome.')
      if (!email) throw new Error('Informe o e-mail.')
      if (!m.id && !m.senha) throw new Error('Informe a senha inicial.')
      const lojaId = m.role === 'gerente' ? (m.lojaId || null) : null
      if (m.id) {
        const { error } = await supabase.from('usuarios').update({ nome, role: m.role, tenant_id: tenantId, loja_id: lojaId }).eq('id', m.id); if (error) throw error
        if (m.senha) await invokeAdmin({ action: 'update_password', userId: m.id, password: m.senha })
      } else {
        const auth = await invokeAdmin({ action: 'create', email, password: m.senha })
        const userId = auth?.id
        if (!userId) throw new Error('A conta de acesso não retornou um ID.')
        // grava email também (coluna adicionada via SQL); se ainda não existir a coluna, cai no catch e insere sem email
        const base = { id: userId, nome, role: m.role, tenant_id: tenantId, loja_id: lojaId, ativo: true }
        let ins = await supabase.from('usuarios').insert({ ...base, email })
        if (ins.error && /email/i.test(ins.error.message)) ins = await supabase.from('usuarios').insert(base)
        if (ins.error) throw ins.error
      }
    },
    onSuccess: (_d, m) => { qc.invalidateQueries({ queryKey: ['cfg-usuarios'] }); setModal(null); showToast(m.id ? 'Usuário atualizado.' : 'Usuário criado.') },
    onError: (e: Error) => { console.error('[ConfigUsuarios]', e); showToast('Erro: ' + e.message, true) },
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('usuarios').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-usuarios'] }); setDel(null); showToast('Usuário removido.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">Gerencie o acesso e o perfil de cada colaborador.</div>
        <button className="cfg-btn pri" onClick={novo}>+ Novo usuário</button>
      </div>

      <div className="usr-list">
        {isLoading ? <div className="usr-empty">Carregando usuários…</div>
          : qErr ? <div className="usr-empty" style={{ color: '#b91c1c' }}>Erro ao carregar: {(qErr as Error).message}</div>
          : usuarios.length === 0 ? <div className="usr-empty">Nenhum usuário cadastrado. Clique em “+ Novo usuário”.</div>
            : usuarios.map((u) => (
              <div className="usr-card" key={u.id}>
                <div className="usr-avatar">{(u.nome || '?')[0].toUpperCase()}</div>
                <div className="usr-info">
                  <div className="usr-nome">{u.nome || '—'}</div>
                  <div className="usr-email">{u.email || '—'}{u.role === 'gerente' && u.loja_id ? ` · ${lojaNome[u.loja_id] || 'loja'}` : ''}</div>
                </div>
                <span className={'role-badge ' + roleCls(u.role)}>{ROLE_LABEL[u.role || ''] || u.role || '—'}</span>
                <div className="usr-acts">
                  <button className="cfg-btn" style={{ height: 30 }} onClick={() => editar(u)}>Editar</button>
                  <button className="cfg-btn danger" style={{ height: 30 }} onClick={() => setDel({ id: u.id, nome: u.nome ?? '' })}>Remover</button>
                </div>
              </div>
            ))}
      </div>

      <div className="info-card">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <div>O <b>perfil</b> define o nível de acesso: <b>Administrador</b> (tudo), <b>Gerente</b> (vinculado a uma loja) e <b>Operador</b>. O controle fino por módulo fica na aba <b>Permissões</b>.</div>
      </div>

      {/* ===== modal usuário ===== */}
      {modal && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="cfg-modal">
            <div className="mh"><h2>{modal.id ? 'Editar usuário' : 'Novo usuário'}</h2><button className="mx" onClick={() => setModal(null)}>✕</button></div>
            <div className="mb">
              <div className="cfg-fg"><label>Nome *</label><input autoFocus value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} /></div>
              <div className="cfg-fg"><label>E-mail *</label><input type="email" value={modal.email} readOnly={!!modal.id} onChange={(e) => setModal({ ...modal, email: e.target.value })} style={modal.id ? { background: '#f1f5f9', color: '#64748b' } : undefined} />{modal.id && <div className="p-hint">O e-mail de acesso não pode ser alterado.</div>}</div>
              <div className="cfg-fg row2">
                <div><label>Perfil *</label><select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
                {modal.role === 'gerente' && <div><label>Loja vinculada</label><select value={modal.lojaId} onChange={(e) => setModal({ ...modal, lojaId: e.target.value })}><option value="">Selecione a loja…</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>}
              </div>
              <div className="cfg-fg"><label>{modal.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *'}</label><input type="password" value={modal.senha} onChange={(e) => setModal({ ...modal, senha: e.target.value })} placeholder={modal.id ? '••••••' : ''} autoComplete="new-password" /></div>
            </div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setModal(null)}>Cancelar</button>
              <button className="cfg-btn pri" disabled={saveMut.isPending} onClick={() => saveMut.mutate(modal)}>{saveMut.isPending ? 'Salvando…' : (modal.id ? 'Salvar alterações' : 'Criar usuário')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== confirmar remoção ===== */}
      {del && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setDel(null) }}>
          <div className="cfg-modal" style={{ width: 'min(400px,94vw)' }}>
            <div className="mh"><h2>Remover usuário</h2><button className="mx" onClick={() => setDel(null)}>✕</button></div>
            <div className="mb"><p style={{ fontSize: 13, color: '#334155' }}>Remover <b>{del.nome}</b>? Ele perde o acesso ao sistema.</p></div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setDel(null)}>Cancelar</button>
              <button className="cfg-btn danger" disabled={delMut.isPending} onClick={() => delMut.mutate(del.id)}>{delMut.isPending ? 'Removendo…' : 'Remover'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
