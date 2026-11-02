import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { normGrupo } from '../lib/rodizio'
import { useRodizioMapa } from '../lib/useRodizioMapa'
import { ligarRodizio } from '../lib/impactoMargem'
import './impacto.css'

// Cadastros › Rodízios — liga cada RODÍZIO vendido (cabeça com preço, sem ficha) ao GRUPO DE LANÇAMENTO
// dos itens dele (itens a R$0 com ficha). Assim a Engenharia de Cardápio e o Impacto na Margem
// calculam o custo/CMV de cada rodízio = itens do grupo ÷ rodízios vendidos (sem peso).
// Já vem SUGERIDO pelo nome; o usuário confere e salva. "Não é rodízio" = para de sugerir.

type V = { produto_id: string; produto_nome?: string; grupo?: string; qtd?: number; faturado?: number }
const NAO = '__nao__'
const titleCase = (s: string) => (s || '').toLowerCase().replace(/(^|[\s\-/(])(\S)/g, (_m, p, c) => p + (c as string).toUpperCase())
const ehRod = (s: string) => /rod[ií]zio/i.test(s)

export function Rodizios() {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('rodizios')
  const qc = useQueryClient()
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const { data: mapa = new Map() } = useRodizioMapa(tenantId)

  // vendas dos últimos 90 dias, somadas por produto (RPC paginada; portão 'processado')
  const fim = new Date().toLocaleDateString('en-CA'), ini = new Date(Date.now() - 90 * 86400000).toLocaleDateString('en-CA')
  const { data: vendas = [], isLoading, error } = useQuery({
    queryKey: ['rod-vendas', tenantId, ini], enabled: !!tenantId,
    queryFn: () => fetchAll<V>((f, t) => supabase.rpc('vendas_produto_periodo', { p_ini: ini, p_fim: fim }).order('produto_id').order('loja_id').range(f, t)),
  })

  const { cabecas, grupos } = useMemo(() => {
    const agg = new Map<string, { cod: string; nome: string; grupo: string; qtd: number; fat: number }>()
    for (const v of vendas) {
      const cod = String(v.produto_id).trim(); const a = agg.get(cod) || { cod, nome: v.produto_nome || cod, grupo: v.grupo || '', qtd: 0, fat: 0 }
      a.qtd += +(v.qtd || 0); a.fat += +(v.faturado || 0); agg.set(cod, a)
    }
    const all = [...agg.values()]
    // grupos com itens a R$0 (onde o garçom lança o que sai dentro do rodízio) — os de "rodízio" primeiro
    const gq = new Map<string, number>()
    all.filter((a) => a.fat <= 0 && a.qtd > 0).forEach((a) => { const g = normGrupo(a.grupo); if (g) gq.set(g, (gq.get(g) || 0) + a.qtd) })
    const grupos = [...gq.entries()].sort((x, y) => (ehRod(y[0]) ? 1 : 0) - (ehRod(x[0]) ? 1 : 0) || y[1] - x[1]).map(([g]) => g)
    const cabecas = all.filter((a) => a.fat > 0 && (ehRod(a.nome + ' ' + a.grupo) || mapa.has(a.cod))).sort((x, y) => y.fat - x.fat)
    return { cabecas, grupos }
  }, [vendas, mapa])

  const valor = (c: { cod: string; nome: string; grupo: string }) => {
    if (c.cod in edit) return edit[c.cod]
    if (mapa.has(c.cod)) return mapa.get(c.cod) === '' ? NAO : mapa.get(c.cod)
    return ligarRodizio(c.nome, c.grupo, grupos) ?? ''
  }
  const situacao = (c: { cod: string }) => c.cod in edit ? 'alterado' : mapa.has(c.cod) ? 'salvo' : 'sugerido'

  const salvar = useMutation({
    mutationFn: async () => {
      const rows = cabecas.map((c) => ({ c, v: valor(c) })).filter(({ c, v }) => v && (c.cod in edit || !mapa.has(c.cod)))
        .map(({ c, v }) => ({ tenant_id: tenantId, cabeca_codigo: c.cod, cabeca_nome: titleCase(c.nome), grupo: v === NAO ? '' : v, atualizado_em: new Date().toISOString() }))
      if (!rows.length) throw new Error('Nada para salvar.')
      const { error } = await supabase.from('rodizio_grupos').upsert(rows, { onConflict: 'tenant_id,cabeca_codigo' })
      if (error) throw error
      return rows.length
    },
    onSuccess: (n) => { setEdit({}); setMsg(`✓ ${n} rodízio(s) salvos.`); qc.invalidateQueries({ queryKey: ['rodizio-mapa'] }) },
    onError: (e: Error) => setMsg('Erro: ' + (/rodizio_grupos/.test(e.message) ? 'rode o SQL sql_avulso/rodizio_grupos.sql antes.' : e.message)),
  })
  const pendentes = cabecas.filter((c) => situacao(c) !== 'salvo' && valor(c)).length

  return (
    <div className="imp-screen">
      <div className="imp-filters">
        <div style={{ fontSize: 13, color: 'var(--n-600)', lineHeight: 1.5, maxWidth: 820 }}>
          Ligue cada <b>rodízio</b> ao <b>grupo de lançamento</b> dos itens dele. O custo do rodízio passa a ser
          <b> tudo o que foi lançado nos itens do grupo ÷ quantidade de rodízios</b> — e aparece na Engenharia de Cardápio e no Impacto na Margem.
          As linhas já vêm <b>sugeridas</b> pelo nome: confira e clique em Salvar.
        </div>
        {canEdit && <button className="imp-btn" style={{ marginLeft: 'auto', background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }} disabled={salvar.isPending || !pendentes} onClick={() => salvar.mutate()}>
          {salvar.isPending ? 'Salvando…' : `Salvar ${pendentes ? `(${pendentes})` : ''}`}</button>}
      </div>
      {msg && <div className="imp-empty" style={{ padding: 10, textAlign: 'left', color: msg.startsWith('Erro') ? 'var(--danger)' : 'var(--ok)' }}>{msg}</div>}
      <div className="imp-card">
        <h2>Rodízios vendidos <span className="hint">últimos 90 dias</span></h2>
        <div className="imp-scroll tall">
          <table className="imp-tbl">
            <thead><tr><th>Código</th><th>Rodízio</th><th className="r">Vendidos</th><th className="r">Faturado</th><th>Grupo de lançamento dos itens</th><th>Situação</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="imp-empty">Carregando vendas…</td></tr>
                : error ? <tr><td colSpan={6} className="imp-empty">Erro ao carregar vendas: {(error as Error).message}</td></tr>
                : cabecas.length === 0 ? <tr><td colSpan={6} className="imp-empty">Nenhum rodízio vendido nos últimos 90 dias.</td></tr>
                : cabecas.map((c) => {
                  const v = valor(c), s = situacao(c)
                  return (
                    <tr key={c.cod}>
                      <td className="muted">{c.cod}</td>
                      <td>{titleCase(c.nome)}</td>
                      <td className="r">{Math.round(c.qtd).toLocaleString('pt-BR')}</td>
                      <td className="r">R$ {Math.round(c.fat).toLocaleString('pt-BR')}</td>
                      <td>
                        <select className="imp-field" style={{ minWidth: 240 }} value={v} disabled={!canEdit}
                          onChange={(e) => setEdit((x) => ({ ...x, [c.cod]: e.target.value }))}>
                          <option value="">— escolha o grupo —</option>
                          {grupos.map((g) => <option key={g} value={g}>{titleCase(g)}</option>)}
                          <option value={NAO}>✕ Não é rodízio</option>
                        </select>
                      </td>
                      <td>{s === 'salvo' ? <span className="imp-pill dn">salvo</span> : s === 'alterado' ? <span className="imp-pill up">alterado</span> : v ? <span className="imp-pill eq">sugerido</span> : <span className="muted">—</span>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="imp-note">Variações (Aniversário, Boomerang, Dia do Sushi…) e infantil usam o <b>mesmo grupo</b> do rodízio principal — sem peso: o custo vem do que foi lançado. “Não é rodízio” tira a linha do cálculo e para de sugerir.</div>
      </div>
    </div>
  )
}
