import { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from '../lib/loja'
import './faturamento.css'

// Faturamento — grade DETALHADA de vendas por item (modelo Everest "Vendas").
// TELA MOCK: dados de exemplo. Quando o PDV (iComanda/Saipos) estiver processando
// os arquivos (ver Monitor de Vendas), esta tela passa a ler os itens de venda reais.

type Venda = { id: string; data: string; loja: string; atendente: string; item: string; grupo: string; qtd: number; vTotal: number; vDesc: number; vUnit: number; cancelado: boolean }

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => { const g = new Date(iso + 'T12:00:00').getDay(); return `${g + 1}-${DOW[g]}` }
const fmtData = (iso: string) => iso.split('-').reverse().join('/')

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const MOCK: Venda[] = [
  { id: '1', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '032 - COMBO HOT G', grupo: 'G-COMBINADOS', qtd: 1, vTotal: 134.90, vDesc: 0, vUnit: 134.90, cancelado: false },
  { id: '2', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '074 - RODÍZIO DO MAR', grupo: 'G-RODIZIO DO MAR', qtd: 2, vTotal: 135.80, vDesc: 53.80, vUnit: 67.90, cancelado: false },
  { id: '3', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '078 - RODÍZIO SUSHI ANIVERSARIANTE', grupo: 'G-RODIZIO DE SUSHI', qtd: 1, vTotal: 81.90, vDesc: 32.40, vUnit: 81.90, cancelado: false },
  { id: '4', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '099 - TAÇA DE OREO - ANIVERSARIANTE', grupo: 'G-SOBREMESAS', qtd: 1, vTotal: 27.90, vDesc: 11.05, vUnit: 27.90, cancelado: false },
  { id: '5', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '93 - YAKISSOBA CARNE E FRANGO', grupo: 'G-YAKISOBA', qtd: 1, vTotal: 34.90, vDesc: 11.38, vUnit: 34.90, cancelado: false },
  { id: '6', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'REFRI. COCA ZERO LATA', grupo: 'G-BEBIDAS', qtd: 3, vTotal: 23.70, vDesc: 9.39, vUnit: 7.90, cancelado: false },
  { id: '7', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'REFRI. FANTA UVA LATA', grupo: 'G-BEBIDAS', qtd: 1, vTotal: 7.90, vDesc: 3.13, vUnit: 7.90, cancelado: false },
  { id: '8', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'SUCO DE LARANJA', grupo: 'G-SUCO NATURAL', qtd: 1, vTotal: 10.90, vDesc: 0, vUnit: 10.90, cancelado: false },
  { id: '9', data: '2026-06-01', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: 'SUCO MARACUJA', grupo: 'G-SUCO NATURAL', qtd: 1, vTotal: 14.90, vDesc: 0, vUnit: 14.90, cancelado: false },
  { id: '10', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '010 - HOT BOLL', grupo: 'G-ENTRADAS', qtd: 1, vTotal: 32.90, vDesc: 13.16, vUnit: 32.90, cancelado: false },
  { id: '11', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '121 - TEMAKI HOT SALMÃO FLY', grupo: 'G-TEMAKI', qtd: 1, vTotal: 37.90, vDesc: 15.16, vUnit: 37.90, cancelado: false },
  { id: '12', data: '2026-06-07', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '33 - URAMAKI SUSHIZÃO', grupo: 'G-URAMAKI', qtd: 1, vTotal: 41.90, vDesc: 16.76, vUnit: 41.90, cancelado: false },
  { id: '13', data: '2026-06-13', loja: 'Sushi Distrito', atendente: 'Josiane', item: '(RS) 56 - HOT PHILADÉLFIA', grupo: 'G-RODIZIO DE SUSHI', qtd: 17, vTotal: 0, vDesc: 0, vUnit: 0, cancelado: false },
  { id: '14', data: '2026-06-13', loja: 'Sushi Distrito', atendente: 'Josiane', item: '(RS) 62 - HOT MORANGO NUT', grupo: 'G-RODIZIO DE SUSHI', qtd: 1, vTotal: 0, vDesc: 0, vUnit: 0, cancelado: false },
  { id: '15', data: '2026-06-14', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '02 - TEMAKI PHILADÉLFIA', grupo: 'G-TEMAKI', qtd: 1, vTotal: 34.90, vDesc: 10.64, vUnit: 34.90, cancelado: false },
  { id: '16', data: '2026-06-14', loja: 'Sushi Ponta Negra', atendente: 'Ana Carolina', item: '19 - TEMAKI HOT PHILADÉLFIA', grupo: 'G-TEMAKI', qtd: 1, vTotal: 37.90, vDesc: 0, vUnit: 37.90, cancelado: true },
]

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }

