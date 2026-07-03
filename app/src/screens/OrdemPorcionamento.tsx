import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './config.css'

// Produção › Lançar › Ordem de Porcionamento (apontamento).
// Vai para o Portal do Gerente quando ele for migrado. Aponta a pesagem:
// seleciona o item porcionável → puxa os derivados do cadastro → pesa cada um.
// A baixa/entrada no estoque + rateio de custo entra num passo seguinte.

type Insumo = { id: string; nome?: string; codigo_interno?: number; unidade_medida?: string }
type Item = { id: string; insumo_id: string; perda_pct?: number }
type Deriv = { item_porcionamento_id: string; insumo_id: string; rendimento_pct?: number }
type LinhaD = { insumoId: string; qtd: string; peso: string }

const nowLocal = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const num = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0
const q2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function OrdemPorcionamento() {
  const { tenantId } = useAuth()
  const { lojas, lojaId } = useLoja()
  const qc = useQueryClient()
  const [data, setData] = useState(nowLocal())
  const [loja, setLoja] = useState(lojaId ?? '')
  const [itemPorcId, setItemPorcId] = useState('')
  const [qtd, setQtd] = useState('1')
  const [peso, setPeso] = useState('')
  const [linhas, setLinhas] = useState<LinhaD[]>([])
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 2600) }

  const { data: insumos = [] } = useQuery({ queryKey: ['op-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,codigo_interno,unidade_medida').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const { data: itens = [] } = useQuery({ queryKey: ['op-itensporc', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('itens_porcionamento').select('id,insumo_id,perda_pct').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Item[] } })
  const { data: derivados = [] } = useQuery({ queryKey: ['op-derivados', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('itens_porcionamento_derivados').select('item_porcionamento_id,insumo_id,rendimento_pct').eq('tenant_id', tenantId); return (data ?? []) as Deriv[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const porcOpts = useMemo(() => itens.map((it) => insMap[it.insumo_id]?.nome || '').filter(Boolean), [itens, insMap])
  const porcByNome = useMemo(() => new Map(itens.map((it) => [insMap[it.insumo_id]?.nome || '', it.id])), [itens, insMap])
  const itemSel = itens.find((it) => it.id === itemPorcId)
  const insSel = itemSel ? insMap[itemSel.insumo_id] : undefined

  const selecionarItem = (nome: string) => {
    const id = porcByNome.get(nome) || ''
    setItemPorcId(id)
    const ders = derivados.filter((d) => d.item_porcionamento_id === id)
    setLinhas(ders.map((d) => ({ insumoId: d.insumo_id, qtd: '1', peso: '' })))
  }
  const setLinha = (i: number, patch: Partial<LinhaD>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const pesoEnt = num(peso), qtdEnt = num(qtd)
  const somaPeso = linhas.reduce((a, l) => a + num(l.peso), 0)
  const perda = pesoEnt - somaPeso
  const rend = pesoEnt ? (somaPeso / pesoEnt) * 100 : 0
  const concOk = perda >= -0.0001

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!itemSel) throw new Error('Selecione o item a ser porcionado.')
      if (pesoEnt <= 0) throw new Error('Informe o peso de entrada.')
      if (!concOk) throw new Error('Os derivados somam mais que a entrada — confira os pesos.')
      const { data: ord, error } = await supabase.from('ordens_porcionamento').insert({
        tenant_id: tenantId, loja_id: loja || null, data: new Date(data).toISOString(),
        insumo_id: itemSel.insumo_id, quantidade: qtdEnt, peso: pesoEnt, peso_medio: qtdEnt ? pesoEnt / qtdEnt : 0, status: 'aberta',
      }).select('id').single()
      if (error) throw error
      const ordemId = (ord as { id: string }).id
      const rows = linhas.filter((l) => l.insumoId).map((l) => ({ tenant_id: tenantId, ordem_id: ordemId, insumo_id: l.insumoId, quantidade: num(l.qtd), peso: num(l.peso), peso_medio: num(l.qtd) ? num(l.peso) / num(l.qtd) : 0 }))
      if (rows.length) { const { error: e2 } = await supabase.from('ordens_porcionamento_itens').insert(rows); if (e2) throw e2 }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['op-ordens'] }); showToast('Apontamento salvo.'); novaOrdem() },
    onError: (e: Error) => { console.error('[OrdemPorcionamento]', e); showToast('Erro: ' + e.message, true) },
  })

  const novaOrdem = () => { setItemPorcId(''); setQtd('1'); setPeso(''); setLinhas([]); setData(nowLocal()) }

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">Abertura e apontamento — a loja pesa. Selecione o item, informe o peso e pese os derivados (que vêm do cadastro). Serve por peso (kg) ou unidade.</div>
        <button className="cfg-btn pri" onClick={novaOrdem}>+ Abrir nova ordem</button>
      </div>

      {/* abertura */}
      <div className="cfg-card">
        <div style={{ display: 'grid', gridTemplateColumns: '190px 180px 1fr 90px 100px 100px 100px', gap: 12, alignItems: 'end', padding: 14 }}>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Data / hora</label><input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Loja</label><select value={loja} onChange={(e) => setLoja(e.target.value)}><option value="">—</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Item a ser porcionado *</label><SearchSelect value={insSel?.nome || ''} options={porcOpts} placeholder="Selecione…" onChange={selecionarItem} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>UM</label><input value={insSel?.unidade_medida?.toUpperCase() || ''} readOnly style={{ background: '#f1f5f9' }} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Quantidade</label><input value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace' }} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Peso (kg) *</label><input value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="0,000" style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace' }} /></div>
          <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Peso médio</label><input value={qtdEnt ? q3(pesoEnt / qtdEnt) : ''} readOnly style={{ background: '#f1f5f9', textAlign: 'right', fontFamily: 'DM Mono, monospace' }} /></div>
        </div>
      </div>

      {/* itens gerados */}
      <div className="cfg-card" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Item porcionado <span className="muted" style={{ fontWeight: 400 }}>(derivados do cadastro)</span></th><th className="c" style={{ width: 60 }}>Un.</th><th className="r" style={{ width: 110 }}>Quantidade</th><th className="r" style={{ width: 120 }}>Peso (kg)</th><th className="r" style={{ width: 110 }}>Peso médio</th></tr></thead>
          <tbody>
            {!itemPorcId ? <tr><td colSpan={5} className="empty">Selecione o item a ser porcionado.</td></tr>
              : linhas.length === 0 ? <tr><td colSpan={5} className="empty">Este item não tem derivados cadastrados. Cadastre em “Item de Porcionamento”.</td></tr>
                : linhas.map((l, i) => {
                  const inp = { width: 90, height: 28, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right' as const, padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12 }
                  const pm = num(l.qtd) ? num(l.peso) / num(l.qtd) : 0
                  return (
                    <tr key={i}>
                      <td>{insMap[l.insumoId]?.nome || '—'}</td>
                      <td className="c muted">{insMap[l.insumoId]?.unidade_medida?.toUpperCase() || '—'}</td>
                      <td className="r"><input value={l.qtd} onChange={(e) => setLinha(i, { qtd: e.target.value })} style={inp} /></td>
                      <td className="r"><input value={l.peso} onChange={(e) => setLinha(i, { peso: e.target.value })} placeholder="0,000" style={{ ...inp, background: '#fffdf8' }} /></td>
                      <td className="r mono muted">{pm ? q3(pm) : '—'}</td>
                    </tr>
                  )
                })}
          </tbody>
          {itemPorcId && linhas.length > 0 && (
            <tfoot><tr><td colSpan={3} style={{ padding: '6px 12px', background: '#f8fafc' }}>Perda: <b>{q3(perda)} kg</b> · Rendimento: <b>{rend.toFixed(1)}%</b></td><td colSpan={2} className="r mono" style={{ padding: '6px 12px', background: '#f8fafc' }}>Σ derivados: {q3(somaPeso)} kg</td></tr></tfoot>
          )}
        </table>
      </div>

      {itemPorcId && (
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, background: concOk ? '#f0fdf4' : '#fef2f2', color: concOk ? '#166534' : '#b91c1c' }}>
          {concOk ? <>✅ <b>Confere:</b> entrada {q3(pesoEnt)} kg = derivados {q3(somaPeso)} kg + perda {q3(perda)} kg.</> : <>⚠️ <b>Os derivados somam mais que a entrada</b> — confira os pesos.</>}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="cfg-btn" onClick={novaOrdem}>Limpar</button>
        <button className="cfg-btn pri" disabled={salvarMut.isPending} onClick={() => salvarMut.mutate()}>{salvarMut.isPending ? 'Salvando…' : 'Salvar apontamento'}</button>
      </div>

      <div className="p-hint" style={{ marginTop: 10 }}>ℹ️ Por enquanto o apontamento apenas <b>registra a ordem</b>. A baixa do item original e a entrada dos derivados no estoque (com rateio de custo) serão ligadas no próximo passo.</div>

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
