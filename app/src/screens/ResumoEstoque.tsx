import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQ = (v?: number | null) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 }) }

export function ResumoEstoque() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const { data: insumos = [] } = useQuery({ queryKey: ['res-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: saldosRaw = [], isLoading } = useQuery({ queryKey: ['res-sld', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).range(f, t)) })

  const saldos = useMemo(() => {
    // consolida "Todas as lojas" com custo médio PONDERADO pela quantidade (valor total ÷ qtd total),
    // NÃO média simples — senão o valor total do estoque sai errado no multi-loja.
    const m: Record<string, { quantidade: number; valor: number }> = {}
    saldosRaw.filter((s) => !lojaId || s.loja_id === lojaId).forEach((s) => { const e = (m[s.insumo_id] ||= { quantidade: 0, valor: 0 }); const q = Number(s.quantidade) || 0; e.quantidade += q; e.valor += q * (Number(s.custo_medio) || 0) })
    return Object.entries(m).map(([insumo_id, e]) => ({ insumo_id, quantidade: e.quantidade, custo_medio: e.quantidade > 0 ? e.valor / e.quantidade : 0 }))
  }, [saldosRaw, lojaId])

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const getSaldo = (id: string) => saldos.find((s) => s.insumo_id === id) || { quantidade: 0, custo_medio: 0 }

  const valTotal = insumos.reduce((s, i) => { const sd = getSaldo(i.id); return s + (sd.quantidade || 0) * (sd.custo_medio || 0) }, 0)

  const porCat = useMemo(() => {
    const m: Record<string, { n: number; val: number }> = {}
    insumos.forEach((i) => { const c = i.categoria || 'sem categoria'; const s = getSaldo(i.id); (m[c] ||= { n: 0, val: 0 }); m[c].n++; m[c].val += (s.quantidade || 0) * (s.custo_medio || 0) })
    return Object.entries(m).sort((a, b) => b[1].val - a[1].val)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumos, saldos])
  const totalItens = porCat.reduce((s, [, d]) => s + d.n, 0)

  const maioresCM = useMemo(() => [...saldos].filter((s) => (s.custo_medio || 0) > 0).sort((a, b) => (b.custo_medio || 0) - (a.custo_medio || 0)).slice(0, 8), [saldos])

  return (
    <div className="est-screen">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Valor por categoria</div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Categoria</th><th className="r">Itens</th><th className="r">Valor Total</th><th className="r">% do Estoque</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className="empty">Carregando…</td></tr>
                : porCat.length === 0 ? <tr><td colSpan={4} className="empty">Sem dados</td></tr>
                : porCat.map(([cat, d]) => <tr key={cat}><td style={{ textTransform: 'capitalize' }}>{cat}</td><td className="r">{d.n}</td><td className="r mono">{brl(d.val)}</td><td className="r mono">{(valTotal > 0 ? d.val / valTotal * 100 : 0).toFixed(1)}%</td></tr>)}
            </tbody>
            {porCat.length > 0 && <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}><td>Total</td><td className="r">{totalItens}</td><td className="r mono">{brl(valTotal)}</td><td className="r mono">100,0%</td></tr></tfoot>}
          </table></div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Itens com maior custo médio</div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Insumo</th><th className="r">Custo Médio</th><th className="r">Saldo</th><th className="r">Valor em Estoque</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className="empty">Carregando…</td></tr>
                : maioresCM.length === 0 ? <tr><td colSpan={4} className="empty">Sem dados</td></tr>
                : maioresCM.map((s) => <tr key={s.insumo_id}><td style={{ fontWeight: 500 }}>{insMap[s.insumo_id]?.nome || '—'}</td><td className="r mono">{brl(s.custo_medio)}</td><td className="r mono">{fmtQ(s.quantidade)}</td><td className="r mono">{brl((s.quantidade || 0) * (s.custo_medio || 0))}</td></tr>)}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="ci-banner" style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>ℹ Os valores consideram o custo médio atual do estoque.</span>
        <span style={{ opacity: .7 }}>Total em estoque: <strong>{brl(valTotal)}</strong></span>
      </div>
    </div>
  )
}
