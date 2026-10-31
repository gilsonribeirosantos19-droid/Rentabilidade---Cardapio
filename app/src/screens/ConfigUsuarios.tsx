import { useMemo, useState } from 'react'
import { useToastErr } from '../lib/toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Configurações › Usuários — CRUD de usuários (tabela `usuarios`) + criação/senha
// via Edge Function `admin-users` (a chave admin fica no servidor).
// Papéis: admin / gerente / operador. Loja vinculada só para gerente.

type Usuario = { id: string; nome?: string; email?: string; role?: string; grupo?: string | null; loja_id?: string | null; lojas_acesso?: string[] | null; sistemas_rede?: string[] | null; ativo?: boolean }
type Loja = { id: string; nome: string }
type Modal = { id?: string; nome: string; email: string; role: string; grupo: string; lojaId: string; lojasAcesso: string[]; senha: string; redes: string[]; redeLojaId: string }

// Login único (Nível 1): os outros sistemas da rede que podem receber o mesmo usuário
const SIS: [string, string][] = [['avaliacoes', 'Avaliações'], ['checklist', 'Checklist'], ['manutencao', 'Manutenção']]
const SIS_LABEL: Record<string, string> = { avaliacoes: 'Avaliações', checklist: 'Checklist', manutencao: 'Manutenção' }

// "operador" removido: só admin (acesso total) e gerente (preso à loja). Enquanto não há
// permissão fina, "operador" caía em acesso ao tenant inteiro (risco). Mantido no ROLE_LABEL
// só p/ exibir eventual usuário legado.
const ROLES = [{ v: 'admin', l: 'Administrador' }, { v: 'supervisor', l: 'Supervisor' }, { v: 'gerente', l: 'Gerente' }, { v: 'operador', l: 'Operador (ERP restrito)' }]
const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', gerente: 'Gerente', operador: 'Operador' }
const roleCls = (r?: string) => (r === 'admin' ? 'role-admin' : r === 'gerente' ? 'role-gerente' : r === 'supervisor' ? 'role-gerente' : 'role-operador')

