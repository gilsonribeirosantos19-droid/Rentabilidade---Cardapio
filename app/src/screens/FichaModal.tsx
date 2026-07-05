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
  rendimento_receita_g?: number | null; modo_preparo?: string | null; observacoes?: string | null
  itens_ficha?: { insumo_id?: string | null; quantidade_g?: number }[]
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
    ficha?.produto_id ? { kind: 'produto', id: ficha.produto_id } : null
  )
  const [porcoes, setPorcoes] = useState(String(ficha?.rendimento_porcoes || 1))
  const [preco, setPreco] = useState(ficha?.preco_venda != null ? String(ficha.preco_venda) : '')
  const [precoDel, setPrecoDel] = useState(ficha?.preco_delivery != null ? String(ficha.preco_delivery) : '')
  const [status, setStatus] = useState(ficha?.status || 'ativa')
  const [vincId, setVincId] = useState(ficha?.insumo_vinculado_id || '')
  const [rendVal, setRendVal] = useState(ficha?.rendimento_receita_g ? String(ficha.rendimento_receita_g / 1000) : '')
  const [rendUnid, setRendUnid] = useState('kg')
  const [preparo, setPreparo] = useState(ficha?.modo_preparo || '')
  const [obs, setObs] = useState(ficha?.observacoes || '')
  const [aba, setAba] = useState<'preparo' | 'obs'>('preparo')
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState<ItemRow[]>(() =>
    (ficha?.itens_ficha || []).filter((it) => it.insumo_id).map((it) => {
      const ins = insMap[it.insumo_id!]; const um = umOf(ins); const g = Number(it.quantidade_g) || 0
      return { insumo_id: it.insumo_id!, qtd: String(isW(um) ? g / 1000 : g) }
    })
  )

  // linha de adicionar (buscar insumo + quantidade → Adicionar)
  const [addIns, setAddIns] = useState('')
  const [addQtd, setAddQtd] = useState('')
  const adicionar = () => { if (!addIns || !(Number(addQtd) > 0)) return; setItens((a) => [...a, { insumo_id: addIns, qtd: addQtd }]); setAddIns(''); setAddQtd('') }

  const ehProc = subj?.kind === 'insumo'

  const pickMap = useMemo(() => {
    const m = new Map<string, { kind: 'produto' | 'insumo'; id: string; nome: string; categoria: string }>()
    // rótulo único: se dois produtos/insumos tiverem o MESMO nome, acrescenta " (2)", " (3)"…
    // (senão o Map colapsa os homônimos e a ficha vincularia ao registro errado)
    const uniqLabel = (base: string) => { let l = base, n = 2; while (m.has(l)) l = `${base} (${n++})`; return l }
    produtos.forEach((p) => m.set(uniqLabel(p.nome || '(sem nome)'), { kind: 'produto', id: p.id, nome: p.nome || '', categoria: p.grupo || p.categoria || '' }))
    insumos.forEach((i) => m.set(uniqLabel((i.nome || '') + ' (insumo)'), { kind: 'insumo', id: i.id, nome: i.nome || '', categoria: i.categoria || '' }))
    return m
  }, [produtos, insumos])
  const pickLabel = useMemo(() => {
    if (!subj) return ''
    for (const [label, v] of pickMap) if (v.kind === subj.kind && v.id === subj.id) return label
    return ficha?.nome || ''
  }, [subj, pickMap, ficha])
  const insByName = useMemo(() => { const m = new Map<string, string>(); insumos.forEach((i) => m.set(i.nome || '', i.id)); return m }, [insumos])
  const insNames = useMemo(() => insumos.map((i) => i.nome || ''), [insumos])
  const vincName = vincId ? insMap[vincId]?.nome || '' : ''

  const onPick = (label: string) => {
    const v = pickMap.get(label)
    if (!v) { setSubj(null); setNome(''); return }
    setSubj({ kind: v.kind, id: v.id }); setNome(v.nome); setCategoria(v.categoria)
  }

  const total = itens.reduce((a, r) => {
    const ins = insMap[r.insumo_id]; if (!ins) return a
    const qtdG = isW(umOf(ins)) ? (Number(r.qtd) || 0) * 1000 : (Number(r.qtd) || 0)
    return a + custoIng(ins, qtdG)
  }, 0)
  const por = Number(porcoes) > 0 ? Number(porcoes) : 1
  const rendReceitaG = vincId && rendVal ? (rendUnid === 'kg' || rendUnid === 'L' ? Number(rendVal) * 1000 : Number(rendVal)) : null
  const custoUnit = vincId && rendReceitaG ? total / (rendReceitaG / 1000) : total / por

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error('Selecione o produto ou insumo da ficha.')
      const payload = {
        nome: nome.trim(), categoria: categoria || null, rendimento_porcoes: por,
        preco_venda: ehProc ? null : preco === '' ? null : Number(preco),
        preco_delivery: ehProc ? null : precoDel === '' ? null : Number(precoDel),
        status, produto_id: ehProc ? null : subj?.id || null,
        insumo_vinculado_id: vincId || null, rendimento_receita_g: rendReceitaG,
        modo_preparo: preparo.trim() || null, observacoes: obs.trim() || null,
      }
      let fid = ficha?.id
      if (fid) {
        const r1 = await supabase.from('fichas_tecnicas').update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', fid)
        if (r1.error) throw r1.error
      } else {
        const r2 = await supabase.from('fichas_tecnicas').insert({ ...payload, tenant_id: tenantId }).select('id').single()
        if (r2.error) throw r2.error
        fid = (r2.data as { id: string }).id
      }
      const rows = itens.filter((r) => r.insumo_id && Number(r.qtd) > 0).map((r, i) => {
        const ins = insMap[r.insumo_id]; const qtdG = isW(umOf(ins)) ? Number(r.qtd) * 1000 : Number(r.qtd)
        return { insumo_id: r.insumo_id, quantidade_g: qtdG, ordem: i }
      })
      // troca os ingredientes de forma ATÔMICA (delete + insert numa transação no banco):
      // se falhar, a ficha NÃO fica sem ingredientes (antes o delete/insert era separado)
      const r3 = await supabase.rpc('replace_itens_ficha', { p_ficha_id: fid, p_itens: rows })
      if (r3.error) throw r3.error
      if (vincId && rendReceitaG && rendReceitaG > 0) {
        const tot = rows.reduce((a, r) => { const ins = insMap[r.insumo_id]; return a + (ins ? custoIng(ins, r.quantidade_g) : 0) }, 0)
        const custoKg = tot / (rendReceitaG / 1000)
        await supabase.from('insumos').update({ preco_compra: Number(custoKg.toFixed(4)) }).eq('id', vincId).eq('tenant_id', tenantId)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fichas'] }); qc.invalidateQueries({ queryKey: ['insumos'] }); onSaved() },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="vm" style={{ width: 'min(1080px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="vm-head">
          <h2>{ficha?.id ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'}</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <button className="fm-cancel" onClick={onClose}>Cancelar</button>
            <button className="fm-save" disabled={save.isPending} onClick={() => { setErro(''); save.mutate() }}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="vm-body">
          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, padding: '10px 12px', borderRadius: 9, marginBottom: 14 }}>{erro}</div>}

          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Produto / Insumo *</label><SearchSelect value={pickLabel} onChange={onPick} options={[...pickMap.keys()]} placeholder="Selecione produto ou insumo..." /></div>
            <div className="fm-g"><label className="fm-l">Grupo</label><input className="fm-i ro" value={categoria} readOnly placeholder="Vem do produto/insumo" /></div>
          </div>
          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Rendimento (porções) *</label><input className="fm-i" type="number" min="1" value={porcoes} onChange={(e) => setPorcoes(e.target.value)} /></div>
            <div className="fm-g"><label className="fm-l">Preço de venda — salão (R$)</label><input className="fm-i" type="number" step="0.01" value={preco} disabled={ehProc} onChange={(e) => setPreco(e.target.value)} placeholder="Ex: 49.90" /></div>
          </div>
          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Preço de delivery (R$)</label><input className="fm-i" type="number" step="0.01" value={precoDel} disabled={ehProc} onChange={(e) => setPrecoDel(e.target.value)} placeholder="Ex: 59.90 (maior, p/ cobrir o iFood)" /><small className="fm-hint">Deixe vazio se for igual ao salão</small></div>
            <div className="fm-g"><label className="fm-l">Status</label><select className="fm-i" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ativa">Ativa</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option></select></div>
          </div>

          <div className="fm-divider" />
          <div className="fm-sec-label">Vincular a insumo existente</div>
          <div className="fm-row">
            <div className="fm-g"><label className="fm-l">Insumo que receberá o custo</label><SearchSelect value={vincName} options={insNames} placeholder="— Não vincular —" onChange={(nm) => setVincId(insByName.get(nm) || '')} /></div>
            <div className="fm-g"><label className="fm-l">Rendimento da receita *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="fm-i" type="number" step="any" value={rendVal} disabled={!vincId} onChange={(e) => setRendVal(e.target.value)} placeholder="Ex: 800" style={{ flex: 1 }} />
                <select className="fm-i" value={rendUnid} disabled={!vincId} onChange={(e) => setRendUnid(e.target.value)} style={{ width: 80 }}><option value="kg">kg</option><option value="g">g</option><option value="L">litro</option><option value="ml">ml</option></select>
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 18, marginBottom: 12 }}>Ingredientes</h3>
          <div className="ing-add">
            <div className="ing-add-s"><SearchSelect value={addIns ? (insMap[addIns]?.nome || '') : ''} options={insNames} placeholder="Buscar insumo (código ou descrição)" onChange={(nm) => setAddIns(insByName.get(nm) || '')} /></div>
            <div className="ing-add-f"><label>UM</label><div className="ing-um">{addIns ? umOf(insMap[addIns]) : '—'}</div></div>
            <div className="ing-add-f"><label>Quantidade</label><input className="ing-qtd" type="number" step="any" value={addQtd} onChange={(e) => setAddQtd(e.target.value)} placeholder="Ex.: 0,100" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }} /></div>
            <button className="ing-add-btn" onClick={adicionar} disabled={!addIns || !(Number(addQtd) > 0)}>Adicionar</button>
          </div>
          <div className="ing-tbl">
            <div className="ing-thead"><div>Insumo</div><div>UM</div><div className="r">Quantidade</div><div className="r">% Aprov.</div><div className="r">Custo Unitário</div><div className="r">Custo Total</div><div className="c">Ações</div></div>
            {itens.length === 0 ? <div className="ing2-empty">Nenhum ingrediente — busque acima e clique em "Adicionar".</div>
              : <>
                {itens.map((r, idx) => {
                  const ins = insMap[r.insumo_id]; const um = umOf(ins)
                  const qtdG = isW(um) ? (Number(r.qtd) || 0) * 1000 : (Number(r.qtd) || 0)
                  const ct = ins ? custoIng(ins, qtdG) : 0
                  const cu = ins ? custoIng(ins, isW(um) ? 1000 : 1) : 0
                  return (
                    <div className="ing-trow" key={idx}>
                      <div className="ins">{ins?.nome || '—'}</div>
                      <div className="um">{ins ? um : '—'}</div>
                      <div className="r">{r.qtd || '0'}</div>
                      <div className="r muted">{ins ? (ins.rendimento_pct || 100) + '%' : '—'}</div>
                      <div className="r mono">{ins ? brl(cu) : '—'}</div>
                      <div className="r bold mono">{ins ? brl(ct) : '—'}</div>
                      <div className="c"><button className="ing2-del" title="Remover" onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}>🗑</button></div>
                    </div>
                  )
                })}
                <div className="ing-count">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</div>
              </>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 14, marginBottom: 16 }}>
            <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 10, padding: '9px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Custo {vincId ? 'por unidade (kg/L)' : 'unitário da receita'}</div>
              <div style={{ fontSize: 19, fontWeight: 400, fontFamily: 'DM Mono, monospace', marginTop: 2, color: '#1e293b' }}>{brl(custoUnit)}</div>
            </div>
            <div style={{ flex: 1, background: '#eef4ff', border: '1px solid #dbe6ff', borderRadius: 10, padding: '9px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#3b5bdb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Custo total da receita</div>
              <div style={{ fontSize: 19, fontWeight: 400, fontFamily: 'DM Mono, monospace', marginTop: 2, color: '#1e293b' }}>{brl(total)}</div>
            </div>
          </div>

          <div className="fm-tabs">
            <button className={'fm-tab' + (aba === 'preparo' ? ' on' : '')} onClick={() => setAba('preparo')}>Modo de Preparo</button>
            <button className={'fm-tab' + (aba === 'obs' ? ' on' : '')} onClick={() => setAba('obs')}>Observações</button>
          </div>
          <div className="fm-ta-wrap">
            {aba === 'preparo'
              ? <textarea className="fm-ta" maxLength={2000} value={preparo} onChange={(e) => setPreparo(e.target.value)} placeholder="Descreva o processo de preparo..." />
              : <textarea className="fm-ta" maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações..." />}
            <span className="fm-ta-count">{(aba === 'preparo' ? preparo : obs).length} / 2000</span>
          </div>
        </div>
      </div>
    </div>
  )
}