export function FaturamentoVendas() {
  const { lojas } = useLoja()
  const [de, setDe] = useState('2026-06-01')
  const [ate, setAte] = useState('2026-06-30')
  const [busca, setBusca] = useState('')
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.nome))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? [...lojaSet][0] : `${lojaSet.size} lojas`
  const toggleLoja = (n: string) => setLojaSet((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.nome)))

  const setPeriodo = (tipo: string) => {
    const d = new Date()
    if (tipo === 'mes_atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (tipo === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
  }

  const lista = useMemo(() => {
    const q = norm(busca.trim())
    const filtraLoja = lojaSet.size > 0 && !allSel
    return MOCK.filter((v) => {
      if (v.data < de || v.data > ate) return false
      if (filtraLoja && !lojaSet.has(v.loja)) return false
      if (q && !norm([v.item, v.grupo, v.atendente, v.loja].join(' ')).includes(q)) return false
      return true
    })
  }, [de, ate, busca, lojaSet, allSel])

  const tot = useMemo(() => lista.reduce((a, v) => ({ qtd: a.qtd + v.qtd, vTotal: a.vTotal + v.vTotal, vDesc: a.vDesc + v.vDesc, vUnit: a.vUnit + v.vUnit }), { qtd: 0, vTotal: 0, vDesc: 0, vUnit: 0 }), [lista])

  return (
    <div className="fatv-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <div className="ms">
            <button className="ms-btn" onClick={() => setLojaOpen((o) => !o)}>{lojaLabel}<span style={{ color: '#94a3b8' }}>▾</span></button>
            {lojaOpen && <>
              <div className="ms-back" onClick={() => setLojaOpen(false)} />
              <div className="ms-pop">
                <label className="ms-opt"><input type="checkbox" checked={allSel} onChange={toggleTodas} /><b>Todas as lojas</b></label>
                <div className="ms-sep" />
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.nome)} onChange={() => toggleLoja(l.nome)} />{l.nome}</label>)}
              </div>
            </>}
          </div>
        </div>
        <div className="ds-field"><label>Período</label>
          <select className="field" defaultValue="periodo" onChange={(e) => setPeriodo(e.target.value)} style={{ minWidth: 130 }}>
            <option value="periodo">Personalizado</option>
            <option value="mes_atual">Mês Atual</option>
            <option value="mes_anterior">Mês Anterior</option>
          </select>
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-actions"><button className="btn-ghost">↓ Exportar</button></div>
      </div>

      <input className="search" placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="grp-hint">Arraste um cabeçalho de coluna aqui para agrupar por essa coluna
        <span className="mock-tag">⚑ Dados de exemplo — lê as vendas reais quando o PDV estiver processando</span>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th>D. Movimento</th><th>Loja</th><th>Atendente</th><th>Dia Semana</th><th>Descrição Item PDV</th><th>Grupo</th>
              <th className="r">Q. Item</th><th className="r">V. Total</th><th className="r">V. Desconto</th><th className="r">V. Unitário</th><th className="c">Cancelado</th>
            </tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={11} className="empty">Nenhum item de venda no filtro.</td></tr>
              : lista.map((v) => (
                <tr key={v.id}>
                  <td>{fmtData(v.data)}</td>
                  <td>{v.loja}</td>
                  <td>{v.atendente}</td>
                  <td>{diaSemana(v.data)}</td>
                  <td>{v.item}</td>
                  <td className="grp">{v.grupo}</td>
                  <td className="r">{qtd(v.qtd)}</td>
                  <td className="r">{brl(v.vTotal)}</td>
                  <td className="r">{brl(v.vDesc)}</td>
                  <td className="r">{brl(v.vUnit)}</td>
                  <td className={'c' + (v.cancelado ? ' canc-sim' : '')}>{v.cancelado ? 'SIM' : 'NÃO'}</td>
                </tr>
              ))}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>
              <td className="l">{lista.length} itens</td><td /><td /><td /><td /><td />
              <td>{qtd(tot.qtd)}</td><td>{brl(tot.vTotal)}</td><td>{brl(tot.vDesc)}</td><td>{brl(tot.vUnit)}</td><td />
            </tr>
          </tfoot>}
        </table>
      </div>
    </div>
  )
}
