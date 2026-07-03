import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useItensProduziveis } from '../lib/pcp'
import { SearchSelect } from '../components/SearchSelect'
import './config.css'

// Produção › Cadastros › Atividades — etapas/checklist por item produzível.
// Opcional; útil pra padronizar o preparo. Aparecem como checklist na ordem.

type Ativ = { id?: string; descricao: string; tempo: string }
const num = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0

export function AtividadesProducao() {
  const { tenantId } = useAuth()
  const { itens } = useItensProduziveis()
  const [insumoId, setInsumoId] = useState('')
  const [linhas, setLinhas] = useState<Ativ[]>([])
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 5000 : 2200) }

  const itemSel = itens.find((i) => i.insumoId === insumoId)

  const { data: ativs = [] } = useQuery({ queryKey: ['ativ-prod', tenantId, insumoId], enabled: !!tenantId && !!insumoId, queryFn: async () => { const { data } = await supabase.from('atividades_producao').select('id,descricao,tempo_min,ordem').eq('tenant_id', tenantId).eq('insumo_id', insumoId).order('ordem'); return (data ?? []) as { id: string; descricao?: string; tempo_min?: number; ordem?: number }[] } })
  useEffect(() => { setLinhas(ativs.map((a) => ({ id: a.id, descricao: a.descricao || '', tempo: a.tempo_min != null ? String(a.tempo_min) : '' }))) }, [ativs])

  const add = () => setLinhas((ls) => [...ls, { descricao: '', tempo: '' }])
  const set = (i: number, patch: Partial<Ativ>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const del = (i: number) => setLinhas((ls) => ls.filter((_, j) => j !== i))

  const salvar = async () => {
    if (!insumoId) { showToast('Selecione o item.', true); return }
    await supabase.from('atividades_producao').delete().eq('tenant_id', tenantId).eq('insumo_id', insumoId)
    const rows = linhas.filter((l) => l.descricao.trim()).map((l, i) => ({ tenant_id: tenantId, insumo_id: insumoId, ordem: i + 1, descricao: l.descricao.trim(), tempo_min: l.tempo ? num(l.tempo) : null }))
    if (rows.length) { const { error } = await supabase.from('atividades_producao').insert(rows); if (error) { showToast('Erro: ' + error.message, true); return } }
    showToast('Atividades salvas.')
  }

  const inp: React.CSSProperties = { width: '100%', height: 30, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontSize: 12.5 }

  return (
    <div className="cfg-screen">
      <div className="usr-top"><div className="t">As etapas de cada produção (opcional) — padroniza o preparo e treina a equipe. Aparecem como checklist na ordem.</div></div>

      <div className="cfg-card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="cfg-fg" style={{ marginBottom: 0, maxWidth: 420 }}><label>Item produzível</label>
          <SearchSelect value={itemSel?.nome || ''} options={itens.map((i) => i.nome)} placeholder="Selecione…" onChange={(nm) => setInsumoId(itens.find((i) => i.nome === nm)?.insumoId || '')} />
        </div>
      </div>

      {insumoId && (
        <div className="cfg-card" style={{ maxWidth: 720 }}>
          <div className="card-h"><span>Atividades — {itemSel?.nome}</span><button className="cfg-btn" style={{ height: 28 }} onClick={add}>+ Nova</button></div>
          <table>
            <thead><tr><th className="c" style={{ width: 60 }}>Ordem</th><th>Atividade</th><th className="r" style={{ width: 120 }}>Tempo (min)</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {!linhas.length ? <tr><td colSpan={4} className="empty">Nenhuma atividade. Clique em “+ Nova”.</td></tr>
                : linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="c mono muted">{i + 1}</td>
                    <td><input value={l.descricao} onChange={(e) => set(i, { descricao: e.target.value })} placeholder="Descreva a etapa…" style={inp} /></td>
                    <td className="r"><input value={l.tempo} onChange={(e) => set(i, { tempo: e.target.value })} placeholder="—" style={{ ...inp, textAlign: 'right', fontFamily: 'DM Mono, monospace' }} /></td>
                    <td className="c"><button onClick={() => del(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }} title="Remover">×</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end' }}><button className="cfg-btn pri" onClick={salvar}>Salvar atividades</button></div>
        </div>
      )}

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
