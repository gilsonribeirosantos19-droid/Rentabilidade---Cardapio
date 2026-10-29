import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import { buildQrItems, EtqPrintArea, applyFormato, type LojaFull, type PrintData } from './etqLabel'
import './etiquetas.css'

type Row = {
  id: string; codigo: string; nome_snap: string; grupo_snap?: string | null; modo: string
  quantidade?: number | null; unidade?: string | null; loja_id?: string | null
  manipulacao_em: string; validade_em: string; val_original?: string | null
  lote?: string | null; marca_forn?: string | null; sif?: string | null; responsavel_nome?: string | null
  status: string; motivo_descarte?: string | null; baixado_em?: string | null; created_at?: string
}

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Resfriado', congelado: 'Congelado', ambiente: 'Temp. Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function situacao(e: Row): { label: string; cls: string; bucket: string } {
  if (e.status === 'utilizada') return { label: 'Utilizada', cls: 'baixada', bucket: 'utilizada' }
  if (e.status === 'descartada') return { label: 'Descartada', cls: 'baixada', bucket: 'descartada' }
  if (e.status === 'cancelada') return { label: 'Cancelada', cls: 'baixada', bucket: 'cancelada' }
  const v = new Date(e.validade_em).getTime(), now = Date.now()
  if (v < now) return { label: 'Vencida', cls: 'vd', bucket: 'vd' }
  if (v < now + 24 * 3600_000) return { label: 'Vence em breve', cls: 'venc', bucket: 'venc' }
  return { label: 'OK', cls: 'ok', bucket: 'ok' }
}

export function EtiquetasLista({ lojaId }: { lojaId: string | null }) {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('etiquetas/lista')
  const { toast, showToast } = useToastTipo(2600)
  const [busca, setBusca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fSit, setFSit] = useState('')
  const [fModo, setFModo] = useState('')
  const [fResp, setFResp] = useState('')
  const [printData, setPrintData] = useState<PrintData>(null)

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['etq-lista', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Row>((f, t) => supabase.from('etiquetas').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).order('id').range(f, t)),
  })
  const { data: lojasFull = [] } = useQuery({ queryKey: ['etq-lojas-full', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId); return (data ?? []) as LojaFull[] } })

  const gruposDistintos = useMemo(() => [...new Set(lista.map((r) => r.grupo_snap).filter(Boolean) as string[])].sort(), [lista])
  const respsDistintos = useMemo(() => [...new Set(lista.map((r) => r.responsavel_nome).filter(Boolean) as string[])].sort(), [lista])
  const modosDistintos = useMemo(() => [...new Set(lista.map((r) => r.modo).filter(Boolean))].sort(), [lista])

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((r) => {
      if (lojaId && r.loja_id !== lojaId) return false
      if (q && !(`${r.codigo} ${r.nome_snap}`.toLowerCase().includes(q))) return false
      if (fGrupo && (r.grupo_snap || '') !== fGrupo) return false
      if (fModo && r.modo !== fModo) return false
      if (fResp && (r.responsavel_nome || '') !== fResp) return false
      if (fSit && situacao(r).bucket !== fSit) return false
      return true
    })
  }, [lista, busca, fGrupo, fModo, fResp, fSit, lojaId])

  async function reimprimir(r: Row) {
    try {
      const loja = lojasFull.find((l) => l.id === r.loja_id) || null
      const items = await buildQrItems([r])
      setPrintData({ loja, items })
      await supabase.rpc('registrar_reimpressao', { p_etiqueta_id: r.id })
      setTimeout(() => { applyFormato(); window.print(); setTimeout(() => setPrintData(null), 500) }, 120)
    } catch (e) { showToast('Erro: ' + (e as Error).message, 'err') }
  }

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Etiquetas emitidas</h1>
        <span className="sub">Todas as etiquetas geradas — filtre por grupo/situação e reimprima</span>
      </div>

      <div className="etq-toolbar">
        <div className="etq-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar código ou produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="etq-sel" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}>
          <option value="">Todos os grupos</option>
          {gruposDistintos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="etq-sel" value={fModo} onChange={(e) => setFModo(e.target.value)}>
          <option value="">Todos os estados</option>
          {modosDistintos.map((m) => <option key={m} value={m}>{MODO_LABEL[m] || m}</option>)}
        </select>
        <select className="etq-sel" value={fResp} onChange={(e) => setFResp(e.target.value)}>
          <option value="">Todos responsáveis</option>
          {respsDistintos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="etq-sel" value={fSit} onChange={(e) => setFSit(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Todas situações</option>
          <option value="ok">OK</option>
          <option value="venc">Vence em breve</option>
          <option value="vd">Vencida</option>
          <option value="utilizada">Utilizada</option>
          <option value="descartada">Descartada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      <div className="etq-card">
        <table className="etq-tbl">
          <thead><tr><th>Código</th><th>Produto</th><th>Grupo</th><th>Modo</th><th>Manipulação</th><th>Validade</th><th>Situação</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="etq-empty">Carregando…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} className="etq-empty">Nenhuma etiqueta encontrada.</td></tr>
              : rows.slice(0, 500).map((r) => {
                const s = situacao(r)
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "'Roboto Condensed', monospace", fontWeight: 600 }}>{r.codigo}</td>
                    <td>{r.nome_snap}</td>
                    <td style={{ color: '#64748b' }}>{r.grupo_snap || '—'}</td>
                    <td style={{ color: '#64748b' }}>{MODO_LABEL[r.modo] || r.modo}</td>
                    <td style={{ color: '#64748b' }}>{fmtDT(r.manipulacao_em)}</td>
                    <td style={{ color: s.cls === 'vd' ? '#be123c' : s.cls === 'venc' ? '#b45309' : '#1e293b' }}>{fmtDT(r.validade_em)}</td>
                    <td><span className={'etq-sit ' + s.cls}>{s.label}</span></td>
                    <td className="r">{canEdit && r.status !== 'cancelada' && <button className="etq-btn etq-btn-sm" onClick={() => reimprimir(r)}>Reimprimir</button>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="etq-hint" style={{ marginTop: 10 }}>{rows.length} etiqueta(s){rows.length > 500 ? ' (mostrando as 500 mais recentes)' : ''}. A baixa é feita na aba “Baixa”.</div>

      <EtqPrintArea data={printData} />
      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
