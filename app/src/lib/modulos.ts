import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

// Módulo Etiquetas ligado p/ o cliente? (Config › Parâmetros › Etiquetas › "Módulo ativo")
//  • parâmetro 'sim' → mostra · 'nao' → esconde
//  • sem parâmetro salvo → mostra só se o cliente já tem produto de etiqueta cadastrado
//    (quem já usa não perde o menu; quem nunca usou não vê um menu vazio)
export function useEtiquetasAtivo(tenantId?: string | null): boolean {
  const { data = false } = useQuery({
    queryKey: ['modulo-etiquetas-ativo', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data: p } = await supabase.from('parametros').select('valor').eq('tenant_id', tenantId).eq('modulo', 'etiquetas').eq('chave', 'modulo_ativo').limit(1)
      const v = p?.[0]?.valor as string | undefined
      if (v === 'sim') return true
      if (v === 'nao') return false
      const { data: it } = await supabase.from('etiqueta_itens').select('id').eq('tenant_id', tenantId).limit(1)
      return (it?.length ?? 0) > 0
    },
  })
  return data
}
