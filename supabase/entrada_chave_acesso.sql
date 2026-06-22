-- ============================================================================
-- Identificador ÚNICO da NF-e na entrada de estoque.
-- numero/serie NÃO é único entre fornecedores diferentes (ex.: dois fornecedores
-- podem ter a nota 727/1). A chave de acesso (44 dígitos) é única globalmente.
-- Passamos a guardar a chave na entrada para a trava anti-duplicação e o estorno
-- agirem na nota CERTA, sem colisão.
-- Rodar no Supabase > SQL Editor.
-- ============================================================================
alter table public.entradas_estoque add column if not exists chave_acesso text;
create index if not exists ix_entradas_chave on public.entradas_estoque (tenant_id, chave_acesso);
