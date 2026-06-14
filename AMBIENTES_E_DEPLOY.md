# Ambientes e Deploy — Sistema Aiko

> Como o sistema é publicado e como testar com segurança antes de afetar os clientes.

---

## Os ambientes hoje

| Ambiente | Branch (Git) | Deploy (Vercel) | Quem usa |
|----------|--------------|-----------------|----------|
| **Produção** | `main` (Vercel mostra "principal") | URL limpa: `rentabilidade-cardapio.vercel.app` | **Clientes** |
| **Staging / Pré-Visualização** | `preview-erp` | URL com código: `...-git-preview-erp-...` ou via Deployments → Visitar | **Só você (testes)** |

**Banco de dados (Supabase):** ⚠️ **um só, compartilhado** pelos dois ambientes (a chave está fixa em `utils.js`/`params.js` → `window.SUPA_URL`/`window.SUPA_KEY`).

---

## Fluxo seguro (REGRA)

```
1. Claude commita SÓ na preview-erp
2. Vercel atualiza só a Pré-Visualização (staging) — clientes NÃO veem
3. Você TESTA na URL de staging (login do tenant de teste "Ambiente de Testes")
4. Aprovou? → você diz "sobe" → merge na main (clientes recebem)
   Deu ruim? → conserta na preview-erp; produção intacta
   Emergência? → Vercel → deploy → "Reversão instantânea" (rollback da produção)
```

- **NUNCA** mergear na `main` sem o "OK" explícito do cliente (ver memória `feedback-workflow-branches`).
- Pra testar a versão mais nova: Vercel → **Deployments** → 1ª linha **"Pré-Visualização"** → `...` → **Visitar**.
- Promover sem merge: Vercel → deploy testado → **"Promover para a Produção"** (sobe o build exato testado).

### O que ESTE setup protege
- ✅ **Erro de código** → fica isolado no staging; só chega no cliente quando você aprova.
- ⚠️ **Mudança de BANCO** (rodar SQL, criar coluna) → afeta os dois, porque o banco é o mesmo. (Mitiga ~90% do risco; o resto é o passo futuro abaixo.)

---

## PASSO FUTURO — 2º Supabase (banco de staging separado) = isolamento TOTAL

**Por quê:** hoje uma mudança de banco no staging mexe no banco de produção (é o mesmo). Com um 2º Supabase só pra staging, você pode testar **qualquer coisa — inclusive migrações de banco — com ZERO risco** pros clientes.

**Quando fazer:** quando crescer (mais clientes), fizer mudanças de schema com frequência, ou quiser segurança total em migrações. NÃO é urgente — o staging de código já cobre o principal.

**Passo a passo (quando decidir):**
1. **Criar um 2º projeto Supabase** (pode ser plano **Free** — é só teste → provável custo zero). Esse é o **banco de staging**.
2. **Recriar o schema nele:** gerar o schema da produção com `pg_dump --schema-only` (ver `PROVISIONAR_CLIENTE.md` / item de robustez) e rodar no banco de staging — assim ele nasce com a mesma estrutura.
3. **Tornar a chave do Supabase configurável por ambiente:** hoje está fixa em `utils.js`/`params.js`. Mudar pra **ler de variável de ambiente** (Environment Variable do Vercel), em vez de hardcoded.
4. **No Vercel → Settings → Environment Variables:** definir `SUPA_URL`/`SUPA_KEY` diferentes por ambiente — **Production** = chaves do banco real; **Preview** = chaves do banco de staging.
5. **Semear dados de teste no staging:** copiar a produção periodicamente OU criar tenants de teste no banco de staging.
6. **Sincronizar schema ao promover:** toda mudança de estrutura testada no staging precisa ser **aplicada também na produção** quando subir (rodar o mesmo SQL nos dois). Versionar os SQLs no Git ajuda.

**Resumo do trade-off:**
| | Isolamento | Trabalho de manter |
|---|-----------|--------------------|
| Hoje (1 banco + staging de código) | Código ✅ / Banco ⚠️ | Baixo |
| 2 Supabase | Código ✅ / Banco ✅ (total) | Médio (2 bancos + sincronizar schema/dados) |

---

## Relacionado
- Regra de branches e o "não subir sem OK": memória `feedback-workflow-branches`
- Provisionar cliente novo / schema: `PROVISIONAR_CLIENTE.md`
- Backup automático (Supabase Pro): já ativo (ver `project-pendencias`)
