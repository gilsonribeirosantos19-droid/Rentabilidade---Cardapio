import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { SearchSelect } from '../components/SearchSelect'

type Ins = { id: string; nome?: string; categoria?: string; preco_compra?: number; rendimento_pct?: number; unidade_medida?: string; unidade_compra?: string }
type Prod = { id: string; nome?: string; grupo?: string; categoria?: string }
type ItemRow = { insumo_id: string; qtd: string }
type FichaIn = {
  id?: string; nome?: string; categoria?: string; produto_id?: string | null; insumo_vinculado_id?: string | null
  rendimento_porcoes?: number; preco_venda?: number | null; preco_delivery?: number | null; status?: string
  rendimento_receita_g?: number | null; itens_ficha?: { insumo_id?: string | null; quantidade_g?: number }[]
}

const umOf = (i?: Ins) => (i ? i.unidade_medida || i.unidade_compra || 'g' : 'g')
const isW = (um: string) => um === 'kg' || um === 'litro'
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function FichaModal({ ficha, produtos, insumos, insMap, custoIng, tenantId, onClose, onSaved }: {
  ficha: FichaIn | null
  produtos: Prod[]
  insumos: Ins[]
  insMap: Record<string, Ins>
  custoIng: (ins: Ins, qtdG: number) => number
  tenantId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(ficha?.nome || '')
  const [categoria, setCategoria] = useState(ficha?.categoria || '')
  const [subj, setSubj] = useState<{ kind: 'produto' | 'insumo'; id: string } | null>(
    ficha?.produto_id ? { kind: 'produto', id: ficha.produto_id } : ficha?.insumo_vinculado_id ? { kind: 'insumo', id: ficha.insumo_vinculado_id } : null
  )
  const [porcoes, setPorcoes] = useState(String(ficha?.rendimento_porcoes || 1))
  const [preco, setPreco] = useState(ficha?.preco_venda != null ? String(ficha.preco_venda) : '')
  const [precoDel, setPrecoDel] = useState(ficha?.preco_delivery != null ? String(ficha.preco_delivery) : '')
  const [status, setStatus] = useState(ficha?.status || 'ativa')
  const [rendVal, setRendVal] = useState(ficha?.rendimento_receita_g ? String(ficha.rendimento_receita_g / 1000) : '')
  const [rendUnid, setRendUnid] = useState('kg')
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState<ItemRow[]>(() =>
    (ficha?.itens_ficha || []).filter((it) => it.insumo_id).map((it) => {
      const ins = insMap[it.insumo_id!]; const um = umOf(ins); const g = Number(it.quantidade_g) || 0
      return { insumo_id: it.insumo_id!, qtd: String(isW(um) ? g / 1000 : g) }
    })
  )

  const ehProc = subj?.kind === 'insumo'

  const pickMap = useMemo(() => {
    const m = new Map<string, { kind: 'produto' | 'insumo'; id: string; nome: string; categoria: string }>()
    produtos.forEach((p) => m.set('🍽 ' + (p.nome || ''), { kind: 'produto', id: p.id, nome: p.nome || '', categoria: p.grupo || p.categoria || '' }))
    insumos.forEach((i) => m.set('⚙ ' + (i.nome || '') + ' (insumo)', { kind: 'insumo', id: i.id, nome: i.nome || '', categoria: i.categoria || '' }))
    return m
  }, [produtos, insumos])
  const pickLabel = useMemo(() => {
    if (!subj) return ''
    for (const [label, v] of pickMap) if (v.kind === subj.kind && v.id === subj.id) return label
    return ''
  }, [subj, pickMap])
  const insByName = useMemo(() => { const m = new Map<string, string>(); insumos.forEach((i) => m.set(i.nome || '', i.id)); return m }, [insumos])
  const insNames = useMemo(() => insumos.map((i) => i.nome || ''), [insumos])

  const onPick = (label: string) => {
    const v = pickMap.get(label)
    if (!v) { setSubj(null); return }
    setSubj({ kind: v.kind, id: v.id }); setNome(v.nome); setCategoria(v.categoria)
  }

  const total = itens.reduce((a, r) => {
    const ins = insMap[r.insumo_id]; if (!ins) return a
    const qtdG = isW(umOf(ins)) ? (Number(r.qtd) || 0) * 1000 : (Number(r.qtd) || 0)
    return a + custoIng(ins, qtdG)
  }, 0)
  const por = Number(porcoes) > 0 ? Number(porcoes) : 1
  const rendReceitaG = ehProc && rendVal ? (rendUnid === 'kg' || rendUnid === 'L' ? Number(rendVal) * 1000 : Number(rendVal)) : null
  const custoUnit = ehProc && rendReceitaG ? total / (rendReceitaG / 1000) : total / por

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error('Selecione o produto ou insumo da ficha.')
      const payload = {
        nome: nome.trim(), categoria: categoria || null, rendimento_porcoes: por,
        preco_venda: ehProc ? null : preco === '' ? null : Number(preco),
        preco_delivery: ehProc ? null : precoDel === '' ? null : Number(precoDel),
        status, produto_id: ehProc ? null : subj?.id || null,
        insumo_vinculado_id: ehProc ? subj?.id || null : null, rendimento_receita_g: rendReceitaG,
      }
      let fid = ficha?.id
      if (fid) {
        const r1 = await supabase.from('fichas_tecnicas').update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', fid)
        if (r1.error) throw r1.error
        await supabase.from('itens_ficha').delete().eq('ficha_id', fid)
      } else {
        const r2 = await supabase.from('fichas_tecnicas').insert({ ...payload, tenant_id: tenantId }).select('id').single()
        if (r2.error) throw r2.error
        fid = (r2.data as { id: string }).id
      }
      const rows = itens.filter((r) => r.insumo_id && Number(r.qtd) > 0).map((r, i) => {
        const ins = insMap[r.insumo_id]; const qtdG = isW(umOf(ins)) ? Number(r.qtd) * 1000 : Number(r.qtd)
        return { ficha_id: fid, insumo_id: r.insumo_id, quantidade_g: qtdG, ordem: i }
      })
      if (rows.length) { const r3 = await supabase.from('itens_ficha').insert(rows); if (r3.error) throw r3.error }
      if (ehProc && rendReceitaG && rendReceitaG > 0 && subj) {
        const tot = rows.reduce((a, r) => { const ins = insMap[r.insumo_id]; return a + (ins ? custoIng(ins, r.quantidade_g) : 0) }, 0)
        const custoKg = tot / (rendReceitaG / 1000)
        await supabase.from('insumos').update({ preco_compra: Number(custoKg.toFixed(4)) }).eq('id', subj.id)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fichas'] }); qc.invalidateQueries({ queryKey: ['insumos'] }); onSaved() },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="vm" style={{ width: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="vm-head">
          <h2>{ficha?.id ? 'Editar Ficha' : 'Nova Ficha'}</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fm-b" onClick={onClose}>Cancelar</button>
            <button className="fm-b primary" disabled={save.isPending} onClick={() => { setErro(''); save.mutate() }}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="vm-body">
          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, padding: '10px 12px', borderRadius: 9, marginBottom: 14 }}>{erro}</div>}

          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Produto / Insumo *</label><SearchSelect value={pickLabel} onChange={onPick} options={[...pickMap.keys()]} placeholder="Selecione produto ou insumo..." /></div>
            <div className="fm-g"><label className="fm-l">Grupo</label><input className="fm-i" value={categoria} readOnly style={{ background: '#f8fafc', color: '#475569' }} /></div>
          </div>
          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Rendimento (porções) *</label><input className="fm-i" type="number" min="1" value={porcoes} onChange={(e) => setPorcoes(e.target.value)} /></div>
            <div className="fm-g"><label className="fm-l">Status</label><select className="fm-i" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ativa">Ativa</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option></select></div>
          </div>
          {!ehProc && (
            <div className="fm-row">
              <div className="fm-g"><label className="fm-l">Preço de venda — salão (R$)</label><input className="fm-i" type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Ex: 49.90" /></div>
              <div className="fm-g"><label className="fm-l">Preço de delivery (R$)</label><input className="fm-i" type="number" step="0.01" value={precoDel} onChange={(e) => setPrecoDel(e.target.value)} placeholder="Vazio = igual ao salão" /></div>
            </div>
          )}
          {ehProc && (
            <div className="fm-row">
              <div className="fm-g" style={{ gridColumn: 'span 2' }}><label className="fm-l">Rendimento da receita * (processado — atualiza o preço do insumo)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="fm-i" type="number" step="any" value={rendVal} onChange={(e) => setRendVal(e.target.value)} placeholder="Ex: 0.8" style={{ flex: 1 }} />
                  <select className="fm-i" value={rendUnid} onChange={(e) => setRendUnid(e.target.value)} style={{ width: 80 }}><option value="kg">kg</option><option value="g">g</option><option value="L">litro</option><option value="ml">ml</option></select>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 18, marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Ingredientes</h3>
            <div style={{ flex: 1 }} />
            <button className="fm-b" onClick={() => setItens((a) => [...a, { insumo_id: '', qtd: '' }])}>+ Adicionar</button>
          </div>
          <table className="ing-tbl">
            <thead><tr><th>Insumo</th><th>UM</th><th className="r">Qtd</th><th className="r">Custo total</th><th /></tr></thead>
            <tbody>
              {itens.length === 0 ? <tr><td colSpan={5} style={{ padding: 14, textAlign: 'center', color: '#94a3b8' }}>Adicione ingredientes</td></tr>
                : itens.map((r, idx) => {
                  const ins = insMap[r.insumo_id]; const um = umOf(ins)
                  const qtdG = isW(um) ? (Number(r.qtd) || 0) * 1000 : (Number(r.qtd) || 0)
                  const ct = ins ? custoIng(ins, qtdG) : 0
                  return (
                    <tr key={idx}>
                      <td style={{ minWidth: 240 }}><SearchSelect value={ins?.nome || ''} options={insNames} placeholder="Selecione o insumo..." onChange={(nm) => { const id = insByName.get(nm) || ''; setItens((a) => a.map((x, i) => i === idx ? { ...x, insumo_id: id } : x)) }} /></td>
                      <td style={{ color: '#64748b' }}>{ins ? um : '—'}</td>
                      <td className="r"><input className="fm-i" style={{ width: 90, height: 34, textAlign: 'right' }} type="number" step="any" value={r.qtd} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, qtd: e.target.value } : x))} /></td>
                      <td className="r" style={{ fontFamily: 'DM Mono, monospace' }}>{brl(ct)}</td>
                      <td><button className="fm-x" onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}>✕</button></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Custo {ehProc ? 'por unidade (kg/L)' : 'unitário da receita'}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'DM Mono, monospace', marginTop: 4 }}>{brl(custoUnit)}</div>
            </div>
            <div style={{ flex: 1, background: '#eef4ff', border: '1px solid #dbe6ff', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#3b5bdb', fontWeight: 600, textTransform: 'uppercase' }}>Custo total da receita</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'DM Mono, monospace', marginTop: 4, color: '#1d4ed8' }}>{brl(total)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
