import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string }
type Entrada = { insumo_id: string; quantidade?: number; custo_unitario?: number; tipo?: string; nfe_numero?: string; fornecedor_nome?: string; criado_em?: string }
type Saida = { insumo_id: string; quantidade?: number; tipo?: string; motivo?: string; criado_em?: string }
type KxMov = { data: string; tipo: 'entrada' | 'saida'; desc: string; qMov: number; vUnit: number; vEntrada: number; vSaida: number; qAcum: number; vAcum: number; cmedio: number }

const brl = (v?: number | null) => (v == null || (v as any) === '') ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fmtData = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export function Kardex() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const now = new Date()
  const [insId, setInsId] = useState('')
  const [de, setDe] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(iso(now))

  const { data: insumos = [] } = useQuery({ queryKey: ['kx-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: entradas = [] } = useQuery({ queryKey: ['kx-entradas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Entrada>((f, t) => supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })
  const { data: saidas = [] } = useQuery({ queryKey: ['kx-saidas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })

  const insOptions = useMemo(() => insumos.map((i) => i.nome), [insumos])
  const insByName = useMemo(() => new Map(insumos.map((i) => [i.nome, i.id])), [insumos])
  const insSel = insumos.find((i) => i.id === insId)

  // monta todos os movimentos do insumo e calcula custo médio acumulado (igual ao original)
  const { abertura, movs } = useMemo<{ abertura: KxMov | null; movs: KxMov[] }>(() => {
    if (!insId) return { abertura: null, movs: [] }
    const todos: Omit<KxMov, 'vEntrada' | 'vSaida' | 'qAcum' | 'vAcum' | 'cmedio'>[] = []
    entradas.filter((e) => e.insumo_id === insId && (!lojaId || (e as any).loja_id === lojaId)).forEach((e) => {
      const vUnit = e.custo_unitario || 0
      todos.push({ data: e.criado_em || '', tipo: 'entrada', desc: (+(e.quantidade || 0) === 0) ? 'Ajuste de custo médio' : (e.tipo === 'nfe' ? `NF-e ${e.nfe_numero || ''}` : `Manual${e.fornecedor_nome ? ' · ' + e.fornecedor_nome : ''}`), qMov: e.quantidade || 0, vUnit })
    })
    saidas.filter((s) => s.insumo_id === insId && (!lojaId || (s as any).loja_id === lojaId)).forEach((s) => {
      todos.push({ data: s.criado_em || '', tipo: 'saida', desc: cap(s.tipo || '') + (s.motivo ? ' · ' + s.motivo : ''), qMov: s.quantidade || 0, vUnit: 0 })
    })
    todos.sort((a, b) => a.data < b.data ? -1 : 1)
    let qAcum = 0, vAcum = 0, cmedio = 0
    const full: KxMov[] = todos.map((m) => {
      if (m.tipo === 'entrada') {
        if (+m.qMov === 0) { cmedio = m.vUnit; vAcum = qAcum * cmedio; return { ...m, vEntrada: 0, vSaida: 0, qAcum, vAcum, cmedio } }
        const vEntrada = m.qMov * m.vUnit; qAcum += m.qMov; vAcum += vEntrada; cmedio = qAcum > 0 ? vAcum / qAcum : 0
        return { ...m, vEntrada, vSaida: 0, qAcum, vAcum, cmedio }
      } else {
        const vSaida = m.qMov * cmedio; qAcum -= m.qMov; vAcum = qAcum * cmedio
        return { ...m, vEntrada: 0, vSaida, qAcum, vAcum, cmedio }
      }
    })
    let ab: KxMov | null = null
    if (de) { const antes = full.filter((m) => m.data < de); if (antes.length) ab = antes[antes.length - 1] }
    let ms = full
    if (de) ms = ms.filter((m) => m.data >= de)
    if (ate) ms = ms.filter((m) => m.data <= ate + 'T23:59:59')
    return { abertura: ab, movs: ms }
  }, [insId, entradas, saidas, de, ate, lojaId])

  const totEnt = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.vEntrada, 0)
  const totSai = movs.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.vSaida, 0)
  const ultimo = movs[movs.length - 1]

  const setPreset = (v: string) => {
    const n = new Date()
    if (v === 'mes_atual') { setDe(iso(new Date(n.getFullYear(), n.getMonth(), 1))); setAte(iso(n)) }
    else if (v === 'mes_anterior') { setDe(iso(new Date(n.getFullYear(), n.getMonth() - 1, 1))); setAte(iso(new Date(n.getFullYear(), n.getMonth(), 0))) }
  }

  const exportCSV = () => {
    if (!movs.length) return
    const header = 'Data;Tipo;Descrição;Quantidade;Custo Unit.;V.Entrada;V.Saída;Saldo Qtd.;Saldo R$;C.Médio\n'
    const body = movs.map((m) => `${fmtData(m.data)};${m.tipo === 'saida' ? 'Saída' : 'Entrada'};${m.desc};${(m.tipo === 'saida' ? -m.qMov : m.qMov).toFixed(3)};${m.vUnit.toFixed(4)};${m.vEntrada.toFixed(2)};${m.vSaida.toFixed(2)};${m.qAcum.toFixed(3)};${m.vAcum.toFixed(2)};${m.cmedio.toFixed(4)}`).join('\n')
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kardex_${insSel?.nome || 'insumo'}_${de}_${ate}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="est-screen">
      <div className="est-title">Kardex <span>— extrato de movimentação por insumo</span></div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 240 }}><SearchSelect value={insSel?.nome || ''} onChange={(nm) => setInsId(insByName.get(nm) || '')} options={insOptions} placeholder="Selecione um insumo..." /></div>
        <select className="field" style={{ minWidth: 130 }} defaultValue="mes_atual" onChange={(e) => setPreset(e.target.value)}>
          <option value="periodo">Período</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option>
        </select>
        <input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => setDe(e.target.value)} />
        <span style={{ color: '#94a3b8' }}>–</span>
        <input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} />
        <button className="btn-ghost" onClick={exportCSV}>↓ CSV</button>
        {insId && <span style={{ fontSize: 12, color: '#94a3b8' }}>{movs.length} movimentação(ões)</span>}
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th>Data</th><th className="c">Tipo</th><th>Descrição</th><th className="r">Quantidade</th><th className="r">Custo Unit.</th><th className="r">V. Entrada</th><th className="r">V. Saída</th><th className="r">Saldo Qtd.</th><th className="r">Saldo R$</th><th className="r">C. Médio</th>
          </tr></thead>
          {ultimo && <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}>
            <td colSpan={5} style={{ color: '#0f172a' }}>Total do período</td>
            <td className="r mono">{brl(totEnt)}</td><td className="r mono">{brl(totSai)}</td>
            <td className="r mono">{qtd(ultimo.qAcum)}</td><td className="r mono">{brl(ultimo.vAcum)}</td><td className="r mono">{brl(ultimo.cmedio)}</td>
          </tr></tfoot>}
          <tbody>
            {!insId ? <tr><td colSpan={10} className="empty"><b>Selecione um insumo para ver o extrato</b></td></tr>
              : (!movs.length && !abertura) ? <tr><td colSpan={10} className="empty"><b>Sem movimentações no período</b></td></tr>
              : <>
                {abertura && <tr style={{ background: '#f8fafc', fontStyle: 'italic' }}>
                  <td className="mono" style={{ color: '#94a3b8' }}>{de ? fmtData(de + 'T00:00:00') : '—'}</td>
                  <td className="c"><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#0369a1' }}>Abertura</span></td>
                  <td colSpan={5} style={{ color: '#94a3b8' }}>Saldo anterior ao período</td>
                  <td className="r mono" style={{ fontWeight: 600 }}>{qtd(abertura.qAcum)}</td>
                  <td className="r mono">{brl(abertura.vAcum)}</td>
                  <td className="r mono" style={{ fontWeight: 700, color: '#7c3aed' }}>{brl(abertura.cmedio)}</td>
                </tr>}
                {movs.map((m, i) => {
                  const isSaida = m.tipo === 'saida'
                  return (
                    <tr key={i}>
                      <td className="mono" style={{ color: '#334155', whiteSpace: 'nowrap' }}>{fmtData(m.data)}</td>
                      <td style={{ color: '#334155' }}>{isSaida ? 'Saída' : 'Entrada'}</td>
                      <td style={{ color: '#334155' }}>{m.desc}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{isSaida ? '−' : '+'}{qtd(m.qMov)}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{m.vUnit ? brl(m.vUnit) : '—'}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{m.vEntrada ? brl(m.vEntrada) : '—'}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{m.vSaida ? brl(m.vSaida) : '—'}</td>
                      <td className="r mono" style={{ color: '#334155', fontWeight: 600 }}>{qtd(m.qAcum)}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{brl(m.vAcum)}</td>
                      <td className="r mono" style={{ color: '#334155' }}>{brl(m.cmedio)}</td>
                    </tr>
                  )
                })}
              </>}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}
