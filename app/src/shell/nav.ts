// Estrutura de navegação (módulos → seções → telas). Espelha a sidebar aprovada.
// `key` identifica a tela (vira uma aba). Por enquanto só 'fornecedores' é real;
// o resto abre um Placeholder até ser migrado.

export type Leaf = { label: string; key: string }
export type Section = Leaf | { group: string; items: Leaf[] }
export type Module = { id: string; label: string; icon: string; home?: boolean; sections?: Section[]; requiresCd?: boolean }

export const MODULES: Module[] = [
  { id: 'inicio', label: 'Visão geral', icon: 'home', home: true },
  {
    id: 'estoque', label: 'Estoque', icon: 'box',
    sections: [
      { group: 'Lançamentos', items: [
        { label: 'Entradas', key: 'estoque/entradas' },
        { label: 'Saídas', key: 'estoque/saidas' },
        { label: 'Inventário', key: 'estoque/inventario' },
      ] },
      { group: 'Consultas', items: [
        { label: 'Saldo de Estoque', key: 'estoque/saldo' },
        { label: 'Movimentação', key: 'estoque/movimentacao' },
        { label: 'Kardex', key: 'estoque/kardex' },
      ] },
      { group: 'Relatórios', items: [
        { label: 'Histórico de Entradas', key: 'estoque/rel-entradas' },
        { label: 'Consumo de Insumos', key: 'estoque/rel-consumo' },
        { label: 'Histórico de Custos', key: 'estoque/rel-custos' },
      ] },
      { group: 'Análises', items: [
        { label: 'Curva ABC', key: 'estoque/abc' },
        { label: 'Inflação', key: 'estoque/inflacao' },
        { label: 'Resumo', key: 'estoque/resumo' },
      ] },
      { group: 'Ajustes', items: [
        { label: 'Ajuste de Estoque', key: 'ajustes/estoque' },
        { label: 'Ajuste de Custo Médio', key: 'ajustes/custo' },
        { label: 'Recalcular', key: 'ajustes/recalcular' },
      ] },
    ],
  },
  {
    id: 'compras', label: 'Compras', icon: 'cart',
    sections: [
      { label: 'Sugestão de Compras', key: 'compras/sugestao' },
      { label: 'Pedidos de Compra', key: 'compras/pedidos' },
    ],
  },
  {
    id: 'distribuicao', label: 'Distribuição', icon: 'truck', requiresCd: true,
    sections: [
      { label: 'Central de Distribuição', key: 'distribuicao/central' },
      { label: 'Nova Requisição', key: 'distribuicao/nova' },
      { label: 'Romaneios', key: 'distribuicao/romaneios' },
      { label: 'NF-e de Transferência', key: 'distribuicao/nfe' },
    ],
  },
  {
    id: 'fiscal', label: 'Fiscal', icon: 'nfe',
    sections: [
      { label: 'Monitor NF-e', key: 'fiscal/monitor' },
      { label: 'Entradas Processadas', key: 'fiscal/entradas' },
      { label: 'Auditoria de Conversão', key: 'fiscal/auditoria' },
      { label: 'Excluídas', key: 'fiscal/excluidas' },
    ],
  },
  {
    id: 'cadastros', label: 'Cadastros', icon: 'db',
    sections: [
      { label: 'Insumos', key: 'insumos' },
      { label: 'Produtos', key: 'produtos' },
      { label: 'Fichas Técnicas', key: 'fichas' },
      { label: 'Fornecedores', key: 'fornecedores' },
    ],
  },
  {
    id: 'gestao', label: 'Gestão', icon: 'chart',
    sections: [
      { label: 'CMV Teórico × Real', key: 'gestao/cmv' },
      { label: 'Rendimentos', key: 'gestao/rendimentos' },
      { label: 'Divergências', key: 'gestao/divergencias' },
      { label: 'Fechamento de Custo', key: 'gestao/fechamento' },
    ],
  },
  {
    id: 'pdv', label: 'PDV', icon: 'cart',
    sections: [
      { label: 'Faturamento', key: 'pdv/faturamento' },
      { label: 'Vendas por Dia', key: 'pdv/vendas-dia' },
      { label: 'Curva ABC', key: 'pdv/abc' },
      { label: 'Engenharia de Cardápio', key: 'pdv/engenharia' },
      { label: 'Recebimento de Vendas', key: 'pdv/importar' },
    ],
  },
  {
    id: 'producao', label: 'Produção', icon: 'chef',
    sections: [
      { group: 'Planejar', items: [
        { label: 'Planejamento da Produção', key: 'pcp/planejamento' },
        { label: 'Monitor de Produção', key: 'pcp/monitor' },
      ] },
      { group: 'Lançar', items: [
        { label: 'Ordem de Produção', key: 'pcp/op' },
        { label: 'Ordem de Porcionamento', key: 'pcp/oporc' },
      ] },
      { group: 'Cadastros', items: [
        { label: 'Item de Porcionamento', key: 'pcp/itens-porc' },
        { label: 'Setor de Produção', key: 'pcp/setores' },
        { label: 'Calendário de Produção', key: 'pcp/calendario' },
        { label: 'Atividades', key: 'pcp/atividades' },
      ] },
    ],
  },
  {
    id: 'config', label: 'Configurações', icon: 'gear',
    sections: [
      { label: 'Geral', key: 'config/geral' },
      { label: 'Usuários', key: 'config/usuarios' },
      { label: 'Permissões', key: 'config/permissoes' },
      { label: 'Parâmetros', key: 'config/parametros' },
    ],
  },
]

// Rótulo de uma tela pela key (p/ o título da aba).
export function labelForKey(key: string): string {
  for (const m of MODULES) {
    for (const s of m.sections ?? []) {
      if ('group' in s) {
        const hit = s.items.find((i) => i.key === key)
        if (hit) return hit.label
      } else if (s.key === key) {
        return s.label
      }
    }
  }
  return key
}

// Título longo/descritivo da tela (2º nível do breadcrumb no topo).
// Só as telas que TIRARAM o título de dentro do conteúdo entram aqui;
// as demais caem no labelForKey (breadcrumb de 1 nível só).
const TITLE_OVERRIDES: Record<string, string> = {
  'estoque/movimentacao': 'Movimentação de Estoque no Período',
  'estoque/saldo': 'Posição financeira por loja',
  'estoque/kardex': 'Extrato de movimentação por insumo',
  'fiscal/monitor': 'Notas fiscais recebidas',
  'fiscal/entradas': 'Histórico de NF-e confirmadas no estoque',
  'fiscal/auditoria': 'Fator de conversão nas entradas de NF-e',
  'fiscal/excluidas': 'NF-e removidas do Monitor (lixeira · 30 dias)',
  'distribuicao/central': 'Requisições das filiais ao Centro de Distribuição',
  'distribuicao/nova': 'Criar uma requisição de uma filial ao CD',
  'distribuicao/romaneios': 'Romaneios de separação e entrega',
  'distribuicao/nfe': 'NF-e de transferência entre CD e filiais',
}
export function titleForKey(key: string): string {
  return TITLE_OVERRIDES[key] ?? labelForKey(key)
}
