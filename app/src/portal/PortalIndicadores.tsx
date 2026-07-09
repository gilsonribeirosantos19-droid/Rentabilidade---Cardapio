import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Indicadores — o gerente lança os números MANUAIS do painel de TV
// (NPS, Google, Clube, CMV, R$/Peixe, R$/kg Camarão). Cada um com valor + meta.
// A meta do Clube é automática (50% da meta de faturamento) — não se digita aqui.

type Row = { indicador: string; valor?: number | null; meta?: number | null; atualizado_em?: string }

// tipo: brl (R$), num (inteiro), dec (decimal, ex nota), pct (%)
const INDS: { key: string; label: string; hint?: string; tipo: 'brl' | 'num' | 'dec' | 'pct'; metaAuto?: boolean; metaDefault?: number }[] = [
  { key: 'clube', label: 'Clube Sushi', hint: 'quanto já pontuou (R$) — meta = 50% da meta de faturamento', tipo: 'brl', metaAuto: true },
  { key: 'cmv', label: 'CMV', hint: '% do mês (menor é melhor)', tipo: 'pct', metaDefault: 30 },
  { key: 'nps', label: 'NPS', hint: 'de 0 a 100', tipo: 'num', metaDefault: 80 },
  { key: 'google_nota', label: 'Google — Nota', hint: 'ex.: 4,7', tipo: 'dec', metaDefault: 4.8 },
  { key: 'google_avaliacoes', label: 'Google — Avaliações no mês', hint: 'quantidade', tipo: 'num' },
  { key: 'peixe', label: 'R$ por Peixe', hint: 'faturamento por peixe', tipo: 'brl', metaDefault: 2000 },
  { key: 'camarao', label: 'R$ por kg de Camarão', hint: 'faturamento por kg', tipo: 'brl', metaDefault: 1200 },
]

const parseNum = (v: string) => parseFloat((v || '').replace(/\./g, '').replace(',', '.')) || 0
const toStr = (n?: number | null) => (n == null ? '' : String(n).replace('.', ','))
const fmtTs = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR') : '—'

export function PortalIndicadores() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()
  const [val, setVal] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 5000 : 2600) }

  const { data: rows = [] } = useQuery({ queryKey: ['pind', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('painel_indicadores').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Row[] } })
  const rowMap = useMemo(() => Object.fromEntries(rows.map((r) => [r.indicador, r])) as Record<string, Row>, [rows])
  const ultimo = useMemo(() => rows.map((r) => r.atualizado_em || '').sort().slice(-1)[0] || '', [rows])

  useEffect(() => {
    const v: Record<string, string> = {}, m: Record<string, string> = {}
    INDS.forEach((i) => { v[i.key] = toStr(rowMap[i.key]?.valor); m[i.key] = toStr(rowMap[i.key]?.meta ?? (rowMap[i.key] ? null : i.metaDefault)) })
    setVal(v); setMeta(m)
  }, [rowMap])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!lojaId) throw new Error('Sua conta não está ligada a uma loja.')
      const up = INDS.map((i) => ({ tenant_id: tenantId, loja_id: lojaId, indicador: i.key, valor: parseNum(val[i.key]) || null, meta: i.metaAuto ? null : (parseNum(meta[i.key]) || null), atualizado_em: new Date().toISOString() }))
      const { error } = await supabase.from('painel_indicadores').upsert(up, { onConflict: 'tenant_id,loja_id,indicador' }); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pind'] }); showToast('Indicadores salvos! O painel já atualiza.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const prefixo = (tipo: string) => tipo === 'brl' ? 'R$' : ''
  const sufixo = (tipo: string) => tipo === 'pct' ? '%' : ''

  return (
    <div>
      <div className="p-ttl">Indicadores do Painel</div>
      <div className="p-sub">Lance os números que aparecem no <b>painel de metas da TV</b>. Atualize quando quiser (ex.: 1x por dia/semana).</div>

      <div className="p-card" style={{ maxWidth: 720 }}>
        <table className="p-tbl">
          <thead><tr><th>Indicador</th><th style={{ width: 150 }}>Valor atual</th><th style={{ width: 150 }}>Meta</th></tr></thead>
          <tbody>
            {INDS.map((i) => (
              <tr key={i.key}>
                <td><div style={{ fontWeight: 600 }}>{i.label}</div>{i.hint && <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{i.hint}</div>}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {prefixo(i.tipo) && <span style={{ color: '#94a3b8', fontSize: 13 }}>{prefixo(i.tipo)}</span>}
                    <input className="p-field" style={{ width: 100, textAlign: 'right' }} value={val[i.key] ?? ''} onChange={(e) => setVal((s) => ({ ...s, [i.key]: e.target.value }))} placeholder="0" />
                    {sufixo(i.tipo) && <span style={{ color: '#94a3b8', fontSize: 13 }}>{sufixo(i.tipo)}</span>}
                  </div>
                </td>
                <td>
                  {i.metaAuto ? <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 600 }}>automática</span> : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {prefixo(i.tipo) && <span style={{ color: '#94a3b8', fontSize: 13 }}>{prefixo(i.tipo)}</span>}
                      <input className="p-field" style={{ width: 100, textAlign: 'right' }} value={meta[i.key] ?? ''} onChange={(e) => setMeta((s) => ({ ...s, [i.key]: e.target.value }))} placeholder="0" />
                      {sufixo(i.tipo) && <span style={{ color: '#94a3b8', fontSize: 13 }}>{sufixo(i.tipo)}</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Última atualização: {fmtTs(ultimo)}</span>
          <div style={{ marginLeft: 'auto' }} />
          <button className="p-btn p-btn-pri" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar indicadores'}</button>
        </div>
      </div>

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
