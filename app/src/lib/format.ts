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
