import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'

// RBAC — enforcement de "visualizar" por módulo (Fase 1). Modelo SEGURO ("só grupos configurados"):
//  • admin (role começa com 'admin')         → vê tudo (nunca trava)
//  • grupo SEM matriz de permissões           → vê tudo (como era antes)
//  • grupo COM matriz                         → só os módulos marcados como "visualizar"
// A matriz vem da tela Config › Permissões (tabela `permissoes`: perfil=nome do grupo, modulo, visualizar...).

type PermRow = { modulo: string; visualizar?: boolean }

// Mapa: cada tela (navKey) → módulo da matriz. Telas sem módulo aqui NÃO são controladas nesta fase
// (ex.: Fiscal e Distribuição ainda não estão na matriz → sempre visíveis). "Visão geral" (home) idem.
const KEY_MODULO: Record<string, string> = {
  'estoque/entradas': 'estoque', 'estoque/saidas': 'estoque', 'estoque/inventario': 'estoque',
  'estoque/saldo': 'estoque', 'estoque/movimentacao': 'estoque', 'estoque/kardex': 'estoque',
  'estoque/rel-entradas': 'relatorios', 'estoque/rel-consumo': 'relatorios', 'estoque/rel-custos': 'relatorios',
  'estoque/abc': 'relatorios', 'estoque/inflacao': 'relatorios', 'estoque/resumo': 'relatorios',
  'ajustes/estoque': 'ajustes', 'ajustes/custo': 'ajustes', 'ajustes/recalcular': 'ajustes',
  'compras/sugestao': 'compras', 'compras/cotacao': 'compras', 'compras/pedidos': 'compras',
  'insumos': 'insumos', 'produtos': 'insumos', 'fichas': 'fichas_tecnicas', 'fornecedores': 'fornecedores',
  'gestao/metas': 'relatorios', 'gestao/cmv': 'cmv', 'gestao/rendimentos': 'rendimento',
  'gestao/divergencias': 'cmv', 'gestao/fechamento': 'cmv',
  'pdv/faturamento': 'pdv', 'pdv/vendas-dia': 'pdv', 'pdv/abc': 'pdv', 'pdv/engenharia': 'pdv', 'pdv/importar': 'pdv',
  'pcp/planejamento': 'pcp', 'pcp/monitor': 'pcp', 'pcp/op': 'pcp', 'pcp/setores': 'pcp', 'pcp/calendario': 'pcp', 'pcp/atividades': 'pcp',
  'pcp/oporc': 'porcionamento', 'pcp/itens-porc': 'porcionamento',
  'config/geral': 'configuracoes', 'config/parametros': 'configuracoes',
}

export function usePerms() {
  const { usuario } = useAuth()
  const role = usuario?.role || usuario?.perfil || ''
  const isAdmin = role.toLowerCase().startsWith('admin')
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rbac-perms', usuario?.tenant_id, role],
    enabled: !!usuario?.tenant_id && !!role && !isAdmin,
    queryFn: async () => { const { data } = await supabase.from('permissoes').select('modulo,visualizar').eq('tenant_id', usuario!.tenant_id!).eq('perfil', role); return (data ?? []) as PermRow[] },
  })

  const vis = new Map(rows.map((r) => [r.modulo, r.visualizar === true]))
  const configurado = rows.length > 0   // "só grupos configurados": sem matriz = sem restrição

  // pode ver a tela? admin ou grupo não-configurado → sempre; tela sem módulo mapeado → sempre;
  // senão, depende do "visualizar" daquele módulo na matriz do grupo.
  const podeVer = (navKey: string): boolean => {
    if (isAdmin || !configurado) return true
    const mod = KEY_MODULO[navKey]
    if (!mod) return true
    return vis.get(mod) === true
  }

  return { podeVer, isAdmin, configurado, loading: isLoading }
}
