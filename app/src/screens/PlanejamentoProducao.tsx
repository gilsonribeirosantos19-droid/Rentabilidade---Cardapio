import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { useItensProduziveis, type ItemProd } from '../lib/pcp'
import './config.css'

// Produção › Planejar › Planejamento da Produção — lista os itens produzíveis com
// ESTOQUE real + "Produzir hoje" editável → botão Gerar ordens cria as ordens
// (A Produzir). Consumo/dia, Sobra e Sugestão dependem do PDV (placeholder por ora).

type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number; loja_id?: string }
const num = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0
const q3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export function PlanejamentoProducao() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const { itens } = useItensProduziveis()
  const qc = useQueryClient()
  const [prod, setProd] = useState<Record<string, string>>({})
  const [gerando, setGerando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  const { data: saldos = [] } = useQuery({ queryKey: ['plan-saldos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade,custo_medio,loja_id').eq('tenant_id', tenantId); return (data ?? []) as Saldo[] } })
  const estMap = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if (lojaId && s.loja_id !== lojaId) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.quantidade) || 0) }); return m }, [saldos, lojaId])

  const grupos: { g: string; tipo: ItemProd['tipo']; itens: ItemProd[] }[] = useMemo(() => [
    { g: 'Produção (receita)', tipo: 'producao', itens: itens.filter((i) => i.tipo === 'producao') },
    { g: 'Porcionamento (1 item → partes)', tipo: 'porcionamento', itens: itens.filter((i) => i.tipo === 'porcionamento') },
  ], [itens])

  const aProduzir = itens.filter((i) => num(prod[i.insumoId]) > 0)
  const nProd = aProduzir.filter((i) => i.tipo === 'producao').length
  const nPorc = aProduzir.filter((i) => i.tipo === 'porcionamento').length

  const gerarOrdens = async () => {
    if (!aProduzir.length) { showToast('Informe “Produzir hoje” em pelo menos um item.', true); return }
    setGerando(true)
    try {
      const dataISO = new Date().toISOString()
      for (const it of aProduzir) {
        const qtd = num(prod[it.insumoId])
        if (it.tipo === 'producao') {
          await supabase.from('ordens_producao').insert({ tenant_id: tenantId, loja_id: lojaId || null, data: dataISO, ficha_id: it.fichaId, insumo_produzido_id: it.insumoId, quantidade: qtd, custo_total: 0, status: 'aberta' })
        } else {
          await supabase.from('ordens_porcionamento').insert({ tenant_id: tenantId, loja_id: lojaId || null, data: dataISO, insumo_id: it.insumoId, quantidade: qtd, peso: 0, peso_medio: 0, status: 'aberta' })
        }
      }
      qc.invalidateQueries({ queryKey: ['mprod-ordens'] })
      setProd({})
      showToast(`${aProduzir.length} ordem(ns) gerada(s) — ${nProd} de Produção e ${nPorc} de Porcionamento (A Produzir).`)
    } catch (e) { showToast('Erro: ' + (e as Error).message, true) } finally { setGerando(false) }
  }

  const inp: React.CSSProperties = { width: 84, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12.5, background: '#fffdf8' }

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">O AIKO lista os itens internos com o <b>estoque atual</b>. Informe <b>“Produzir hoje”</b> e gere as ordens (Produção ou Porcionamento) automaticamente.</div>
        <button className="cfg-btn pri" disabled={gerando} onClick={gerarOrdens}>{gerando ? 'Gerando…' : '🍳 Gerar ordens →'}</button>
      </div>

      <div className="strip" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {[['Itens a produzir', String(aProduzir.length)], ['Ordens de Produção', String(nProd)], ['Ordens de Porcionamento', String(nPorc)]].map(([l, v]) => (
          <div key={l} className="cfg-card" style={{ padding: '8px 14px', flex: 1 }}><div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'DM Mono, monospace' }}>{v}</div></div>
        ))}
      </div>

      <div className="cfg-card">
        <table>
          <thead><tr><th>Item</th><th className="c">Tipo</th><th className="c">Un.</th><th className="r">Consumo/dia</th><th className="r">Estoque</th><th className="r">Sobra ontem</th><th className="r">Sugestão</th><th className="c">Produzir hoje</th></tr></thead>
          <tbody>
            {!itens.length ? <tr><td colSpan={8} className="empty">Nenhum item produzível (cadastre fichas com item vinculado ou itens de porcionamento).</td></tr>
              : grupos.filter((grp) => grp.itens.length).map((grp) => (
                <FragmentGroup key={grp.g} grp={grp} estMap={estMap} prod={prod} setProd={setProd} inp={inp} />
              ))}
          </tbody>
        </table>
      </div>

      <div className="p-hint" style={{ marginTop: 10 }}>ℹ️ <b>Consumo/dia</b>, <b>Sobra</b> e <b>Sugestão</b> ficam vazios até o <b>PDV</b> alimentar o consumo real (vendas × ficha). Ao <b>Gerar ordens</b>, cada item vira uma ordem <b>A Produzir</b> (a baixa/entrada no estoque acontece ao <b>finalizar</b> a ordem — próximo passo do PCP).</div>

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}

function FragmentGroup({ grp, estMap, prod, setProd, inp }: { grp: { g: string; tipo: ItemProd['tipo']; itens: ItemProd[] }; estMap: Record<string, number>; prod: Record<string, string>; setProd: (f: (p: Record<string, string>) => Record<string, string>) => void; inp: React.CSSProperties }) {
  return (
    <>
      <tr><td colSpan={8} style={{ background: '#f8fafc', fontWeight: 700, fontSize: 11.5, color: '#475569' }}>{grp.g}</td></tr>
      {grp.itens.map((it) => (
        <tr key={it.insumoId}>
          <td>{it.nome}</td>
          <td className="c"><span className="badge" style={{ background: it.tipo === 'producao' ? '#eff6ff' : '#fff7ed', color: it.tipo === 'producao' ? '#2563eb' : '#ea6a0a' }}>{it.tipo === 'producao' ? 'Prod.' : 'Porc.'}</span></td>
          <td className="c muted">{(it.unidade || 'kg').toUpperCase()}</td>
          <td className="r mono muted">—</td>
          <td className="r mono">{q3(estMap[it.insumoId] || 0)}</td>
          <td className="r mono muted">—</td>
          <td className="r mono muted">—</td>
          <td className="c"><input style={inp} value={prod[it.insumoId] || ''} placeholder="0" onChange={(e) => setProd((p) => ({ ...p, [it.insumoId]: e.target.value }))} /></td>
        </tr>
      ))}
    </>
  )
}
