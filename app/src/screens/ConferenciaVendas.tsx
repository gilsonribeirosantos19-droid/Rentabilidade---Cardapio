import { useMemo, useState } from 'react'
import { supabase } from '../lib/db'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import './estoque.css'

// Conferência de Vendas por DIA — puxa os produtos vendidos direto do iComanda (AO VIVO),
// no dia escolhido, SEM gravar nada. Serve pra conferir se bate com o que entrou no sistema.
type ProdConf = { produto_id: number; nome: string; grupo: string; qtd: number; faturado: number }
type LojaConf = { loja_id: string; loja: string; filial: string; faturado: number; produtos: ProdConf[] }

const brl = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q3 = (v: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

export function ConferenciaVendas() {
  const { tenantId } = useAuth()
  const hoje = new Date().toLocaleDateString('en-CA')
  const [data, setData] = useState(hoje)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [naoCasadas, setNaoCasadas] = useState<string[]>([])
  const [lojas, setLojas] = useState<LojaConf[]>([])
  const [feito, setFeito] = useState(false)

  const conferir = async () => {
    if (!tenantId || !data) { setMsg('Selecione o dia.'); return }
    setLoading(true); setMsg(''); setLojas([]); setNaoCasadas([]); setFeito(false)
    try {
      const { data: res, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, modo: 'conferencia', data } })
      if (error) throw error
      if ((res as { status?: string })?.status !== 'ok') throw new Error((res as { mensagem?: string })?.mensagem || 'Erro na conferência.')
      const ls = ((res as { lojas?: LojaConf[] }).lojas || [])
      setLojas(ls); setNaoCasadas((res as { lojas_nao_casadas?: string[] }).lojas_nao_casadas || []); setFeito(true)
      if (!ls.length) setMsg('Nenhuma loja com venda nesse dia.')
    } catch (e) { setMsg('Erro: ' + (e as Error).message) }
    finally { setLoading(false) }
  }

  const q = busca.trim().toLowerCase()
  const filtradas = useMemo(() => lojas.map((l) => ({
    ...l,
    produtos: q ? l.produtos.filter((p) => `${p.nome} ${p.grupo} ${p.produto_id}`.toLowerCase().includes(q)) : l.produtos,
  })), [lojas, q])
  const totGeral = useMemo(() => filtradas.reduce((a, l) => ({ qtd: a.qtd + l.produtos.reduce((s, p) => s + p.qtd, 0), fat: a.fat + l.produtos.reduce((s, p) => s + p.faturado, 0) }), { qtd: 0, fat: 0 }), [filtradas])

  const exportCSV = () => {
    const linhas: (string | number)[][] = []
    filtradas.forEach((l) => l.produtos.forEach((p) => linhas.push([l.loja, p.produto_id, p.nome, p.grupo, +p.qtd.toFixed(3), +p.faturado.toFixed(2)])))
    if (!linhas.length) { setMsg('Nada para exportar.'); return }
    downloadCsv(`conferencia_${data}.csv`, [['Loja', 'Código', 'Produto', 'Grupo', 'Qtd', 'Faturado'], ...linhas])
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="ds-field"><label>Dia</label><input type="date" className="field" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <button onClick={conferir} disabled={loading} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#f97316', color: '#fff', fontWeight: 700, fontSize: 13, cursor: loading ? 'default' : 'pointer', opacity: loading ? .7 : 1 }}>{loading ? 'Conferindo…' : '↻ Conferir no iComanda'}</button>
        <div className="ds-field" style={{ minWidth: 220 }}><label>Produto</label><input className="field" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div style={{ marginLeft: 'auto' }}><button className="btn-ghost" onClick={exportCSV}>↓ Exportar CSV</button></div>
      </div>

      <div style={{ fontSize: 12.5, color: '#64748b', margin: '2px 2px 12px' }}>
        Puxa os produtos vendidos <b>direto do iComanda</b> no dia escolhido (ao vivo, <b>não altera nada</b>). Use pra conferir se bate com o que entrou no sistema.
      </div>

      {msg && <div className="ci-banner" style={{ marginBottom: 12 }}>{msg}</div>}
      {naoCasadas.length > 0 && <div className="ci-banner" style={{ marginBottom: 12, color: '#b45309' }}>Filiais do iComanda sem loja correspondente no AIKO: {naoCasadas.join(', ')}</div>}

      {feito && filtradas.map((l) => (
        <div key={l.loja_id} className="tbl-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap', gap: 8 }}>
            <b style={{ color: '#0f172a' }}>{l.loja}</b>
            <span style={{ color: '#64748b', fontSize: 13 }}>Faturado do dia: <b style={{ color: '#0f172a' }}>{brl(l.faturado)}</b> · {l.produtos.length} produtos</span>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead><tr><th>Item</th><th>Produto</th><th>Grupo</th><th className="r">Qtd</th><th className="r">Faturado</th></tr></thead>
              <tbody>
                {l.produtos.length === 0 ? <tr><td colSpan={5} className="empty">Nenhum produto.</td></tr>
                  : l.produtos.map((p) => <tr key={p.produto_id}><td className="mono" style={{ color: '#64748b' }}>{p.produto_id}</td><td>{p.nome}</td><td style={{ color: '#64748b' }}>{p.grupo}</td><td className="r mono">{q3(p.qtd)}</td><td className="r mono">{brl(p.faturado)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {feito && filtradas.length > 0 && <div className="ci-banner"><b>Total geral:</b> {q3(totGeral.qtd)} itens vendidos · <b>{brl(totGeral.fat)}</b></div>}
    </div>
  )
}
