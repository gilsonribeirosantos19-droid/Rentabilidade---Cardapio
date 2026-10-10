import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useToastTipo } from '../lib/toast'

// Classificação de itens → conta gerencial (Fase 2 do DRE). Define `insumos.conta_gerencial_id`.
// Salva ao trocar o dropdown; tem aplicação em massa e um "auto por categoria/nome".

type Conta = { id: string; codigo: string; nome: string; grupo: string; parent_codigo?: string | null; ordem?: number }
type Insumo = { id: string; nome?: string; categoria?: string | null; conta_gerencial_id?: string | null; ativo?: boolean }

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function DreClassificar() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastTipo(2400)
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState('')
  const [fConta, setFConta] = useState('')          // '', 'sem', ou id da conta
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkConta, setBulkConta] = useState('')

  const { data: contas = [] } = useQuery({
    queryKey: ['dre-contas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('ordem'); return (data ?? []) as Conta[] },
  })
  const { data: insumos = [], isLoading } = useQuery({
    queryKey: ['dre-classif', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,conta_gerencial_id,ativo').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)),
  })

  // contas folha = onde insumos caem (as que não são "pai" de nenhuma outra) = as contas analíticas
  const folhas = useMemo(() => { const pais = new Set(contas.map((c) => c.parent_codigo).filter(Boolean)); return contas.filter((c) => !pais.has(c.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })) }, [contas])
  const rotuloConta = (c: Conta) => `${c.codigo} · ${c.nome}`

  const categorias = useMemo(() => [...new Set(insumos.map((i) => i.categoria).filter(Boolean) as string[])].sort(), [insumos])

  const lista = useMemo(() => {
    const q = norm(busca.trim())
    return insumos.filter((i) => {
      if (q && !norm(i.nome || '').includes(q)) return false
      if (fCat && (i.categoria || '') !== fCat) return false
      if (fConta === 'sem') { if (i.conta_gerencial_id) return false }
      else if (fConta) { if (i.conta_gerencial_id !== fConta) return false }
      return true
    })
  }, [insumos, busca, fCat, fConta])

  const saveMut = useMutation({
    mutationFn: async ({ ids, contaId }: { ids: string[]; contaId: string | null }) => {
      const { error } = await supabase.from('insumos').update({ conta_gerencial_id: contaId }).in('id', ids); if (error) throw error
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['dre-classif'] }); qc.invalidateQueries({ queryKey: ['dre-insumos'] }); showToast(v.ids.length > 1 ? `${v.ids.length} itens classificados.` : 'Item classificado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const setConta = (id: string, contaId: string) => saveMut.mutate({ ids: [id], contaId: contaId || null })
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = lista.length > 0 && lista.every((i) => sel.has(i.id))
  const toggleAll = () => setSel(allSel ? new Set() : new Set(lista.map((i) => i.id)))

  const aplicarBulk = () => { if (!sel.size || !bulkConta) return; saveMut.mutate({ ids: [...sel], contaId: bulkConta }); setSel(new Set()) }

  // Auto: casa cada item SEM conta com a conta cujo nome aparece no nome do item
  // (ex.: "Salmão Fresco kg" → conta "Salmão"; "Gás P13" → conta "Gás"). Pega o nome mais específico.
  const auto = () => {
    const semConta = insumos.filter((i) => !i.conta_gerencial_id)
    if (!semConta.length) { showToast('Todos os itens já têm conta.', 'ok'); return }
    const porConta: Record<string, string[]> = {}
    let casados = 0
    semConta.forEach((i) => {
      const nome = norm(i.nome || '')
      let best: Conta | null = null, len = 0
      folhas.forEach((c) => { const cn = norm(c.nome); if (cn.length >= 3 && nome.includes(cn) && cn.length > len) { best = c; len = cn.length } })
      if (best) { const b = best as Conta; (porConta[b.id] = porConta[b.id] || []).push(i.id); casados++ }
    })
    if (!casados) { showToast('Nenhum item casou pelo nome — classifique manualmente.', 'err'); return }
    if (!confirm(`Casei ${casados} de ${semConta.length} itens sem conta pelo nome (ex.: "Salmão Fresco" → Salmão).\nAplicar? Os demais e os já classificados não são tocados — você revisa o resto.`)) return
    Promise.all(Object.entries(porConta).map(([contaId, ids]) => supabase.from('insumos').update({ conta_gerencial_id: contaId }).in('id', ids)))
      .then(() => { qc.invalidateQueries({ queryKey: ['dre-classif'] }); qc.invalidateQueries({ queryKey: ['dre-insumos'] }); showToast(`${casados} itens classificados. Revise os que sobraram.`, 'ok') })
      .catch((e) => showToast(e.message, 'err'))
  }

  const semConta = insumos.filter((i) => !i.conta_gerencial_id).length

  return (
    <>
      <div className="dre-bar">
        <div className="dre-fld" style={{ flex: 1, minWidth: 180 }}><label>Buscar item</label>
          <input className="dcl-inp" placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="dre-fld"><label>Grupo (categoria)</label>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todos</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div className="dre-fld"><label>Conta</label>
          <select value={fConta} onChange={(e) => setFConta(e.target.value)}>
            <option value="">Todas</option><option value="sem">⚠ Sem conta ({semConta})</option>
            {folhas.map((c) => <option key={c.id} value={c.id}>{rotuloConta(c)}</option>)}
          </select>
        </div>
        <div className="dre-grow" />
        <div className="dre-fld"><label>&nbsp;</label><button className="dcl-btn" onClick={auto}>✨ Auto pelo nome</button></div>
      </div>

      {sel.size > 0 && (
        <div className="dcl-bulk">
          <b>{sel.size}</b> selecionado(s) → aplicar conta:
          <select value={bulkConta} onChange={(e) => setBulkConta(e.target.value)}><option value="">Escolha a conta…</option>{folhas.map((c) => <option key={c.id} value={c.id}>{rotuloConta(c)}</option>)}</select>
          <button className="dcl-btn pri" disabled={!bulkConta} onClick={aplicarBulk}>Aplicar</button>
          <button className="dcl-btn" onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>
      )}

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Classificar itens em contas</div><div className="s">defina em que conta do DRE cada item entra — salva na hora</div></div>
          <div className="dre-hint">{lista.length} itens</div>
        </div>
        <div className="dre-scroll">
          <table className="dre dcl">
            <thead><tr>
              <th className="l dcl-chk"><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
              <th className="l">Item</th><th className="l">Grupo (categoria)</th><th className="l" style={{ width: 280 }}>Conta gerencial</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className="dre-empty">Carregando…</td></tr>
                : lista.length === 0 ? <tr><td colSpan={4} className="dre-empty">Nenhum item.</td></tr>
                : lista.map((i) => (
                  <tr key={i.id} className={sel.has(i.id) ? 'dcl-on' : ''}>
                    <td className="l dcl-chk"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                    <td className="l" style={{ fontWeight: 500 }}>{i.nome}</td>
                    <td className="l" style={{ color: '#94a3c4', fontSize: 12 }}>{i.categoria || '—'}</td>
                    <td className="l">
                      <select className={'dcl-sel' + (i.conta_gerencial_id ? '' : ' vazio')} value={i.conta_gerencial_id || ''} onChange={(e) => setConta(i.id, e.target.value)}>
                        <option value="">— sem conta (vai p/ Custos) —</option>
                        {folhas.map((c) => <option key={c.id} value={c.id}>{rotuloConta(c)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
