# Como adicionar um CLIENTE NOVO (tenant) — Sistema Aiko

> Modelo: **base compartilhada**. Todos os clientes ficam no mesmo banco, separados por `tenant_id`, com RLS isolando os dados. O app descobre o tenant do usuário no login (`usuarios.tenant_id` → `localStorage.sb_tenant_id`). Mesmo código pra todos.

Onboardar um cliente = **4 passos** (~5 min). Tudo no Supabase.

---

## Passo 1 — Registrar o tenant + dados base (SQL Editor)

Gere um UUID novo pro cliente:
```sql
select gen_random_uuid();   -- copie o resultado, ex: 11111111-2222-3333-4444-555555555555
```

Abra o arquivo **`NOVO_TENANT_MIGRATION.sql`**, troque **`TENANT_ID_AQUI`** pelo UUID gerado e **`NOME_EMPRESA`** pelo nome do cliente (use "Localizar e substituir") e rode **o script inteiro** no SQL Editor.

Isso registra o tenant, garante as colunas das tabelas e cria os **dados base**: unidades de medida, categorias de insumo e a **loja principal**.

Confira:
```sql
select * from tenants where nome = 'NOME_EMPRESA';
select id, nome from lojas where tenant_id = 'UUID_DO_CLIENTE';
```

---

## Passo 2 — Criar o login do dono (Dashboard)

> O 1º usuário de um tenant é criado pelo **Dashboard** (a tela de usuários do app só funciona depois que já existe um admin desse tenant).

No Supabase: **Authentication → Users → Add user** → e-mail + senha do cliente → **Create user**. Copie o **User UID** que aparece.

---

## Passo 3 — Vincular o usuário ao tenant (SQL Editor)

```sql
insert into usuarios (id, tenant_id, nome, role, perfil, loja_id, ativo)
values (
  'USER_UID_DO_PASSO_2',
  'UUID_DO_CLIENTE',
  'Nome do Dono',
  'admin',          -- role: admin = acesso total
  'admin',          -- perfil
  (select id from lojas where tenant_id = 'UUID_DO_CLIENTE' limit 1),
  true
);
```
*(Se a tabela `usuarios` tiver coluna `email`, inclua `email` no insert também.)*

---

## Passo 4 — Testar

Faça login no app com o e-mail/senha do Passo 2. O cliente deve entrar e ver a **base dele, vazia** (só os dados base do Passo 1). Se aparecer dado de OUTRO cliente, **pare** — é falha de RLS (avisar pra investigar antes de seguir).

Pronto. A partir daí o próprio cliente (ou você) cadastra insumos, fichas, etc., e pode criar **mais usuários** pela tela **Configurações → Usuários** do app (essa já funciona dentro do tenant).

---

## Checklist rápido por cliente

- [ ] `select gen_random_uuid()` → UUID
- [ ] `NOVO_TENANT_MIGRATION.sql` com UUID + nome → rodar
- [ ] Dashboard → criar usuário auth → copiar UID
- [ ] `insert into usuarios (...)` com o UID + tenant
- [ ] Login de teste → vê base vazia, isolada

---

## ⚠️ Pendências de robustez (não bloqueiam o onboarding acima, mas importam)

1. **Schema versionado real:** o `NOVO_TENANT_MIGRATION.sql` é idempotente p/ a base ATUAL (tabelas/constraints já existem — 80 FKs no banco do Mori), mas **não recria o schema do zero** (não cria PKs/FKs/uniques nem algumas tabelas/colunas novas). Pra **base separada futura** ou **recuperação de desastre**, gerar o schema completo com `pg_dump --schema-only` (ou Supabase → Database → Backups/Export) e versionar no Git. — *ver AUDITORIA_2026-06.md §4*
2. **Confirmar RLS por tenant:** garantir que TODAS as tabelas têm policy de isolamento por `tenant_id` (o Passo 4 testa na prática).
