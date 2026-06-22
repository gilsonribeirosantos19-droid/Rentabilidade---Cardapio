-- ============================================================================
-- Porcionamento: campos da planilha do salmão/camarão que faltavam.
--   caixas  -> Nº de caixas na ENTRADA (recebimento de salmão)
--   sobra   -> Sobra do dia na SAÍDA (salmão e camarão)
-- Rodar no Supabase > SQL Editor.
-- ============================================================================
alter table public.porcao_lancamentos add column if not exists caixas integer;
alter table public.porcao_lancamentos add column if not exists sobra numeric;
