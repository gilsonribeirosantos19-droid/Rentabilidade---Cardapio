import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './monitorvendas.css'

// Monitor de ARQUIVOS de importação do PDV (espelha o Monitor de Transações do Everest).
// Comportamento: pré-lista TODOS os dias do período como "Não Recebido" (bolinha preta);
// quando o arquivo do dia chega (registro em `pdv_importacoes`), aquele dia vira
// Aguardando/Em Processamento/Processado/Com Erros. Rode pdv_importacoes.sql no Supabase.
// Os VALORES (faturamento/itens) NÃO ficam aqui — ficam na tela Vendas, que lê os arquivos processados.

type Situacao = 'com_erros' | 'nao_recebido' | 'aguardando' | 'em_processamento' | 'processado'
type ErroLinha = { erro: string; msg: string }
type ImpRow = { id: string; loja_id: string | null; pdv?: string; tipo?: string; data_movimento: string; arquivo?: string | null; situacao: Situacao; data_execucao?: string | null; data_integracao?: string | null; conteudo?: string | null; erros?: ErroLinha[] }
type Row = { id: string; situacao: Situacao; loja: string; pdv: string; tipo: string; dMovimento: string; arquivo: string; dExecucao: string; dIntegracao: string; conteudo: string; erros: ErroLinha[] }

const SIT_META: Record<Situacao, { nome: string; dot: string; pill: string }> = {
  com_erros: { nome: 'Com Erros', dot: '#ef4444', pill: 'p-err' },
  nao_recebido: { nome: 'Não Recebido', dot: '#111827', pill: 'p-naorec' },
  aguardando: { nome: 'Aguardando', dot: '#f59e0b', pill: 'p-pend' },
  em_processamento: { nome: 'Em Processamento', dot: '#3b82f6', pill: 'p-emproc' },
  processado: { nome: 'Processado', dot: '#16a34a', pill: 'p-proc' },
}
const ORDER: Situacao[] = ['com_erros', 'nao_recebido', 'aguardando', 'em_processamento', 'processado']

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const fmtDia = (iso: string) => iso.split('-').reverse().join('/')
const fmtTs = (ts?: string | null) => ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
function diasPeriodo(de: string, ate: string): string[] {
  const out: string[] = []
  let d = new Date(ate + 'T12:00:00'); const start = new Date(de + 'T12:00:00')
  let guard = 0
  while (d >= start && guard++ < 400) { out.push(d.toLocaleDateString('en-CA')); d = new Date(d.getTime() - 86400000) }
  return out
}

