import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './config.css'

// Produção › Lançar › Ordem de Produção (apontamento).
// Item COM ficha técnica (Shari, molhos). Escolhe a ficha + quantidade →
// os ingredientes vêm da ficha (escalados) → salva a ordem.
// Baixa dos ingredientes + entrada do produzido no estoque = próximo passo.

type ItemFicha = { insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number }
type Ficha = { id: string; nome?: string; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; itens_ficha?: ItemFicha[] }
type Insumo = { id: string; nome?: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string }
type Saldo = { insumo_id: string; custo_medio?: number }

const nowLocal = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const num = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function OrdemProducao() {
  const { tenantId } = useAuth()
  const { lojas, lojaId } = useLoja()
  const qc = useQueryClient()
  const [data, setData] = useState(nowLocal())
  const [loja, setLoja] = useState(lojaId ?? '')
  const [fichaId, setFichaId] = useState('')
  const [qtd, setQtd] = useState('')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 2600) }

  const { data: fichas = [] } = useQuery({ queryKey: ['prod-fichas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fichas_tecnicas').select('id,nome,insumo_vinculado_id,rendimento_receita_g, itens_ficha(insumo_id,produto_id,quantidade_g)').eq('tenant_id', tenantId).not('insumo_vinculado_id', 'is', null).order('nome'); return (data ?? []) as Ficha[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['prod-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,preco_compra,rendimento_pct,unidade_medida').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['prod-saldos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,custo_medio').eq('tenant_id', tenantId); return (data ?? []) as Saldo[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const cmMap = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if ((s.custo_medio || 0) > (m[s.insumo_id] || 0)) m[s.insumo_id] = s.custo_medio || 0 }); return m }, [saldos])
  const custoBase = (ins?: Insumo) => (ins ? (cmMap[ins.id] > 0 ? cmMap[ins.id] : ins.preco_compra || 0) : 0)
  const custoIngG = (ins: Insumo, qtdG: number) => custoBase(ins) / ((ins.rendimento_pct || 100) / 100) / 1000 * qtdG

  const fichaOpts = useMemo(() => fichas.map((f) => f.nome || ''), [fichas])
  const fichaByNome = useMemo(() => new Map(fichas.map((f) => [f.nome || '', f.id])), [fichas])
  const fichaSel = fichas.find((f) => f.id === fichaId)
  const produzido = fichaSel?.insumo_vinculado_id ? insMap[fichaSel.insumo_vinculado_id] : undefined
  const rendG = Number(fichaSel?.rendimento_receita_g) || 0
  const alvo = num(qtd)
  const fator = rendG > 0 ? (alvo * 1000) / rendG : 0

  const linhas = useMemo(() => {
    if (!fichaSel) return []
    return (fichaSel.itens_ficha || []).filter((it) => it.insumo_id).map((it) => {
      const ins = insMap[it.insumo_id!]
      const baixarG = (Number(it.quantidade_g) || 0) * fator
      const custo = ins ? custoIngG(ins, baixarG) : 0
      return { ins, baixarKg: baixarG / 1000, custo }
    })
  }, [fichaSel, fator, insMap, cmMap])
  const custoTotal = linhas.reduce((a, l) => a + l.custo, 0)
  const custoKg = alvo > 0 ? custoTotal / alvo : 0

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!fichaSel) throw new Error('Selecione o item a produzir (com ficha técnica).')
      if (alvo <= 0) throw new Error('Informe a quantidade a produzir.')
      const { data: ord, error } = await supabase.from('ordens_producao').insert({ tenant_id: tenantId, loja_id: loja || null, data: new Date(data).toISOString(), ficha_id: fichaSel.id, insumo_produzido_id: fichaSel.insumo_vinculado_id, quantidade: alvo, custo_total: custoTotal, status: 'aberta' }).select('id').single()
      if (error) throw error
      const ordemId = (ord as { id: string }).id
      const rows = linhas.filter((l) => l.ins).map((l) => ({ tenant_id: tenantId, ordem_id: ordemId, insumo_id: l.ins!.id, quantidade: l.baixarKg, custo: l.custo }))
      if (rows.length) { const { error: e2 } = await supabase.from('ordens_producao_itens').insert(rows); if (e2) throw e2 }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prod-ordens'] }); showToast('Ordem de produção salva.'); nova() },
    onError: (e: Error) => { console.error('[OrdemProducao]', e); showToast('Erro: ' + e.message, true) },
  })
  const nova = () => { setFichaId(''); setQtd(''); setData(nowLocal()) }

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">Abertura e apontamento — item <b>com ficha técnica</b> (Shari, molhos). Escolha o item, informe a quantidade, e os <b>ingredientes vêm da ficha</b>.</div>
        <button className="cfg-btn pri" onClick={nova}>+ Abrir nova ordem</button>
      </div>

      <div className="cfg-card">
        <div style={{ display: 'grid', gridTemplateColumns: '190px 180px 1fr 90px 130px', gap: 12, alignItems: 'end', padding: 14 }}>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Data / hora</label><input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Loja</label><select value={loja} onChange={(e) => setLoja(e.target.value)}><option value="">—</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Item a produzir * <span className="muted" style={{ fontWeight: 400 }}>(só itens com ficha)</span></label><SearchSelect value={fichaSel?.nome || ''} options={fichaOpts} placeholder="Selecione…" onChange={(nm) => setFichaId(fichaByNome.get(nm) || '')} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>UM</label><input value={produzido?.unidade_medida?.toUpperCase() || ''} readOnly style={{ background: '#f1f5f9' }} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Quantidade a produzir *</label><input value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0,000" style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace' }} /></div>
        </div>
      </div>

      <div className="cfg-card" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Ingrediente <span className="muted" style={{ fontWeight: 400 }}>(da ficha técnica)</span></th><th className="c" style={{ width: 60 }}>Un.</th><th className="r" style={{ width: 140 }}>Qtd a baixar</th><th className="r" style={{ width: 140 }}>Custo</th></tr></thead>
          <tbody>
            {!fichaSel ? <tr><td colSpan={4} className="empty">Selecione o item a produzir.</td></tr>
              : alvo <= 0 ? <tr><td colSpan={4} className="empty">Informe a quantidade a produzir.</td></tr>
                : linhas.length === 0 ? <tr><td colSpan={4} className="empty">Esta ficha não tem ingredientes cadastrados.</td></tr>
                  : linhas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.ins?.nome || '—'}</td>
                      <td className="c muted">{l.ins?.unidade_medida?.toUpperCase() || '—'}</td>
                      <td className="r mono">{q3(l.baixarKg)}</td>
                      <td className="r mono">{brl(l.custo)}</td>
                    </tr>
                  ))}
          </tbody>
          {fichaSel && alvo > 0 && linhas.length > 0 && (
            <tfoot><tr><td colSpan={2} style={{ padding: '6px 12px', background: '#f8fafc', fontWeight: 700 }}>CUSTO TOTAL · custo/{produzido?.unidade_medida || 'kg'}: {brl(custoKg)}</td><td style={{ background: '#f8fafc' }} /><td className="r mono" style={{ padding: '6px 12px', background: '#f8fafc', fontWeight: 700 }}>{brl(custoTotal)}</td></tr></tfoot>
          )}
        </table>
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="cfg-btn" onClick={nova}>Limpar</button>
        <button className="cfg-btn pri" disabled={salvarMut.isPending} onClick={() => salvarMut.mutate()}>{salvarMut.isPending ? 'Salvando…' : 'Salvar ordem'}</button>
      </div>

      <div className="p-hint" style={{ marginTop: 10 }}>ℹ️ Por enquanto a ordem apenas <b>registra a produção</b> e calcula o custo. A baixa dos ingredientes e a entrada do produzido no estoque (com atualização do CMV) serão ligadas no próximo passo.</div>

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
