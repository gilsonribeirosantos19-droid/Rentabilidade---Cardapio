-- ── Lixeira de NF-e (aba "Excluídas" no Fiscal) ──────────────────────────────
-- Excluir uma nota no Monitor NÃO apaga de vez: marca excluida_em = agora.
-- Ela some do Monitor e aparece na aba "Excluídas" por 30 dias. Depois some sozinha
-- (purga automática), ou o usuário apaga de vez antes (botão "Excluir definitivo").

-- 1) Coluna de soft-delete (null = ativa; com data = na lixeira)
alter table public.nfe_recebidas add column if not exists excluida_em timestamptz;

-- índice p/ filtrar rápido as ativas (excluida_em is null) no Monitor
create index if not exists ix_nfe_recebidas_excluida_em on public.nfe_recebidas (tenant_id, excluida_em);

-- 2) Purga: apaga de vez o que está na lixeira há mais de 30 dias
--    (itens primeiro, depois o cabeçalho — respeita a FK)
create or replace function public.purgar_nfe_lixeira()
returns integer language plpgsql security definer as $$
declare
  n integer;
begin
  delete from public.nfe_itens i
   using public.nfe_recebidas r
   where i.nfe_id = r.id
     and r.excluida_em is not null
     and r.excluida_em < now() - interval '30 days';

  delete from public.nfe_recebidas
   where excluida_em is not null
     and excluida_em < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- 3) Agenda a purga todo dia às 4h (desagenda antes se já existir, p/ rodar 2x sem erro)
select cron.unschedule('purgar-nfe-lixeira') from cron.job where jobname = 'purgar-nfe-lixeira';
select cron.schedule('purgar-nfe-lixeira', '0 4 * * *', $$ select public.purgar_nfe_lixeira() $$);
