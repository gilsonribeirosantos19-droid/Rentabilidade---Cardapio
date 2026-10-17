-- Hub da rede (/portal): coluna que guarda em quais sistemas a pessoa foi provisionada.
-- O hub usa isso pra mostrar só os cards dos sistemas que ela tem acesso.
--  • null  = usuário antigo (nunca passou pelo provisionamento) -> hub mostra TODOS (fallback seguro)
--  • []    = provisionado sem nenhum sistema extra -> hub mostra só Estoque
--  • ['avaliacoes','checklist'] = mostra Estoque + esses
-- Rodar no Supabase do AIKO.
alter table public.usuarios add column if not exists sistemas_rede text[];
