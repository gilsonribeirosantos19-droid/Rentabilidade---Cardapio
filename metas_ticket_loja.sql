-- Metas — a meta de ticket médio é POR LOJA (cada loja tem a sua).
-- Guarda no cadastro da loja (igual is_cd). O painel de Metas compara o ticket de cada
-- loja contra este valor.
alter table public.lojas add column if not exists meta_ticket numeric;
