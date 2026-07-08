import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './fiscal.css'

type Nfe = { id: string; numero?: string; serie?: string; nome_emitente?: string; data_emissao?: string; valor_total?: number; loja_id?: string | null; excluida_em?: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—'
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Dias que faltam até a purga automática (30 dias após a exclusão)
function diasRestantes(excluidaEm?: string): number {
  if (!excluidaEm) return 30
  const dias = Math.floor((Date.now() - new Date(excluidaEm).getTime()) / 86400000)
  return Math.max(0, 30 - dias)
}

export function NfeExcluidas() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [fLoja, setFLoja] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const { data: notas = [], isLoading, refetch } = useQuery({
    queryKey: ['nfe-excluidas', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Nfe>((f, t) => supabase.from('nfe_recebidas').select('*').eq('tenant_id', tenantId).not('excluida_em', 'is', null).order('excluida_em', { ascending: false }).range(f, t)),
  })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const lojaNome = (id?: string | null) => (id && lojaMap[id]) || '—'
  const lojaByNome = useMemo(() => Object.fromEntries(lojas.map((l) => [l.nome, l.id])) as Record<string, string>, [lojas])

  const lista = useMemo(() => {
    const b = norm(busca)
    return notas.filter((n) => {
      if (fLoja && n.loja_id !== fLoja) return false
      if (!b) return true
      return norm(n.numero).includes(b) || norm(n.nome_emitente).includes(b) || String(n.valor_total ?? '').replace('.', ',').includes(b.replace('.', ','))
    })
  }, [notas, busca, fLoja])

  const restaurar = async (n: Nfe) => {
    if (!confirm(`Restaurar a NF-e ${n.numero || ''} de ${n.nome_emitente || ''}? Ela volta para o Monitor.`)) return
    setBusy(true)
    try { const { error } = await supabase.from('nfe_recebidas').update({ excluida_em: null }).eq('id', n.id); if (error) throw error; await refetch(); qc.invalidateQueries({ queryKey: ['mon-nfe'] }); showToast('Nota restaurada para o Monitor.', 'ok') }
    catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }

  const excluirDefinitivo = async (n: Nfe) => {
    if (!confirm(`Excluir DEFINITIVAMENTE a NF-e ${n.numero || ''} de ${n.nome_emitente || ''}? Esta ação não pode ser desfeita.`)) return
    setBusy(true)
    try { await supabase.from('nfe_itens').delete().eq('nfe_id', n.id); const { error } = await supabase.from('nfe_recebidas').delete().eq('id', n.id); if (error) throw error; await refetch(); showToast('Nota excluída definitivamente.', 'ok') }
    catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">Excluídas</div><div className="fh-sub">Lixeira das NF-e — ficam 30 dias e depois somem sozinhas</div></div>
      </div>

      <div className="f1">
        {lojas.length > 1 && (
          <div className="ds-field"><label>Loja</label>
            <div style={{ minWidth: 200 }}><SearchSelect value={fLoja ? lojaNome(fLoja) : ''} options={lojas.map((l) => l.nome)} placeholder="Todas" onChange={(nm) => setFLoja(nm === 'Todas' ? '' : (lojaByNome[nm] || ''))} /></div>
          </div>
        )}
        <div className="ds-field"><label>Buscar</label>
          <input className="field" style={{ minWidth: 240 }} placeholder="Nº da NF, valor ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto' }}><button className="btn-g" onClick={() => { setBusca(''); setFLoja('') }}>▽ Limpar filtros</button></div>
      </div>

      <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th>Fornecedor / Razão Social</th><th>Loja</th><th>DANFE</th><th className="c">Série</th><th>D. Emissão</th><th className="r">V. Total</th><th>Excluída em</th><th className="c">Expira</th><th className="c" style={{ width: 150 }}>Ações</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="empty">Carregando…</td></tr>
              : lista.length === 0 ? <tr><td colSpan={9} className="empty">A lixeira está vazia.</td></tr>
                : lista.map((n) => {
                  const dias = diasRestantes(n.excluida_em)
                  return (
                    <tr key={n.id}>
                      <td className="fornec" style={{ fontWeight: 600 }}>{n.nome_emitente || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{lojaNome(n.loja_id)}</td>
                      <td className="mono">{n.numero || '—'}</td>
                      <td className="c mono" style={{ color: '#64748b' }}>{n.serie || '—'}</td>
                      <td>{fmtD(n.data_emissao)}</td>
                      <td className="r mono">{brl(n.valor_total)}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{fmtD(n.excluida_em)}</td>
                      <td className="c" style={{ fontSize: 12, fontWeight: 600, color: dias <= 5 ? '#dc2626' : '#94a3b8' }}>{dias === 0 ? 'hoje' : `${dias}d`}</td>
                      <td className="c">
                        <button className="cor-ico" title="Restaurar para o Monitor" disabled={busy} onClick={() => restaurar(n)}>↩️</button>
                        <button className="cor-ico del" title="Excluir definitivamente" disabled={busy} onClick={() => excluirDefinitivo(n)}>🗑️</button>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div></div>

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
