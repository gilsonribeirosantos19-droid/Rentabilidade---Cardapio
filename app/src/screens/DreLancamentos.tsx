import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useToastTipo } from '../lib/toast'

// Lançamentos manuais (Fase 2 do DRE): compras/custos SEM nota (feira, débito…).
// Gravam direto numa conta gerencial e entram no DRE somados àquela conta.

type Conta = { id: string; codigo: string; nome: string; parent_codigo?: string | null; ordem?: number }
type Loja = { id: string; nome: string }
type Lanc = { id: string; conta_gerencial_id: string; loja_id?: string | null; data: string; valor: number; descricao?: string | null }

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtData = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const hoje = () => new Date().toISOString().slice(0, 10)
const anoAtual = new Date().getFullYear()

export function DreLancamentos() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastTipo(2600)
  const [ano, setAno] = useState(anoAtual)
  const [form, setForm] = useState({ data: hoje(), conta: '', loja: '', valor: '', descricao: '' })

  const { data: contas = [] } = useQuery({
    queryKey: ['dre-contas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('ordem'); return (data ?? []) as Conta[] },
  })
  const { data: lojas = [] } = useQuery({
    queryKey: ['dre-lojas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] },
  })
  const { data: lancs = [], isLoading } = useQuery({
    queryKey: ['dre-lancamentos', tenantId, ano], enabled: !!tenantId,
    queryFn: () => fetchAll<Lanc>((f, t) => supabase.from('lancamentos_gerenciais').select('*').eq('tenant_id', tenantId).gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`).order('data', { ascending: false }).order('id').range(f, t)),
  })

  const folhas = useMemo(() => { const pais = new Set(contas.map((c) => c.parent_codigo).filter(Boolean)); return contas.filter((c) => !pais.has(c.codigo)).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) }, [contas])
  const contaById = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])
  const lojaById = useMemo(() => new Map(lojas.map((l) => [l.id, l.nome])), [lojas])
  const rotulo = (c?: Conta) => c ? `${c.codigo} · ${c.nome}` : '—'

  const addMut = useMutation({
    mutationFn: async () => {
      const valor = parseFloat((form.valor || '').replace(/\./g, '').replace(',', '.'))
      if (!form.conta) throw new Error('Escolha a conta.')
      if (!(valor > 0)) throw new Error('Informe um valor válido.')
      const { error } = await supabase.from('lancamentos_gerenciais').insert({
        tenant_id: tenantId, conta_gerencial_id: form.conta, loja_id: form.loja || null,
        data: form.data || hoje(), valor, descricao: (form.descricao || '').trim() || null,
      }); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-lancamentos'] }); setForm((f) => ({ ...f, valor: '', descricao: '' })); showToast('Lançamento adicionado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('lancamentos_gerenciais').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-lancamentos'] }); showToast('Lançamento removido.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const total = lancs.reduce((a, l) => a + (Number(l.valor) || 0), 0)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <>
      <div className="dre-card" style={{ marginBottom: 14 }}>
        <div className="dre-ch"><div><div className="t">Novo lançamento manual</div><div className="s">para compras/custos sem nota fiscal (feira, débito…)</div></div></div>
        <div className="dlc-form">
          <div className="dre-fld"><label>Data</label><input className="dcl-inp" type="date" value={form.data} onChange={(e) => set('data', e.target.value)} /></div>
          <div className="dre-fld" style={{ flex: 1, minWidth: 190 }}><label>Conta *</label>
            <select value={form.conta} onChange={(e) => set('conta', e.target.value)}><option value="">Escolha a conta…</option>{folhas.map((c) => <option key={c.id} value={c.id}>{rotulo(c)}</option>)}</select>
          </div>
          <div className="dre-fld"><label>Loja</label>
            <select value={form.loja} onChange={(e) => set('loja', e.target.value)}><option value="">(todas / geral)</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          </div>
          <div className="dre-fld"><label>Valor (R$)</label><input className="dcl-inp" style={{ width: 120, textAlign: 'right' }} placeholder="0,00" value={form.valor} onChange={(e) => set('valor', e.target.value)} /></div>
          <div className="dre-fld" style={{ flex: 1, minWidth: 160 }}><label>Descrição</label><input className="dcl-inp" placeholder="Ex.: feira semana 40" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} /></div>
          <div className="dre-fld"><label>&nbsp;</label><button className="dcl-btn pri" disabled={addMut.isPending} onClick={() => addMut.mutate()}>＋ Adicionar</button></div>
        </div>
      </div>

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Lançamentos de {ano}</div><div className="s">total: {brl(total)}</div></div>
          <div className="dre-grow" />
          <div className="dre-fld"><label>Ano</label><select value={ano} onChange={(e) => setAno(Number(e.target.value))}>{[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        </div>
        <div className="dre-scroll">
          <table className="dre">
            <thead><tr><th className="l">Data</th><th className="l">Conta</th><th className="l">Loja</th><th className="l">Descrição</th><th>Valor</th><th className="l" style={{ width: 50 }}></th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="dre-empty">Carregando…</td></tr>
                : lancs.length === 0 ? <tr><td colSpan={6} className="dre-empty">Nenhum lançamento em {ano}. Use o formulário acima.</td></tr>
                : lancs.map((l) => (
                  <tr key={l.id}>
                    <td className="l">{fmtData(l.data)}</td>
                    <td className="l">{rotulo(contaById.get(l.conta_gerencial_id))}</td>
                    <td className="l" style={{ color: '#94a3c4' }}>{l.loja_id ? (lojaById.get(l.loja_id) || '—') : 'Geral'}</td>
                    <td className="l" style={{ color: '#586084' }}>{l.descricao || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{brl(l.valor)}</td>
                    <td className="l"><button className="dcl-btn" style={{ height: 28, padding: '0 9px', color: '#e11d48' }} onClick={() => { if (confirm('Remover este lançamento?')) delMut.mutate(l.id) }}>✕</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
