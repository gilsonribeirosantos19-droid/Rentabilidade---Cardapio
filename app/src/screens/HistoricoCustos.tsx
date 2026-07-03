import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Hist = { id?: string; data?: string; insumo_id?: string; loja_id?: string | null; origem?: string; saldo_anterior?: number | null; custo_medio_anterior?: number | null; qtd_entrada?: number | null; custo_entrada?: number | null; novo_custo_medio?: number | null; impacto_pct?: number | null }
type Insumo = { id: string; nome: string }
type Loja = { id: string; nome: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q3 = (v?: number | null) => (v == null) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fmtDH = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ORIGEM_LBL: Record<string, string> = { entrada_manual: 'Entrada Manual', nfe: 'XML / NF-e', nfe_importada: 'XML / NF-e', ajuste: 'Ajuste', manual: 'Entrada Manual' }

export function HistoricoCustos() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const now = new Date()
  const [insF, setInsF] = useState(''); const [origem, setOrigem] = useState('')
  const [periodo, setPeriodo] = useState('mes_atual')
  const [de, setDe] = useState(isoD(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(isoD(now))

  const { data: insumos = [] } = useQuery({ queryKey: ['hc-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['hc-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId); return (data ?? []) as Loja[] } })
  const { data: hist = [], isLoading } = useQuery({
    queryKey: ['hc-hist', tenantId, lojaId, insF, origem, de, ate], enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('historico_custo').select('*').eq('tenant_id', tenantId).order('data', { ascending: false }).limit(200)
      if (lojaId) q = q.eq('loja_id', lojaId)
      if (insF) q = q.eq('insumo_id', insF)
      if (origem) q = q.eq('origem', origem)
      if (de) q = q.gte('data', de + 'T00:00:00')
      if (ate) q = q.lte('data', ate + 'T23:59:59')
      const { data } = await q; return (data ?? []) as Hist[]
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.nome])) as Record<string, string>, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const insByNome = useMemo(() => { const m: Record<string, string> = {}; insumos.forEach((i) => { m[i.nome] = i.id }); return m }, [insumos])

  const aplicarPeriodo = (v: string) => {
    setPeriodo(v); const d = new Date()
    if (v === 'mes_atual') { setDe(isoD(new Date(d.getFullYear(), d.getMonth(), 1))); setAte(isoD(d)) }
    else if (v === 'mes_anterior') { setDe(isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setAte(isoD(new Date(d.getFullYear(), d.getMonth(), 0))) }
    else { setDe(''); setAte('') }
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field" style={{ width: 200 }}><label>Insumo</label>
          <SearchSelect value={insF ? (insMap[insF] || '') : ''} options={insumos.map((i) => i.nome)} placeholder="Todos os insumos" onChange={(nm) => setInsF(nm === 'Todos os insumos' ? '' : (insByNome[nm] || ''))} />
        </div>
        <div className="ds-field"><label>Origem</label>
          <select className="field" value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Todas as origens</option><option value="entrada_manual">Entrada Manual</option><option value="nfe">XML / NF-e</option><option value="ajuste">Ajuste</option></select>
        </div>
        <div className="ds-field"><label>Período</label>
          <select className="field" style={{ minWidth: 130 }} value={periodo} onChange={(e) => aplicarPeriodo(e.target.value)}><option value="periodo">Período</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option></select>
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('periodo') }} /></div>
        <div className="ds-field"><label>Até</label><input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('periodo') }} /></div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th>Data</th><th>Insumo</th><th>Loja</th><th>Origem</th>
            <th className="r">Saldo Ant.</th><th className="r">Custo Ant.</th>
            <th className="r">Qtd. Entrada</th><th className="r">Custo Entrada</th>
            <th className="r">Novo Custo Médio</th><th className="r">Impacto %</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={10} className="empty">Carregando…</td></tr>
              : hist.length === 0 ? <tr><td colSpan={10} className="empty">Nenhum registro encontrado.</td></tr>
              : hist.map((h, i) => {
                const imp = h.impacto_pct
                const impColor = (imp || 0) > 0 ? '#dc2626' : (imp || 0) < 0 ? '#16a34a' : '#64748b'
                return (
                  <tr key={h.id || i}>
                    <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{fmtDH(h.data)}</td>
                    <td style={{ fontWeight: 600 }}>{insMap[h.insumo_id || ''] || '—'}</td>
                    <td>{lojaMap[h.loja_id || ''] || '—'}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{ORIGEM_LBL[h.origem || ''] || h.origem || '—'}</span></td>
                    <td className="r mono">{q3(h.saldo_anterior)}</td>
                    <td className="r mono">{h.custo_medio_anterior ? brl(h.custo_medio_anterior) : '—'}</td>
                    <td className="r mono">{q3(h.qtd_entrada)}</td>
                    <td className="r mono">{h.custo_entrada ? brl(h.custo_entrada) : '—'}</td>
                    <td className="r mono" style={{ fontWeight: 700, color: '#0f172a' }}>{h.novo_custo_medio ? brl(h.novo_custo_medio) : '—'}</td>
                    <td className="r">{imp != null ? <span style={{ color: impColor, fontWeight: 600 }}>{imp > 0 ? '+' : ''}{Number(imp).toFixed(2)}%</span> : '—'}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="pag-bar"><span>{hist.length ? `${hist.length} registro${hist.length !== 1 ? 's' : ''}${hist.length >= 200 ? ' (mostrando os 200 mais recentes)' : ''}` : 'Nenhum registro'}</span></div>
      </div>
    </div>
  )
}
