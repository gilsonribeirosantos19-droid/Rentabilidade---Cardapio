import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'

// RBAC — enforcement de "visualizar" por módulo (Fase 1). Modelo SEGURO ("só grupos configurados"):
//  • admin (role começa com 'admin')         → vê tudo (nunca trava)
//  • grupo SEM matriz de permissões           → vê tudo (como era antes)
//  • grupo COM matriz                         → só os módulos marcados como "visualizar"
// A matriz vem da tela Config › Permissões (tabela `permissoes`: perfil=nome do grupo, modulo, visualizar...).

type PermRow = { modulo: string; visualizar?: boolean; criar?: boolean; editar?: boolean; excluir?: boolean }

// A matriz (tela Config › Permissões) agora guarda uma linha POR TELA — `permissoes.modulo` = a key
// do menu (ex.: 'estoque/entradas'). O enforcement é 1:1: pode ver a tela = o visualizar daquela key.

export function usePerms() {
  const { usuario } = useAuth()
  const role = usuario?.role || usuario?.perfil || ''
  const isAdmin = role.toLowerCase().startsWith('admin')
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rbac-perms', usuario?.tenant_id, role],
    enabled: !!usuario?.tenant_id && !!role && !isAdmin,
    queryFn: async () => { const { data } = await supabase.from('permissoes').select('modulo,visualizar,criar,editar,excluir').eq('tenant_id', usuario!.tenant_id!).eq('perfil', role); return (data ?? []) as PermRow[] },
  })

  const byKey = new Map(rows.map((r) => [r.modulo, r]))
  const configurado = rows.length > 0   // "só grupos configurados": sem matriz = sem restrição

  // pode VER a tela? admin ou grupo não-configurado → sempre. Senão, "visualizar" daquela tela.
  // Tela que NÃO está na matriz salva (ex.: recém-criada) → não bloqueia.
  const podeVer = (navKey: string): boolean => {
    if (isAdmin || !configurado) return true
    const r = byKey.get(navKey)
    if (!r) return true
    return r.visualizar === true
  }

  // pode EDITAR (criar/editar/excluir)? Controle Total = sim; Somente Leitura = não.
  const podeEditar = (navKey: string): boolean => {
    if (isAdmin || !configurado) return true
    const r = byKey.get(navKey)
    if (!r) return true
    return r.criar === true || r.editar === true || r.excluir === true
  }

  return { podeVer, podeEditar, isAdmin, configurado, loading: isLoading }
}
