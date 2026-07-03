import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'

// Itens "produzíveis" do PCP = itens COM ficha (Produção) + itens de porcionamento
// cadastrados (Porcionamento). Usado por Planejamento, Calendário e Atividades.

export type ItemProd = { insumoId: string; nome: string; tipo: 'producao' | 'porcionamento'; fichaId?: string; unidade?: string }
type Ins = { id: string; nome?: string; unidade_medida?: string }

export function useItensProduziveis() {
  const { tenantId } = useAuth()
  const { data: fichas = [] } = useQuery({ queryKey: ['pcp-fichas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fichas_tecnicas').select('id,nome,insumo_vinculado_id').eq('tenant_id', tenantId).not('insumo_vinculado_id', 'is', null).order('nome'); return (data ?? []) as { id: string; nome?: string; insumo_vinculado_id?: string }[] } })
  const { data: itensPorc = [] } = useQuery({ queryKey: ['pcp-itensporc', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('itens_porcionamento').select('insumo_id').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as { insumo_id: string }[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['pcp-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId); return (data ?? []) as Ins[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Ins>, [insumos])

  const itens = useMemo(() => {
    const map = new Map<string, ItemProd>()
    fichas.forEach((f) => { if (f.insumo_vinculado_id) map.set(f.insumo_vinculado_id, { insumoId: f.insumo_vinculado_id, nome: f.nome || insMap[f.insumo_vinculado_id]?.nome || '—', tipo: 'producao', fichaId: f.id, unidade: insMap[f.insumo_vinculado_id]?.unidade_medida }) })
    itensPorc.forEach((it) => { if (!map.has(it.insumo_id)) map.set(it.insumo_id, { insumoId: it.insumo_id, nome: insMap[it.insumo_id]?.nome || '—', tipo: 'porcionamento', unidade: insMap[it.insumo_id]?.unidade_medida }) })
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [fichas, itensPorc, insMap])

  return { itens, insMap }
}
