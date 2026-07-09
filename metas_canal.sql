-- Metas por CANAL (Salão / Delivery / Balcão) — só quem separa usa; o resto fica 'total'.
-- O realizado por canal já vem do sync (icomanda_recebimento.por_canal).

-- 1) coluna canal (default 'total' = a loja inteira, comportamento atual)
alter table public.metas_semana add column if not exists canal text not null default 'total';

-- 2) a unicidade agora inclui o canal (senão não dá pra ter Salão + Delivery no mesmo dia)
alter table public.metas_semana drop constraint if exists metas_semana_tenant_id_loja_id_dia_semana_key;
alter table public.metas_semana add constraint metas_semana_uniq unique (tenant_id, loja_id, dia_semana, canal);
