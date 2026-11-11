// Fonte única de formatação de moeda — mata as ~38 cópias divergentes de `brl` que estavam
// espaldadas pelas telas (dívida A10/M12 da auditoria). Migração INCREMENTAL e SEM mudar
// comportamento: cada tela importa a variante equivalente à que ela já tinha (com alias `as brl`,
// então as chamadas continuam iguais). As 3 variantes cobrem os 3 grupos de comportamento que
// já existiam de fato no código.

// Padrão: "R$ 1.234,56". null / vazio / NaN → travessão. Zero → "R$ 0,00".
// (grupo mais comum: (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString(...))
export function brl(v?: number | null): string {
  if (v == null || (v as any) === '' || Number.isNaN(Number(v))) return '—'
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Igual ao brl, mas ZERO também vira travessão. Usado nas telas de estoque onde 0 = "sem valor"
// (Compras, Entradas, Saidas, SaldoEstoque).
export function brlDash(v?: number | null): string {
  if (v == null || Number.isNaN(Number(v)) || Number(v) === 0) return '—'
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Só o número "1.234,56" (sem o prefixo "R$ "). Usado nas telas de Vendas
// (FaturamentoVendas, MonitorVendas, VendasDiario), onde o "R$" já vem no cabeçalho da coluna.
export function brlNum(v?: number | null): string {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Igual ao brl, mas null/0/inválido → "R$ 0,00" (nunca travessão). Telas que sempre mostram um
// valor numérico (CmvTeoricoReal, Fechamento, VinculosPane).
export function brlZero(v?: number | null): string {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Estilo "currency" nativo do Intl ("R$ 1.234,56" com o espaço estreito do locale). Mantido à parte
// do brl padrão porque o caractere de espaço difere. null → travessão.
// (FichasTecnicas, Insumos, FichaModal, Produtos.)
export function brlCur(v?: number | null): string {
  return v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Parse de campo de texto → número: aceita vírgula decimal do pt-BR, vazio/inválido = 0.
// (mata a cópia idêntica de `num` espalhada em ~10 telas de entrada/produção.)
// OBS: não confundir com o `num` FORMATADOR (número→texto) de Divergencias/VinculosPane — outra função.
export const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0

// Quantidade DIGITADA no padrão brasileiro → número (null = vazio/inválido).
// Vírgula = decimal, ponto = milhar: "1.550" = 1550 · "1,55" = 1,55 · "2.650,5" = 2650,5.
// Sem vírgula, ponto só é milhar se vier em grupos de 3 ("1.550", "12.300.000"); senão é decimal ("1.5").
// Usar junto com fmtQtdBR ao carregar valor salvo no campo (String(2.125) = "2.125" seria lido como 2125!).
export function parseQtdBR(v?: string | null): number | null {
  let s = String(v ?? '').replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
// Número → texto de campo no padrão BR (até 3 casas): 1550 → "1.550" · 1.55 → "1,55". Ida e volta com parseQtdBR.
export const fmtQtdBR = (n?: number | null) => (n == null || !Number.isFinite(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }))

// Escapa HTML — SEMPRE usar ao interpolar texto vindo de DADO (nome de insumo, fornecedor, loja,
// razão social, endereço, descrição de NF-e do fornecedor) dentro de uma string HTML (geradores de
// PDF/impressão via document.write) ou em `dangerouslySetInnerHTML`. Sem isso = XSS armazenado:
// um nome como `<img src=x onerror=...>` roda script no contexto do app e rouba o token de sessão.
// Fonte única — substitui as cópias de `esc`/`_esc` (danfe, FichasTecnicas, PortalSolicitacao).
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
  ))
}
