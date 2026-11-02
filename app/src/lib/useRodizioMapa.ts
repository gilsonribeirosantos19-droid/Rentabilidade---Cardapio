import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { normGrupo, type RodMapa } from './rodizio'

// Cadastro de rodízios (Cadastros › Rodízios): cabeça (código do PDV) → grupo de lançamento dos itens.
// Sem a tabela (SQL ainda não rodado) → mapa vazio (as telas seguem funcionando como antes).
export function useRodizioMapa(tenantId?: string | null) {
  return useQuery({
    queryKey: ['rodizio-mapa', tenantId], enabled: !!tenantId,
    queryFn: async (): Promise<RodMapa> => {
      const { data, error } = await supabase.from('rodizio_grupos').select('cabeca_codigo,grupo').eq('tenant_id', tenantId)
      if (error) return new Map()
      return new Map((data ?? []).map((r: { cabeca_codigo: string; grupo: string }) => [String(r.cabeca_codigo).trim(), normGrupo(r.grupo)]))
    },
  })
}
