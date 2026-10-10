import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useToastTipo } from '../lib/toast'

// Plano de Contas gerencial (Fase 2 do DRE): o dono cria/renomeia/inativa as CONTAS
// analíticas (Salmão, Fardamento…) dentro dos grupos (2.1 / 4.1 / 4.2 / 6.3), sem SQL.

type Conta = { id: string; codigo: string; nome: string; grupo: string; parent_codigo?: string | null; ativo?: boolean }
const GRUPO_LBL: Record<string, string> = { custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' }
const segs = (cod: string) => cod.split('.').length

export function DrePlanoContas() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastTipo(2600)
  const [novoPai, setNovoPai] = useState('')
  const [novoNome, setNovoNome] = useState('')

  const { data: contas = [], isLoading } = useQuery({
    queryKey: ['dre-contas-full', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).order('codigo'); return (data ?? []) as Conta[] },
  })

  // grupos que recebem contas (folhas de agrupamento): ≤2 segmentos e sem subgrupo
  const paisPossiveis = useMemo(() => {
    const temSub = (cod: string) => contas.some((c) => c.parent_codigo === cod && segs(c.codigo) <= 2)
    return contas.filter((c) => segs(c.codigo) <= 2 && !temSub(c.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  }, [contas])
  const analiticasDe = (paiCod: string) => contas.filter((c) => c.parent_codigo === paiCod && segs(c.codigo) >= 3).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['dre-contas-full'] }); qc.invalidateQueries({ queryKey: ['dre-contas'] }) }

  const criarMut = useMutation({
    mutationFn: async () => {
      const nome = novoNome.trim(); if (!novoPai) throw new Error('Escolha o grupo.'); if (!nome) throw new Error('Informe o nome da conta.')
      const pai = contas.find((c) => c.codigo === novoPai)!; const irmas = analiticasDe(novoPai)
      const maxN = irmas.reduce((m, c) => Math.max(m, parseInt(c.codigo.split('.').pop() || '0', 10) || 0), 0)
      const codigo = `${novoPai}.${String(maxN + 1).padStart(2, '0')}`
      const { error } = await supabase.from('contas_gerenciais').insert({ tenant_id: tenantId, codigo, nome, grupo: pai.grupo, parent_codigo: novoPai, ordem: maxN + 1 }); if (error) throw error
    },
    onSuccess: () => { invalidar(); setNovoNome(''); showToast('Conta criada.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const renomearMut = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => { const { error } = await supabase.from('contas_gerenciais').update({ nome }).eq('id', id); if (error) throw error },
    onSuccess: () => { invalidar(); showToast('Conta renomeada.', 'ok') }, onError: (e: Error) => showToast(e.message, 'err'),
  })
  const inativarMut = useMutation({
    mutationFn: async (c: Conta) => { const { error } = await supabase.from('contas_gerenciais').update({ ativo: !(c.ativo !== false) }).eq('id', c.id); if (error) throw error },
    onSuccess: () => { invalidar(); showToast('Conta atualizada.', 'ok') }, onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <div className="dre-screen">
      <div className="dre-card" style={{ marginBottom: 14 }}>
        <div className="dre-ch"><div><div className="t">Nova conta</div><div className="s">crie uma conta analítica (ex.: Tilápia, Fardamento…) dentro de um grupo</div></div></div>
        <div className="dlc-form">
          <div className="dre-fld" style={{ flex: 1, minWidth: 220 }}><label>Grupo</label>
            <select value={novoPai} onChange={(e) => setNovoPai(e.target.value)}><option value="">Escolha o grupo…</option>{paisPossiveis.map((p) => <option key={p.id} value={p.codigo}>{p.codigo} · {p.nome} ({GRUPO_LBL[p.grupo] || p.grupo})</option>)}</select>
          </div>
          <div className="dre-fld" style={{ flex: 1, minWidth: 220 }}><label>Nome da conta</label><input className="dcl-inp" placeholder="Ex.: Material de Expediente" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criarMut.mutate() }} /></div>
          <div className="dre-fld"><label>&nbsp;</label><button className="dcl-btn pri" disabled={criarMut.isPending} onClick={() => criarMut.mutate()}>＋ Criar conta</button></div>
        </div>
      </div>

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Plano de contas</div><div className="s">grupos e suas contas</div></div><div className="dre-grow" /><div className="dre-hint">{contas.length} contas</div></div>
        {isLoading ? <div className="dre-empty">Carregando…</div> : paisPossiveis.length === 0 ? <div className="dre-empty">Nenhum grupo. Rode os SQL de fundação do DRE.</div> : (
          <div style={{ padding: '6px 0 10px' }}>
            {paisPossiveis.map((p) => {
              const itens = analiticasDe(p.codigo)
              return (
                <div key={p.id} className="pc-grp">
                  <div className="pc-grp-h"><span className="dre-cod">{p.codigo}</span>{p.nome} <span className="pc-tag">{GRUPO_LBL[p.grupo] || p.grupo}</span></div>
                  {itens.length === 0 ? <div className="pc-vazio">nenhuma conta aqui ainda</div>
                    : itens.map((c) => (
                      <div key={c.id} className={'pc-row' + (c.ativo === false ? ' off' : '')}>
                        <span className="dre-cod">{c.codigo}</span>
                        <span className="pc-nome">{c.nome}{c.ativo === false && <em> (inativa)</em>}</span>
                        <div className="pc-acts">
                          <button className="pc-mini" onClick={() => { const n = prompt('Novo nome da conta:', c.nome); if (n && n.trim() && n.trim() !== c.nome) renomearMut.mutate({ id: c.id, nome: n.trim() }) }}>✎ Renomear</button>
                          <button className="pc-mini" onClick={() => inativarMut.mutate(c)}>{c.ativo === false ? '↺ Reativar' : '🚫 Inativar'}</button>
                        </div>
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
