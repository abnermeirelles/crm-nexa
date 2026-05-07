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

### 1. Criar secrets no Swarm via Portainer

Em Portainer → Secrets → Add secret. Crie cada um e cole o valor real:

| Nome do secret | Conteúdo |
|---|---|
| `nexa_database_url` | URL de runtime (`postgresql://crm_app:...@host:port/db?...`) |
| `nexa_database_admin_url` | URL admin (`postgresql://crm_admin:...`) — usada por migrations |
| `nexa_jwt_access_secret` | 64 bytes hex (`openssl rand -hex 64`) |
| `nexa_jwt_refresh_secret` | 64 bytes hex |

> Os valores em `.env` local servem como referência mas **não devem ser reutilizados em prod** quando chegarmos lá.

### 2. Criar a stack no Portainer

Stacks → Add stack → **Repository**:
- Repository URL: `https://github.com/abnermeirelles/crm-nexa`
- Reference: `refs/heads/main`
- Compose path: `deploy/stack-staging.yml`
- Environment variables: nenhuma (todas vêm de secrets ou estão hardcoded)
- Stack name: `crm-nexa`

Após criar, em cada serviço (`api` e `web`):
- Service Webhooks → Create webhook → copiar URL
- Salvar como secrets do GitHub Actions: `PORTAINER_WEBHOOK_API` e `PORTAINER_WEBHOOK_WEB`

### 3. Configurar DNS

Apontar A records (já criados):
- `crm-dev.nexasource.com.br` → IP do Swarm
- `api.crm-dev.nexasource.com.br` → mesmo IP

Traefik gera os certificados Let's Encrypt automaticamente na primeira request HTTPS.

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