export function MonitorVendas() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const [de, setDe] = useState(mesInicio())
  const [ate, setAte] = useState(mesFim())
  const [lojaSel, setLojaSel] = useState('')
  const lojaAtual = lojaSel || lojas[0]?.id || ''
  const [chips, setChips] = useState<Set<Situacao>>(new Set(ORDER))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detId, setDetId] = useState<string | null>(null)
  const [verId, setVerId] = useState<string | null>(null)

  // arquivos já recebidos (tabela real). Enquanto a tabela não existir/estiver vazia → []
  const { data: imports = [] } = useQuery({
    queryKey: ['pdv-import', tenantId, de, ate], enabled: !!tenantId && !!de && !!ate,
    queryFn: async () => fetchAll<ImpRow>((f, t) => supabase.from('pdv_importacoes').select('*').eq('tenant_id', tenantId).gte('data_movimento', de).lte('data_movimento', ate).order('data_movimento', { ascending: false }).range(f, t)).catch(() => [] as ImpRow[]),
  })

  // monta as linhas: para cada loja × cada dia do período → registro recebido, senão "Não Recebido"
  const rows = useMemo<Row[]>(() => {
    const lojasShow = lojas.filter((l) => l.id === lojaAtual)
    const dias = diasPeriodo(de, ate)
    const byKey: Record<string, ImpRow> = {}
    imports.forEach((r) => { byKey[`${r.loja_id || ''}|${r.data_movimento}`] = r })
    const out: Row[] = []
    lojasShow.forEach((l) => dias.forEach((dia) => {
      const rec = byKey[`${l.id}|${dia}`]
      if (rec) out.push({ id: rec.id, situacao: rec.situacao, loja: l.nome, pdv: rec.pdv || '—', tipo: (rec.tipo || 'venda') === 'venda' ? 'Venda' : (rec.tipo || ''), dMovimento: fmtDia(dia), arquivo: rec.arquivo || '—', dExecucao: fmtTs(rec.data_execucao), dIntegracao: fmtTs(rec.data_integracao), conteudo: rec.conteudo || '', erros: rec.erros || [] })
      else out.push({ id: `${l.id}|${dia}`, situacao: 'nao_recebido', loja: l.nome, pdv: '—', tipo: 'Venda', dMovimento: fmtDia(dia), arquivo: '—', dExecucao: '—', dIntegracao: '—', conteudo: '', erros: [] })
    }))
    return out
  }, [imports, lojas, lojaAtual, de, ate])

  const cnt = useMemo(() => { const c = { com_erros: 0, nao_recebido: 0, aguardando: 0, em_processamento: 0, processado: 0 } as Record<Situacao, number>; rows.forEach((r) => { c[r.situacao]++ }); return c }, [rows])
  const lista = useMemo(() => rows.filter((r) => chips.has(r.situacao)), [rows, chips])

  const toggleChip = (s: Situacao) => setChips((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked = lista.length > 0 && lista.every((r) => sel.has(r.id))
  const toggleAll = (on: boolean) => setSel(on ? new Set(lista.map((r) => r.id)) : new Set())

  const det = detId ? rows.find((r) => r.id === detId) : null
  const ver = verId ? rows.find((r) => r.id === verId) : null
  const selRow = sel.size === 1 ? rows.find((r) => r.id === [...sel][0]) : null

  return (
    <div className="mvend-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <select className="field" value={lojaAtual} onChange={(e) => setLojaSel(e.target.value)} style={{ minWidth: 170 }}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="ds-field"><label>PDV</label><select className="field"><option>Todos</option><option>iComanda</option><option>Saipos</option><option>Aloha</option></select></div>
        <div className="ds-field"><label>Tipo</label><select className="field"><option>Venda</option><option>Financeiro</option></select></div>
        <div className="ds-field"><label>Período</label><input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-actions">
          <button className="btn-ghost">Limpar</button>
        </div>
      </div>

      <div className="kbar">
        <div className="it"><span className="k">Dias no período</span><span className="v">{rows.length}</span></div>
        <div className="it"><span className="k">Processados</span><span className="v ok">{cnt.processado}</span></div>
        <div className="it"><span className="k">Aguardando</span><span className="v">{cnt.aguardando}</span></div>
        <div className="it"><span className="k">Em processamento</span><span className="v">{cnt.em_processamento}</span></div>
        <div className="it"><span className="k">Com erros</span><span className="v err">{cnt.com_erros}</span></div>
        <div className="it"><span className="k">Não recebidos</span><span className="v" style={{ color: '#111827' }}>{cnt.nao_recebido}</span></div>
      </div>

      <div className="sit-row">
        {ORDER.map((s) => (
          <label key={s} className="sit-chip">
            <input type="checkbox" checked={chips.has(s)} onChange={() => toggleChip(s)} />
            <span className="dot" style={{ background: SIT_META[s].dot }} />
            {SIT_META[s].nome} <span className="cnt">({cnt[s]})</span>
          </label>
        ))}
        <span className="mock-tag">⚑ Aguardando integração do PDV — os dias entram como “Não Recebido” até o arquivo chegar</span>
      </div>

      <div className="card">
        <div className="toolbar">
          <button className="btn-ghost btn-sm">↻ Atualizar</button>
          <button className="btn-ghost btn-sm" disabled={!selRow?.conteudo} onClick={() => { if (selRow) setVerId(selRow.id) }}>👁 Visualizar arquivo</button>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 400px)' }}>
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="c">Situação</th><th>Loja</th><th>PDV</th><th>Tipo</th><th>D. Movimento</th><th>Arquivo</th><th>D. Execução</th><th>D. Integração</th><th className="c">Ver</th>
              </tr>
            </thead>
            <tbody>
              {!lista.length
                ? <tr><td colSpan={10} className="empty">{lojas.length ? 'Nenhum dia neste filtro.' : 'Carregando lojas…'}</td></tr>
                : lista.map((r) => {
                  const m = SIT_META[r.situacao]
                  return (
                    <tr key={r.id} className={(sel.has(r.id) ? 'sel ' : '') + (r.situacao === 'com_erros' ? 'err' : '')} onClick={() => setDetId(r.id)}>
                      <td className="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                      <td className="c"><span className="sit-dot" style={{ background: m.dot }} title={m.nome} /></td>
                      <td>{r.loja}</td>
                      <td>{r.pdv}</td>
                      <td>{r.tipo}</td>
                      <td>{r.dMovimento}</td>
                      <td><span className="arq" title={r.arquivo}>{r.arquivo}</span></td>
                      <td>{r.dExecucao}</td>
                      <td>{r.dIntegracao}</td>
                      <td className="c" onClick={(e) => e.stopPropagation()}>{r.conteudo ? <button className="ico-btn" title="Visualizar conteúdo" onClick={() => setVerId(r.id)}>👁</button> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag"><span>{lista.length} de {rows.length} dias</span><span>{sel.size} selecionado(s)</span></div>
      </div>

      <div className="det err-panel">
        <div className="h2">{det ? `Erros / Mensagens — ${det.loja} · ${det.dMovimento}` : 'Erros / Mensagens'}</div>
        {!det
          ? <div className="b-empty"><span className="i">i</span> Selecione um dia para ver os erros. Só os <b>Com Erros</b> (produto sem cadastro ou sem ficha) exigem ação.</div>
          : det.situacao === 'nao_recebido'
            ? <div className="b-empty"><span className="i" style={{ background: '#eef1f5', color: '#111827' }}>⚫</span> Arquivo de <b>{det.dMovimento}</b> ainda <b>não recebido</b> do PDV.</div>
            : det.erros.length === 0
              ? <div className="b-empty"><span className="i" style={{ background: '#ecfdf5', color: '#16a34a' }}>✓</span> Sem erros neste arquivo.</div>
              : (
                <table>
                  <thead><tr><th style={{ width: 170 }}>Erro</th><th>Mensagem</th></tr></thead>
                  <tbody>
                    {det.erros.map((e, i) => (
                      <tr key={i} className="err">
                        <td><span className={'pill ' + (/cadastro/i.test(e.erro) ? 'p-err' : /ficha/i.test(e.erro) ? 'p-pend' : 'p-naorec')}><span className="d" />{e.erro}</span></td>
                        <td className="msg">{e.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>

      <div className="footbar">
        <span style={{ fontSize: 12, color: '#64748b' }}>Monitor de arquivos do PDV · os valores (faturamento, itens) ficam na tela <b>Vendas</b>, que lê os arquivos processados</span>
        <div className="foot-r">
          <button className="btn-ghost" disabled={!selRow?.conteudo} onClick={() => { if (selRow) setVerId(selRow.id) }}>👁 Visualizar arquivo</button>
        </div>
      </div>

      {ver && (
        <div className="mv-ov" onClick={(e) => { if (e.target === e.currentTarget) setVerId(null) }}>
          <div className="mv-modal">
            <div className="h"><span className="t">{ver.arquivo}</span><button className="x" onClick={() => setVerId(null)}>✕</button></div>
            <pre>{ver.conteudo || '(arquivo não recebido — sem conteúdo)'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