// chama a Edge Function admin-users; extrai a mensagem de erro do corpo da resposta
async function invokeAdmin(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message || 'Falha ao chamar a função'
    try {
      const ctx = (error as unknown as { context?: Response }).context
      const txt = ctx ? await ctx.text() : ''
      if (txt) { try { const b = JSON.parse(txt); msg = (b?.error && (typeof b.error === 'string' ? b.error : JSON.stringify(b.error))) || txt } catch { msg = txt } }
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (data && (data as { error?: unknown }).error) { const de = (data as { error: unknown }).error; throw new Error(typeof de === 'string' ? de : JSON.stringify(de)) }
  return data
}

export function ConfigUsuarios() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<Modal | null>(null)
  const [del, setDel] = useState<{ id: string; nome: string } | null>(null)
  const [verInativos, setVerInativos] = useState(false)
  const { toast, setToast, showToast } = useToastErr(2600, 7000)

  const { data: usuarios = [], isLoading, error: qErr } = useQuery({
    queryKey: ['cfg-usuarios', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data, error } = await supabase.from('usuarios').select('*').eq('tenant_id', tenantId).order('nome'); if (error) throw error; return (data ?? []) as Usuario[] },
  })
  const { data: lojas = [] } = useQuery({
    queryKey: ['cfg-usr-lojas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] },
  })
  const lojaNome = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const { data: gruposAcesso = [] } = useQuery({
    queryKey: ['cfg-usr-grupos', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('grupos_acesso').select('nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as { nome: string }[] },
  })

  const novo = () => setModal({ nome: '', email: '', role: 'gerente', grupo: '', lojaId: '', lojasAcesso: [], senha: '', redes: [], redeLojaId: '' })
  const editar = (u: Usuario) => setModal({ id: u.id, nome: u.nome ?? '', email: u.email ?? '', role: u.role ?? 'gerente', grupo: u.grupo ?? '', lojaId: u.loja_id ?? '', lojasAcesso: u.lojas_acesso ?? [], senha: '', redes: u.sistemas_rede ?? [], redeLojaId: '' })

  const saveMut = useMutation({
    mutationFn: async (m: Modal) => {
      // e-mail SEMPRE minúsculo: o crachá do "entrar direto" vai em minúsculas e os outros
      // sistemas procuram o e-mail exato (Sushi… ≠ sushi… → caía no login de novo)
      const nome = m.nome.trim(), email = m.email.trim().toLowerCase()
      if (!nome) throw new Error('Informe o nome.')
      if (!email) throw new Error('Informe o e-mail.')
      if (!m.id && !m.senha) throw new Error('Informe a senha inicial.')
      if (!m.id && m.redes.length && !(m.redeLojaId || m.lojaId)) throw new Error('Escolha a loja para os outros sistemas da rede.')
      const lojaId = m.role === 'gerente' ? (m.lojaId || null) : null
      // supervisor: lojas concedidas (vazio = todas). Outros perfis não usam.
      const lojasAcesso = m.role === 'supervisor' && m.lojasAcesso.length ? m.lojasAcesso : null
      const grupo = m.grupo || null   // grupo de permissão (separado da rota/role)
      let redeMsg = ''
      // REGRA: perfil não-admin marcado num sistema = login criado lá como gerente (teto no servidor).
      // Admin fica de fora (não rebaixar admin criado manualmente em cada sistema).
      const provisionar = async (senha: string, lojaRedeId: string) => {
        try {
          // o AIKO nomeia as lojas como "Sushi Centro"; os outros sistemas usam só "Centro".
          // manda sem o prefixo da marca pra casar o nome (comparação lá é sem acento/maiúscula).
          const lojaRede = (lojaNome[lojaRedeId] || '').replace(/^sushi\s+/i, '').trim()
          const { data: pr, error: prErr } = await supabase.functions.invoke('provisionar-rede', { body: { email, nome, senha, papel: m.role, loja: lojaRede, sistemas: m.redes } })
          if (prErr) throw new Error(prErr.message)
          const res = ((pr as { resultados?: { sistema: string; ok: boolean; erro?: string }[] })?.resultados) || []
          return res.map((r) => `${SIS_LABEL[r.sistema] || r.sistema} ${r.ok ? '✅' : '⚠️' + (r.erro ? ' (' + r.erro + ')' : '')}`).join(' · ')
        } catch (e) {
          return 'falha ao criar na rede (' + (e as Error).message + ')'
        }
      }
      if (m.id) {
        // provisiona só quando informar SENHA (o login lá nasce com ela); sem senha = só atualiza o Portal
        const provEdit = m.role !== 'admin' && m.redes.length > 0 && !!m.senha
        if (provEdit && !(m.redeLojaId || m.lojaId)) throw new Error('Escolha a loja para os outros sistemas da rede.')
        // sistemas_rede = quais sistemas aparecem no Portal desta pessoa. Na EDIÇÃO só atualiza a LISTA
        // (não provisiona/mexe em login) — pra não rebaixar admin já criado manualmente em cada sistema.
        const upd: Record<string, unknown> = { nome, role: m.role, grupo, tenant_id: tenantId, loja_id: lojaId, lojas_acesso: lojasAcesso, sistemas_rede: m.redes }
        let r = await supabase.from('usuarios').update(upd).eq('id', m.id)
        if (r.error && /sistemas_rede/i.test(r.error.message)) { delete upd.sistemas_rede; r = await supabase.from('usuarios').update(upd).eq('id', m.id) }
        if (r.error) throw r.error
        if (m.senha) await invokeAdmin({ action: 'update_password', userId: m.id, password: m.senha })
        if (provEdit) redeMsg = await provisionar(m.senha, m.redeLojaId || m.lojaId)
      } else {
        const auth = await invokeAdmin({ action: 'create', email, password: m.senha })
        const userId = auth?.id
        if (!userId) throw new Error('A conta de acesso não retornou um ID.')
        // grava email também (coluna adicionada via SQL); se ainda não existir a coluna, cai no catch e insere sem email
        // sistemas_rede = em quais sistemas da rede a pessoa foi provisionada (o hub usa pra filtrar os cards).
        // sempre gravado (lista vazia = só Estoque no hub); null fica só pros usuários antigos (= vê todos).
        const base: Record<string, unknown> = { id: userId, nome, role: m.role, grupo, tenant_id: tenantId, loja_id: lojaId, lojas_acesso: lojasAcesso, ativo: true, sistemas_rede: m.redes }
        let ins = await supabase.from('usuarios').insert({ ...base, email })
        if (ins.error && /sistemas_rede/i.test(ins.error.message)) { delete base.sistemas_rede; ins = await supabase.from('usuarios').insert({ ...base, email }) }
        if (ins.error && /email/i.test(ins.error.message)) ins = await supabase.from('usuarios').insert(base)
        if (ins.error) throw ins.error
        // Login único (Nível 1): cria o MESMO usuário nos outros sistemas marcados (via Edge provisionar-rede).
        // Aditivo: se algum sistema falhar, o usuário do AIKO já está criado — só reporta no toast.
        if (m.redes.length) redeMsg = await provisionar(m.senha, m.redeLojaId || m.lojaId)
      }
      return { redeMsg }
    },
    onSuccess: (data, m) => {
      qc.invalidateQueries({ queryKey: ['cfg-usuarios'] }); setModal(null)
      const base = m.id ? 'Usuário atualizado.' : 'Usuário criado.'
      const rm = (data as { redeMsg?: string })?.redeMsg
      showToast(rm ? base + ' Rede → ' + rm : base, !!rm && rm.includes('⚠️'))
    },
    onError: (e: Error) => { console.error('[ConfigUsuarios]', e); showToast('Erro: ' + e.message, true) },
  })
  const delMut = useMutation({
    // exclui perfil + login; se o usuário tiver histórico (ex.: pedidos), o servidor DESATIVA e bloqueia o acesso
    mutationFn: async (id: string) => await invokeAdmin({ action: 'delete', userId: id }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['cfg-usuarios'] }); setDel(null); showToast((r as { soft?: boolean })?.soft ? 'Acesso bloqueado — o usuário tinha histórico, então foi desativado (registros mantidos).' : 'Usuário removido.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })
  const reativarMut = useMutation({
    mutationFn: async (id: string) => await invokeAdmin({ action: 'reactivate', userId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-usuarios'] }); showToast('Usuário reativado.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const renderCard = (u: Usuario, inativo: boolean) => (
    <div className="usr-card" key={u.id} style={inativo ? { opacity: 0.55 } : undefined}>
      <div className="usr-avatar">{(u.nome || '?')[0].toUpperCase()}</div>
      <div className="usr-info">
        <div className="usr-nome">{u.nome || '—'}{inativo ? ' · inativo' : ''}</div>
        <div className="usr-email">{u.email || '—'}{u.role === 'gerente' && u.loja_id ? ` · ${lojaNome[u.loja_id] || 'loja'}` : ''}</div>
      </div>
      <span className={'role-badge ' + roleCls(u.role)}>{ROLE_LABEL[u.role || ''] || u.role || '—'}</span>
      <div className="usr-acts">
        {inativo
          ? <button className="cfg-btn" style={{ height: 30 }} disabled={reativarMut.isPending} onClick={() => reativarMut.mutate(u.id)}>Reativar</button>
          : <>
              <button className="cfg-btn" style={{ height: 30 }} onClick={() => editar(u)}>Editar</button>
              <button className="cfg-btn danger" style={{ height: 30 }} onClick={() => setDel({ id: u.id, nome: u.nome ?? '' })}>Remover</button>
            </>}
      </div>
    </div>
  )

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
            : (() => {
              const ativos = usuarios.filter((u) => u.ativo !== false)
              const inativos = usuarios.filter((u) => u.ativo === false)
              return <>
                {ativos.map((u) => renderCard(u, false))}
                {inativos.length > 0 && (
                  <button className="cfg-btn" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setVerInativos((v) => !v)}>
                    {verInativos ? 'Ocultar' : 'Mostrar'} inativos ({inativos.length})
                  </button>
                )}
                {verInativos && inativos.map((u) => renderCard(u, true))}
              </>
            })()}
      </div>

      <div className="info-card">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <div>O <b>perfil</b> define PARA ONDE a pessoa entra: <b>Administrador</b> (ERP completo), <b>Supervisor</b> (Portal de várias lojas), <b>Gerente</b> (Portal de uma loja) e <b>Operador</b> (ERP restrito ao grupo de permissão). O <b>grupo de permissão</b> define O QUE ela vê/edita dentro — monte os grupos em Permissões.</div>
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
              {modal.role === 'supervisor' && (
                <div className="cfg-fg"><label>Lojas que ele acessa <span style={{ fontWeight: 400, color: '#64748b' }}>(nenhuma marcada = todas as lojas)</span></label>
                  <div className="usr-lojas">
                    {lojas.length === 0 ? <span style={{ fontSize: 12, color: '#94a3b8', padding: 8 }}>Nenhuma loja cadastrada.</span>
                      : lojas.map((l) => (
                        <label key={l.id}>
                          <input type="checkbox" checked={modal.lojasAcesso.includes(l.id)} onChange={(e) => setModal({ ...modal, lojasAcesso: e.target.checked ? [...modal.lojasAcesso, l.id] : modal.lojasAcesso.filter((x) => x !== l.id) })} />
                          {l.nome}
                        </label>
                      ))}
                  </div>
                </div>
              )}
              <div className="cfg-fg"><label>Grupo de permissão <span style={{ fontWeight: 400, color: '#64748b' }}>(o que ele pode ver/editar — configure em Permissões)</span></label>
                <select value={modal.grupo} onChange={(e) => setModal({ ...modal, grupo: e.target.value })}>
                  <option value="">Sem restrição (acesso completo do perfil)</option>
                  {gruposAcesso.map((g) => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
                </select>
              </div>
              <div className="cfg-fg"><label>{modal.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *'}</label><input type="password" value={modal.senha} onChange={(e) => setModal({ ...modal, senha: e.target.value })} placeholder={modal.id ? '••••••' : ''} autoComplete="new-password" /></div>

              <div className="cfg-fg" style={{ borderTop: '1px solid #eef2f7', paddingTop: 12, marginTop: 4 }}>
                <label>{modal.id ? 'Acesso aos sistemas ' : 'Também criar acesso em '}<span style={{ fontWeight: 400, color: '#64748b' }}>{modal.id ? '(quais sistemas aparecem no Portal desta pessoa)' : '(login único — cria o mesmo usuário, com a mesma senha, nos sistemas marcados)'}</span></label>
                <div className="usr-lojas">
                  {SIS.map(([k, l]) => (
                    <label key={k}>
                      <input type="checkbox" checked={modal.redes.includes(k)} onChange={(e) => setModal({ ...modal, redes: e.target.checked ? [...modal.redes, k] : modal.redes.filter((x) => x !== k) })} />
                      {l}
                    </label>
                  ))}
                </div>
                {(!modal.id || modal.role !== 'admin') && modal.redes.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <label>Loja nos outros sistemas *</label>
                    <select value={modal.redeLojaId || modal.lojaId} onChange={(e) => setModal({ ...modal, redeLojaId: e.target.value })}>
                      <option value="">Selecione a loja…</option>
                      {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                    <div className="p-hint">Nos outros sistemas a pessoa é criada como <b>gerente</b> da loja escolhida (papéis mais altos só na criação manual de cada sistema). A senha nasce provisória lá.</div>
                  </div>
                )}
                {modal.id && modal.role !== 'admin' && (
                  <div className="p-hint" style={{ marginTop: 8 }}>Pra <b>criar o login</b> nos sistemas marcados (como gerente), informe uma <b>nova senha</b> acima — ela passa a valer no AIKO e lá. Sem senha, só muda o que aparece no Portal.</div>
                )}
                {modal.id && modal.role === 'admin' && (
                  <div className="p-hint" style={{ marginTop: 8 }}>Administrador: marca só o que aparece no <b>Portal</b>. O login de admin em cada sistema é criado lá dentro.</div>
                )}
              </div>
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
