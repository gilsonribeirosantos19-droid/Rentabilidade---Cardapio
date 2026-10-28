-- =====================================================================
-- ETIQUETAS · grant p/ gerenciar operadores pela tela de Configurações
-- Permite ao app ATIVAR/DESATIVAR e DESBLOQUEAR operadores (colunas seguras).
-- O pin_hash continua SEM grant de update (só muda via RPC salvar_operador,
-- com bcrypt). RLS tenant_policy segue valendo (cada tenant só o seu).
-- Rodar no SQL Editor (ref trczpnjidqfippbfxtpe).
-- =====================================================================
grant update (ativo, tentativas, bloqueado_ate) on public.operadores to authenticated;
