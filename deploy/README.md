# deploy/

Tudo que descreve como o CRM Nexa roda em staging (e futuramente em prod).

## Topologia

```
                Internet ──HTTPS──> Traefik ──┬─> web  (Host=crm-dev.nexasource.com.br)
                                              └─> api  (Host=api.crm-dev.nexasource.com.br)
                                                  │
                       web ───http://api:3001─────┘   (overlay public_proxy)
                       api ─────────────────────────> Postgres/Redis (overlay infra_internal)
```

- **Cluster:** Docker Swarm em `cloud.nexasource.com.br`, gerenciado via Portainer.
- **Reverse proxy:** Traefik v3 com certresolver `le` (Let's Encrypt).
- **Networks externas (pré-existentes):**
  - `public_proxy` — overlay onde mora o Traefik
  - `infra_internal` — overlay onde mora Postgres/Redis/RabbitMQ

## Como deployar (pela primeira vez)

> **Importante:** existe ovo-e-galinha entre os 4 elementos (secrets do Swarm, stack do Portainer, imagens em ghcr.io, secrets do GitHub Actions). A ordem abaixo resolve sem retrabalho.

### Antes de fazer merge do PR `feat/cicd-deploy`

#### 1. Criar secrets no Swarm via Portainer

Portainer → **Secrets** → Add secret. Cada um, cole o valor real:

| Nome do secret | Conteúdo |
|---|---|
| `nexa_database_url` | URL de runtime (`postgresql://crm_app:...@host:port/db?...`) |
| `nexa_database_admin_url` | URL admin (`postgresql://crm_admin:...`) — usada por migrations |
| `nexa_jwt_access_secret` | 64 bytes hex (`openssl rand -hex 64`) |
| `nexa_jwt_refresh_secret` | 64 bytes hex |

> Os valores em `.env` local servem como referência mas **não devem ser reutilizados em prod** quando chegarmos lá.

#### 2. Configurar DNS (já feito)

A records apontando para o IP do Swarm:
- `crm-dev.nexasource.com.br`
- `api.crm-dev.nexasource.com.br`

Traefik gera Let's Encrypt automaticamente na primeira request HTTPS.

#### 3. Adicionar 1 secret no GitHub Actions

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Nome | Valor |
|---|---|
| `STAGING_DATABASE_ADMIN_URL` | mesma URL que está em `nexa_database_admin_url` |

(Os outros 2 secrets, `PORTAINER_WEBHOOK_API/WEB`, serão criados em **passo 6**.)

### Merge do PR

Push para `main` dispara o workflow `staging-deploy`. Esperado nesta primeira execução:

| Job | Esperado |
|---|---|
| `validate` | ✅ passa |
| `build-push` | ✅ primeiras imagens publicadas em `ghcr.io/abnermeirelles/crm-nexa-{api,web}:latest` e `:sha-<7>` |
| `migrate` | ✅ aplica migrations existentes (já estão em `dev`, sem mudanças neste PR) |
| `deploy` | ❌ **vai falhar** porque os webhooks do Portainer ainda não existem |

A falha de `deploy` é esperada — `validate`, `build-push` e `migrate` são o que precisamos antes do passo seguinte.

### Pós-merge (uma vez)

#### 4. Criar a stack no Portainer

Stacks → Add stack → **Repository**:
- Repository URL: `https://github.com/abnermeirelles/crm-nexa`
- Reference: `refs/heads/main`
- Compose path: `deploy/stack-staging.yml`
- Environment variables: nenhuma
- Stack name: `crm-nexa`
- Deploy

Portainer puxa o YAML do `main`, baixa as imagens `:latest` que já existem em ghcr.io (passo 4 do workflow as publicou), monta os secrets e sobe os serviços. Em ~30s, ambos devem ficar healthy.

**Smoke test manual:**

```bash
curl -fsSL https://api.crm-dev.nexasource.com.br/health   # deve dar 200 + {"status":"ok","db":"ok"}
curl -fsSI https://crm-dev.nexasource.com.br/login        # deve dar 200
```

#### 5. Gerar webhooks dos serviços

No Portainer, em cada serviço (`crm-nexa_api` e `crm-nexa_web`):
- Service Webhooks → **Create webhook** → copiar URL (formato `https://<portainer>/api/stacks/webhooks/<uuid>`)

#### 6. Adicionar 2 secrets no GitHub Actions

| Nome | Valor |
|---|---|
| `PORTAINER_WEBHOOK_API` | URL do webhook do serviço `api` |
| `PORTAINER_WEBHOOK_WEB` | URL do webhook do serviço `web` |

#### 7. Re-disparar o workflow para validar pipeline completo

GitHub → Actions → staging-deploy → Run workflow (manual via `workflow_dispatch`).

Agora os 4 jobs passam e o deploy vira 100% automatizado a partir do próximo push em `main`.

## Como deployar (depois do primeiro setup)

Push em `main` → GitHub Actions:
1. Lint + typecheck + build (PR ou push)
2. Build + push de imagens para `ghcr.io/abnermeirelles/crm-nexa-{api,web}:latest` e `:sha-<7>`
3. `prisma migrate deploy` contra o banco staging
4. POST nos webhooks do Portainer → ele puxa `:latest` e atualiza serviços
5. Smoke `/health` no domínio público

## Como rollback

Se o deploy quebrou, no Portainer:

1. Stacks → crm-nexa → cada serviço (api ou web)
2. Edit → trocar `image: ghcr.io/...:latest` por `image: ghcr.io/...:sha-<previous_7>`
3. Update service

(Tags `sha-<7>` ficam todas no ghcr.io — selecionar a anterior à que quebrou.)

## Como debugar

- **Logs em runtime:** Portainer → Containers → ver logs em real-time, OU `docker service logs -f crm-nexa_api` no host
- **Entrar no container:** Portainer → Containers → Console (sh)
- **Status do Traefik:** dashboard interno (rota privada da infra)

## Avaliação de segurança da imagem base

`docker scout cves` reporta CVEs HIGH em `gnutls28` (Debian bookworm) — **sem patch upstream ainda**. Avaliação:

- Node.js usa OpenSSL embutido, não gnutls. O pacote está presente como dep transitiva mas nosso processo não invoca.
- Risco prático para o app: nulo. CVEs são exploráveis apenas se atacante já tem RCE no container e força o processo a chamar gnutls — improvável e não é um vetor que a presença/ausência do CVE muda.
- Ação: rebuildar a base periodicamente (`docker pull node:22-bookworm-slim` antes do build) para pegar patches conforme Debian solta.

`picomatch` aparecia no scan como vulnerável (CVE-2026-33671, ReDoS) mas a versão real na imagem é 4.0.4 (patcheada). O scout estava lendo SBOM stale do attestation buildx — false positive.

## Arquivos

- `stack-staging.yml` — Compose v3 para Swarm
- `README.md` — este arquivo
- (futuro) `secrets.md` — procedimento detalhado de criação manual via CLI, se necessário
