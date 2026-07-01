import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { custoMedioNaData, custoFichaPorcao } from '../lib/cost'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; rendimento_pct?: number; preco_compra?: number }
type Loja = { id: string; nome: string }
type Mov = { insumo_id: string; quantidade?: number; custo_unitario?: number; criado_em?: string }
type Ficha = { id: string; insumo_vinculado_id?: string; nome?: string; rendimento_receita_g?: number; itens_ficha?: { insumo_id: string; quantidade_g?: number }[] }

export function Recalcular() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [doCM, setDoCM] = useState(true); const [doFicha, setDoFicha] = useState(false)
  const [lojaSel, setLojaSel] = useState<Set<string>>(new Set())
  const [alvoIns, setAlvoIns] = useState(''); const [alvoFicha, setAlvoFicha] = useState('')
  const [result, setResult] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data: insumos = [] } = useQuery({ queryKey: ['rc-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,rendimento_pct,preco_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['rc-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Loja[] } })
  const { data: fichasProc = [] } = useQuery({ queryKey: ['rc-fichas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fichas_tecnicas').select('nome,insumo_vinculado_id').eq('tenant_id', tenantId).not('insumo_vinculado_id', 'is', null).order('nome'); return (data ?? []) as Ficha[] } })

  const toggleLoja = (id: string, on: boolean) => setLojaSel((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })
  const toggleTodas = (on: boolean) => setLojaSel(on ? new Set(lojas.map((l) => l.id)) : new Set())

  const recalcMut = useMutation({
    mutationFn: async () => {
      const lojaIds = [...lojaSel]; if (!lojaIds.length) throw new Error('Selecione ao menos uma loja.')
      if (!doCM && !doFicha) throw new Error('Marque o que recalcular.')
      let totCM = 0, totFicha = 0
      for (const lId of lojaIds) {
        if (doCM) {
          const [ents, sais] = await Promise.all([
            fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,criado_em').eq('tenant_id', tenantId).eq('loja_id', lId).range(f, t)),
            fetchAll<Mov>((f, t) => supabase.from('saidas_estoque').select('insumo_id,quantidade,criado_em').eq('tenant_id', tenantId).eq('loja_id', lId).range(f, t)),
          ])
          const insIds = alvoIns ? [alvoIns] : [...new Set([...ents.map((e) => e.insumo_id), ...sais.map((s) => s.insumo_id)])].filter(Boolean)
          const agora = new Date().toISOString()
          const payloads = insIds.map((insId) => { const r = custoMedioNaData(insId, null, { entradas: ents, saidas: sais }); return { tenant_id: tenantId, insumo_id: insId, loja_id: lId, quantidade: +(r.quantidade || 0).toFixed(4), custo_medio: +(r.custo || 0).toFixed(6), atualizado_em: agora } })
          for (let i = 0; i < payloads.length; i += 200) { const { error } = await supabase.from('saldo_estoque').upsert(payloads.slice(i, i + 200), { onConflict: 'tenant_id,insumo_id,loja_id' }); if (error) throw error }
          totCM += payloads.length
        }
        if (doFicha) totFicha += await recalcularFichas(lId)
      }
      return { totCM, totFicha, nLojas: lojaIds.length }
    },
    onSuccess: ({ totCM, totFicha, nLojas }) => {
      let msg = ''
      if (doCM) msg += `✓ Custo médio recalculado: ${totCM} item(ns) em ${nLojas} loja(s).\n`
      if (doFicha) msg += `✓ Fichas de processado recalculadas: ${totFicha}.`
      setResult(msg.trim()); showToast('Recálculo concluído!', 'ok')
      qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /sald|mov|kardex|custo|rc-|fich/i.test(k) } })
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  async function recalcularFichas(lId: string) {
    const [fichas, saldosLoja, vinc] = await Promise.all([
      supabase.from('fichas_tecnicas').select('id,insumo_vinculado_id,rendimento_receita_g,itens_ficha(insumo_id,quantidade_g)').eq('tenant_id', tenantId).not('insumo_vinculado_id', 'is', null).then((r) => (r.data ?? []) as Ficha[]),
      fetchAll<{ insumo_id: string; custo_medio?: number }>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio').eq('tenant_id', tenantId).eq('loja_id', lId).range(f, t)),
      fetchAll<{ insumo_id: string; preco_unitario?: number }>((f, t) => supabase.from('insumo_fornecedores').select('insumo_id,preco_unitario').eq('tenant_id', tenantId).range(f, t)),
    ])
    const ctx = { saldos: saldosLoja.map((s) => ({ ...s, loja_id: lId })), vinculos: vinc, insumos }
    let n = 0
    for (const f of fichas) {
      if (alvoFicha && f.insumo_vinculado_id !== alvoFicha) continue
      const rendG = Number(f.rendimento_receita_g) || 0
      if (!rendG || !(f.itens_ficha || []).length) continue
      const custoTotal = custoFichaPorcao(f.itens_ficha || [], 1, lId, ctx)
      const custoKg = custoTotal / rendG * 1000
      const { error } = await supabase.from('insumos').update({ preco_compra: +custoKg.toFixed(4) }).eq('id', f.insumo_vinculado_id!); if (error) throw error
      n++
    }
    return n
  }

  const lojaLabel = useMemo(() => { if (!lojaSel.size) return 'Selecione as lojas...'; if (lojaSel.size === lojas.length) return 'Todas as lojas'; if (lojaSel.size === 1) return lojas.find((l) => lojaSel.has(l.id))?.nome || '1 loja'; return `${lojaSel.size} lojas selecionadas` }, [lojaSel, lojas])
  useEffect(() => { if (!dropOpen) return; const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [dropOpen])

  return (
    <div className="est-screen">
      <div className="adj-tbar" style={{ maxWidth: 680 }}>
        <button className="adj-tbtn pri" title="Recalcular (executar)" disabled={recalcMut.isPending} onClick={() => recalcMut.mutate()}>↻</button>
        <button className="adj-tbtn" title="Limpar" onClick={() => { setLojaSel(new Set()); setAlvoIns(''); setAlvoFicha(''); setDoCM(true); setDoFicha(false); setResult('') }}>✕</button>
        {recalcMut.isPending && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>Recalculando…</span>}
      </div>

      <div className="adj-card" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}><input type="checkbox" checked={doCM} onChange={(e) => setDoCM(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#f97316' }} /> Recalcular Custo Médio</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}><input type="checkbox" checked={doFicha} onChange={(e) => setDoFicha(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#f97316' }} /> Recalcular Custo da Ficha Técnica</label>
        </div>

        <div className="adj-fg" style={{ maxWidth: 340 }}><label>Loja</label>
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button type="button" className="rc-loja-btn" onClick={() => setDropOpen((o) => !o)}><span style={{ color: lojaSel.size ? '#0f172a' : '#94a3b8' }}>{lojaLabel}</span><span style={{ color: '#94a3b8' }}>▾</span></button>
            {dropOpen && <div className="rc-loja-drop">
              <label style={{ fontWeight: 700 }}><input type="checkbox" checked={lojas.length > 0 && lojaSel.size === lojas.length} onChange={(e) => toggleTodas(e.target.checked)} /> Todas as lojas</label>
              {lojas.map((l) => <label key={l.id}><input type="checkbox" checked={lojaSel.has(l.id)} onChange={(e) => toggleLoja(l.id, e.target.checked)} /> {l.nome}</label>)}
            </div>}
          </div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginTop: 14, opacity: doCM ? 1 : .45, pointerEvents: doCM ? 'auto' : 'none', background: doCM ? '#fff' : '#f8fafc' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>● Custo Médio — quais insumos</div>
          <div className="adj-fg"><label>Insumo</label><select value={alvoIns} onChange={(e) => setAlvoIns(e.target.value)}><option value="">Todos os itens</option>{insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginTop: 12, opacity: doFicha ? 1 : .45, pointerEvents: doFicha ? 'auto' : 'none', background: doFicha ? '#fff' : '#f8fafc' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>● Ficha Técnica — quais fichas</div>
          <div className="adj-fg"><label>Ficha Técnica</label><select value={alvoFicha} onChange={(e) => setAlvoFicha(e.target.value)}><option value="">Todas as fichas</option>{fichasProc.map((f, i) => <option key={i} value={f.insumo_vinculado_id}>{f.nome || '—'}</option>)}</select></div>
        </div>

        {result && <div className="ci-banner" style={{ marginTop: 14, whiteSpace: 'pre-line' }}>{result}</div>}
      </div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
