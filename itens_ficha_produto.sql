-- ============================================================================
-- Permite que um item da ficha técnica seja um PRODUTO ACABADO (combinados que
-- usam outros produtos que já têm ficha própria). O item passa a ser OU um
-- insumo (insumo_id) OU um produto (produto_id).
-- Rodar no Supabase > SQL Editor.
-- ============================================================================
alter table public.itens_ficha alter column insumo_id drop not null;
alter table public.itens_ficha add column if not exists produto_id uuid references public.produtos(id);
