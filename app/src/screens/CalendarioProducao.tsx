import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useItensProduziveis } from '../lib/pcp'
import './config.css'

// Produção › Cadastros › Calendário de Produção — por item produzível, marca
// em quais dias da semana se produz. Alimenta a sugestão do Planejamento.

type Cal = { insumo_id: string; seg: boolean; ter: boolean; qua: boolean; qui: boolean; sex: boolean; sab: boolean; dom: boolean }
const DIAS: { k: keyof Omit<Cal, 'insumo_id'>; l: string }[] = [{ k: 'seg', l: 'Seg' }, { k: 'ter', l: 'Ter' }, { k: 'qua', l: 'Qua' }, { k: 'qui', l: 'Qui' }, { k: 'sex', l: 'Sex' }, { k: 'sab', l: 'Sáb' }, { k: 'dom', l: 'Dom' }]

export function CalendarioProducao() {
  const { tenantId } = useAuth()
  const { itens } = useItensProduziveis()
  const qc = useQueryClient()
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2200) }

  const { data: cals = [] } = useQuery({ queryKey: ['cal-prod', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('calendario_producao').select('insumo_id,seg,ter,qua,qui,sex,sab,dom').eq('tenant_id', tenantId); return (data ?? []) as Cal[] } })
  const calMap = useMemo(() => Object.fromEntries(cals.map((c) => [c.insumo_id, c])) as Record<string, Cal>, [cals])

  const toggle = async (insumoId: string, dia: keyof Omit<Cal, 'insumo_id'>) => {
    const cur = calMap[insumoId] || { insumo_id: insumoId, seg: false, ter: false, qua: false, qui: false, sex: false, sab: false, dom: false }
    const row = { ...cur, [dia]: !cur[dia], insumo_id: insumoId, tenant_id: tenantId }
    const { error } = await supabase.from('calendario_producao').upsert(row, { onConflict: 'tenant_id,insumo_id' })
    if (error) { showToast('Erro: ' + error.message); return }
    qc.invalidateQueries({ queryKey: ['cal-prod'] })
  }

  return (
    <div className="cfg-screen">
      <div className="usr-top"><div className="t">Define o que se produz em cada dia da semana (nem tudo é diário — molho pode ser 2×/semana, Shari é diário). Alimenta a sugestão do Planejamento.</div></div>

      <div className="cfg-card">
        <table>
          <thead><tr><th>Item</th><th className="c" style={{ width: 60 }}>Tipo</th>{DIAS.map((d) => <th key={d.k} className="c" style={{ width: 54 }}>{d.l}</th>)}</tr></thead>
          <tbody>
            {!itens.length ? <tr><td colSpan={9} className="empty">Nenhum item produzível cadastrado (fichas com item vinculado ou itens de porcionamento).</td></tr>
              : itens.map((it) => {
                const cal = calMap[it.insumoId]
                return (
                  <tr key={it.insumoId}>
                    <td>{it.nome}</td>
                    <td className="c"><span className="badge" style={{ background: it.tipo === 'producao' ? '#eff6ff' : '#fff7ed', color: it.tipo === 'producao' ? '#2563eb' : '#ea6a0a' }}>{it.tipo === 'producao' ? 'Prod.' : 'Porc.'}</span></td>
                    {DIAS.map((d) => (
                      <td key={d.k} className="c">
                        <input type="checkbox" checked={!!cal?.[d.k]} onChange={() => toggle(it.insumoId, d.k)} style={{ width: 16, height: 16, accentColor: '#f97316', cursor: 'pointer' }} />
                      </td>
                    ))}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="p-hint" style={{ marginTop: 10 }}>💡 Sexta e sábado a produção costuma subir (fim de semana) — o Planejamento pode sugerir mais nesses dias.</div>

      {toast && <div className="cfg-toast">{toast}</div>}
    </div>
  )
}
