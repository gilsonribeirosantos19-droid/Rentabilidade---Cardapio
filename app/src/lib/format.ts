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
