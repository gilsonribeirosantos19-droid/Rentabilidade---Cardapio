import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Produção › Setor de Produção — cadastro simples (áreas onde a produção acontece).
type Setor = { id: string; nome?: string; responsavel?: string; ativo?: boolean }
type Modal = { id?: string; nome: string; responsavel: string; ativo: boolean }

export function SetorProducao() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<Modal | null>(null)
  const [del, setDel] = useState<{ id: string; nome: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 2600) }

  const { data: setores = [], isLoading, error: qErr } = useQuery({
    queryKey: ['setores', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data, error } = await supabase.from('setores_producao').select('*').eq('tenant_id', tenantId).order('nome'); if (error) throw error; return (data ?? []) as Setor[] },
  })

  const saveMut = useMutation({
    mutationFn: async (m: Modal) => {
      const nome = m.nome.trim(); if (!nome) throw new Error('Informe o nome do setor.')
      const body = { nome, responsavel: m.responsavel.trim() || null, ativo: m.ativo }
      if (m.id) { const { error } = await supabase.from('setores_producao').update(body).eq('id', m.id); if (error) throw error }
      else { const { error } = await supabase.from('setores_producao').insert({ ...body, tenant_id: tenantId }); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['setores'] }); setModal(null); showToast('Setor salvo.') },
    onError: (e: Error) => { console.error('[SetorProducao]', e); showToast('Erro: ' + e.message, true) },
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('setores_producao').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['setores'] }); setDel(null); showToast('Setor excluído.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">Áreas onde a produção acontece (Sushi Bar, Peixaria, Cozinha Quente…). Organizam o planejamento e as ordens.</div>
        <button className="cfg-btn pri" onClick={() => setModal({ nome: '', responsavel: '', ativo: true })}>+ Novo setor</button>
      </div>

      <div className="cfg-card">
        {isLoading ? <div className="empty">Carregando…</div>
          : qErr ? <div className="empty" style={{ color: '#b91c1c' }}>Erro ao carregar: {(qErr as Error).message}</div>
            : setores.length === 0 ? <div className="empty">Nenhum setor cadastrado. Clique em “+ Novo setor”.</div>
              : (
                <table>
                  <thead><tr><th>Setor</th><th>Responsável</th><th className="c">Situação</th><th className="r">Ações</th></tr></thead>
                  <tbody>
                    {setores.map((s) => (
                      <tr key={s.id}>
                        <td>{s.nome}</td>
                        <td className="muted">{s.responsavel || '—'}</td>
                        <td className="c"><span style={{ color: s.ativo !== false ? '#166534' : '#94a3b8', fontWeight: 600, fontSize: 11.5 }}>{s.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                        <td className="r">
                          <button className="act" onClick={() => setModal({ id: s.id, nome: s.nome || '', responsavel: s.responsavel || '', ativo: s.ativo !== false })}>Editar</button>
                          <button className="act del" onClick={() => setDel({ id: s.id, nome: s.nome || '' })}>Excluir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>

      {modal && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="cfg-modal">
            <div className="mh"><h2>{modal.id ? 'Editar setor' : 'Novo setor'}</h2><button className="mx" onClick={() => setModal(null)}>✕</button></div>
            <div className="mb">
              <div className="cfg-fg"><label>Nome *</label><input autoFocus value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveMut.mutate(modal) }} /></div>
              <div className="cfg-fg"><label>Responsável</label><input value={modal.responsavel} onChange={(e) => setModal({ ...modal, responsavel: e.target.value })} placeholder="ex: Sushiman chefe" /></div>
              <div className="cfg-fg"><label>Situação</label><select value={modal.ativo ? '1' : '0'} onChange={(e) => setModal({ ...modal, ativo: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></div>
            </div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setModal(null)}>Cancelar</button>
              <button className="cfg-btn pri" disabled={saveMut.isPending} onClick={() => saveMut.mutate(modal)}>{saveMut.isPending ? 'Salvando…' : (modal.id ? 'Salvar alterações' : 'Salvar')}</button>
            </div>
          </div>
        </div>
      )}

      {del && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setDel(null) }}>
          <div className="cfg-modal" style={{ width: 'min(400px,94vw)' }}>
            <div className="mh"><h2>Excluir setor</h2><button className="mx" onClick={() => setDel(null)}>✕</button></div>
            <div className="mb"><p style={{ fontSize: 13, color: '#334155' }}>Excluir <b>{del.nome}</b>?</p></div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setDel(null)}>Cancelar</button>
              <button className="cfg-btn danger" disabled={delMut.isPending} onClick={() => delMut.mutate(del.id)}>{delMut.isPending ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
