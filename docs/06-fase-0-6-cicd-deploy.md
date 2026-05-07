# 06 — Fase 0.6: CI/CD + Primeiro Deploy

> **Duração estimada:** 2 a 3 dias (solo dev)
> **Pré-requisitos:** Fases 0.4 e 0.5 concluídas (API e Web rodando localmente).
> **Última atualização:** 2026-05-07
> **Status:** Pendente — não iniciada

---

## 1. Objetivo

No fim da Fase 0.6, o sistema deve ter:

- ✅ `Dockerfile` produção-grade para `apps/api` e `apps/web` (multi-stage, non-root, imagem mínima)
- ✅ `deploy/stack-staging.yml` descrevendo o stack do Docker Swarm (services + Traefik labels + secrets refs)
- ✅ Imagens publicadas em **`ghcr.io/abnermeirelles/crm-nexa-api`** e **`...-web`**
- ✅ Workflow do **GitHub Actions** que em push para `main`:
  1. Roda lint + typecheck + build (gates de qualidade)
  2. Buida imagens Docker e faz push para ghcr.io
  3. Roda `prisma migrate deploy` contra o banco de staging
  4. Faz `docker stack deploy` no Swarm via SSH
- ✅ **Docker Swarm secrets** populados (DATABASE_URL, JWT_*, S3_*, etc.) — app lê de `/run/secrets/<name>` ou via env vars derivados
- ✅ Domínios em staging com cert TLS (Let's Encrypt via Traefik):
  - `https://crm-dev.nexasource.com.br` → web (Next.js)
  - `https://api.crm-dev.nexasource.com.br` → API (NestJS)
- ✅ E2E smoke test no domínio público: login real funcionando

**Critério de "feito":**

```
1. Push para main na branch principal
2. Action executa: lint → build → push → migrate → deploy
3. Visitar https://crm-dev.nexasource.com.br → /login carrega via HTTPS
4. Login com owner@nexa.dev / dev123! → redireciona para /dashboard
5. /dashboard mostra user + tenant via /me
6. Logout limpa cookies e volta para /login
7. Cookies marcados como Secure+httpOnly+SameSite=Lax (Secure=true em prod)
```

---

## 2. Sub-fases

A Fase 0.6 é dividida em 5 sub-sub-fases sequenciais.

### Sub-fase 0.6.A — Dockerfiles + smoke local (0.5 dia)

**Saída:** imagens build localmente, container roda e serve as rotas.

- `apps/api/Dockerfile` multi-stage (deps → build → runtime):
  - Stage 1 (`deps`): instala dependências de produção via `pnpm install --frozen-lockfile --prod=false` (precisa de devDeps para build)
  - Stage 2 (`build`): roda `prisma generate`, `nest build`, builda `@crm-nexa/shared`
  - Stage 3 (`runtime`): node:22-alpine, copia apenas `dist/` + `node_modules` de prod + `prisma/`. User `node` (não root). Expõe :3001. CMD `node dist/main.js`
  - HEALTHCHECK aponta para `/health`
- `apps/web/Dockerfile` multi-stage com **Next.js standalone output**:
  - `next.config.ts` ganha `output: 'standalone'`
  - Stage de runtime copia `.next/standalone`, `.next/static`, `public/`. User non-root. Expõe :3000.
  - HEALTHCHECK contra `/`
- `.dockerignore` em cada app (descarta `node_modules`, `.next`, `.git`, `dist/.tsbuildinfo`, etc.)
- `compose.local.yml` na raiz — só para validar que as imagens sobem juntas localmente (NÃO substitui o `pnpm dev`)
- Smoke local: `docker compose -f compose.local.yml up --build` → curl `:3001/health` e `:3000/`

### Sub-fase 0.6.B — Stack file para Swarm + Traefik labels (0.5 dia)

**Saída:** `deploy/stack-staging.yml` descrevendo o que vai rodar no Swarm.

- Services:
  - `api`: imagem `ghcr.io/abnermeirelles/crm-nexa-api:${TAG}`, replicas 1, secrets refs, healthcheck
  - `web`: imagem `ghcr.io/abnermeirelles/crm-nexa-web:${TAG}`, replicas 1, secrets refs, healthcheck
- Traefik labels (assumindo Traefik v3 já configurado no Swarm):
  - api: `Host(\`api.crm-dev.nexasource.com.br\`)` → port 3001, certresolver letsencrypt
  - web: `Host(\`crm-dev.nexasource.com.br\`)` → port 3000, certresolver letsencrypt
- Restart policy: `on-failure`, max_attempts: 3, delay: 30s
- Resource limits modestos (api: 256M/0.5 cpu; web: 256M/0.5 cpu) — ajustável depois
- Network: `traefik` (overlay externa pré-existente) + uma network interna `crm-nexa` para api↔web (futuro)
- Secrets references: `DATABASE_URL`, `DATABASE_ADMIN_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `S3_*`, etc.

### Sub-fase 0.6.C — GitHub Actions workflow (1 dia)

**Saída:** `.github/workflows/staging-deploy.yml` automatiza tudo a partir do push.

Estrutura do workflow:

```yaml
name: staging-deploy
on:
  push:
    branches: [main]
  workflow_dispatch:  # permite trigger manual também

jobs:
  validate:        # gates de qualidade
    - pnpm install
    - pnpm typecheck
    - pnpm lint
    - pnpm build (turbo, com cache)
  build-push:
    needs: validate
    - login ghcr.io
    - build apps/api → push (tags: latest, sha-<sha>, sha-<sha7>)
    - build apps/web → push (mesmas tags)
  migrate:
    needs: build-push
    - pnpm install (sem deps de runtime — apenas database package + tsx)
    - DATABASE_ADMIN_URL=${{ secrets.STAGING_DATABASE_ADMIN_URL }} pnpm prisma migrate deploy
  deploy:
    needs: migrate
    - SSH para o Swarm host (chave em secrets)
    - export TAG=sha-<sha7>
    - docker stack deploy -c stack-staging.yml crm-nexa --with-registry-auth
    - aguarda servico estabilizar (curl /health no host)
```

Secrets do GitHub Actions necessários:
- `SSH_PRIVATE_KEY` — chave para SSH no Swarm host
- `SSH_HOST`, `SSH_USER`
- `STAGING_DATABASE_ADMIN_URL` — para migrations
- `GHCR_TOKEN` (ou usar `GITHUB_TOKEN` com `packages: write` permission)

PR validation: workflow secundário em `pull_request` que roda só `validate` (sem deploy).

### Sub-fase 0.6.D — Secrets management no Swarm (0.5 dia)

**Saída:** secrets criados no Swarm, app consome de `/run/secrets/<name>`.

- Documentar em `deploy/secrets.md` o procedimento de criação inicial:
  ```bash
  echo -n '<value>' | docker secret create nexa_database_url -
  echo -n '<value>' | docker secret create nexa_database_admin_url -
  echo -n '<value>' | docker secret create nexa_jwt_access_secret -
  echo -n '<value>' | docker secret create nexa_jwt_refresh_secret -
  ...
  ```
- App API: `apps/api/src/config/configuration.ts` ganha helper `readSecret(name)` que tenta `/run/secrets/<name>` primeiro, fallback para `process.env`. Mantém compatibilidade com dev local (que usa `.env`).
- App Web: middleware e server actions também precisam de `API_BASE_URL` — não é secret crítico, fica em env. Cookies usam secret para HMAC futuro (não há em 0.5).
- Rotação: documentar que `docker secret create` é imutável; rotacionar = criar novo nome, atualizar stack, remover antigo.

### Sub-fase 0.6.E — DNS + primeiro deploy + smoke E2E + docs (0.5 dia)

**Saída:** sistema rodando em staging, smoke E2E ok, docs atualizadas.

- Configurar DNS no provedor:
  - `crm-dev.nexasource.com.br` A → IP do Swarm host (mesmo do `cloud.nexasource.com.br`)
  - `api.crm-dev.nexasource.com.br` A → mesmo IP
- Traefik gera Let's Encrypt automaticamente na primeira request HTTPS
- Trigger primeiro deploy (push para main ou manual)
- Smoke tests:
  - `curl https://api.crm-dev.nexasource.com.br/health` → 200 ok
  - `curl https://crm-dev.nexasource.com.br/` → 200 (landing renderiza)
  - Browser: login real com `owner@nexa.dev` / `dev123!` → /dashboard funciona
  - DevTools: cookies marcados `Secure` (porque HTTPS)
- Atualizar `docs/03` marca 0.6 ✅, este doc com histórico §10
- Atualizar `CLAUDE.md` (estado da implementação + URLs de staging)
- Abrir PR `feat/cicd-deploy`

---

## 3. Stack adicional para 0.6

| Pacote / Tooling | Função |
|---|---|
| Docker (Engine + Buildx) | Build de imagens multi-arch |
| `docker/build-push-action` | Action oficial para build+push |
| `docker/login-action` | Login em ghcr.io |
| `appleboy/ssh-action` (ou similar) | SSH no Swarm host |
| Next.js `output: 'standalone'` | Reduz imagem web de ~500MB para ~150MB |
| Next.js `outputFileTracing` | Inclui apenas deps usadas no standalone |

---

## 4. Decisões importantes da fase

### 4.1 Por que ghcr.io e não Docker Hub

- Hub limita 1 imagem privada grátis; já temos 2 (api + web)
- ghcr.io está incluído no plano do GitHub e suporta auth via Action token (`${{ secrets.GITHUB_TOKEN }}`)
- Imagens em `ghcr.io/abnermeirelles/crm-nexa-{api,web}` ficam visíveis junto ao repo

### 4.2 Por que SSH + `docker stack deploy` e não Watchtower/auto-pull

- Controle explícito: o CI sabe quando o deploy aconteceu, pode falhar o pipeline em problema
- Migrations precisam rodar **antes** do app — Watchtower não dá esse controle
- Mais fácil adicionar gates (manual approval, smoke test) no futuro

### 4.3 Por que Docker Swarm secrets e não env vars

- Secrets ficam encriptados em repouso no Swarm (raft store)
- `docker inspect` não vaza valores
- Permite rotação sem expor histórico no stack file
- Padrão de ops para Swarm

### 4.4 Por que migrations no CI e não no app startup

- Race condition entre múltiplas réplicas: cada uma tentaria rodar migrations em paralelo
- Falha de migration deve **bloquear** o deploy, não derrubar a API com migration parcial
- CI roda uma vez, falha early, não chega a fazer push da imagem ruim

### 4.5 Subdomínio dedicado para a API

- Cookies httpOnly podem ser scoped a `.crm-dev.nexasource.com.br` (cobre tanto web quanto api se um dia precisarmos)
- CORS fica explícito (web → api é cross-origin no staging)
- Logs por subdomínio no Traefik facilitam debug

### 4.6 Configuração de CORS na API

- A API NestJS hoje **não habilita CORS** (não foi necessário em dev mesmo-origin via proxy do Next).
- Em staging, a web em `crm-dev.*` chama a API em `api.crm-dev.*` cross-origin via Server Actions (server-side fetch, não browser fetch). **Server-side fetch não está sujeito a CORS**, então CORS continua não sendo necessário.
- Se algum dia a web fizer fetch direto do browser para a API (não está nos planos), aí sim habilitamos CORS com origin allowlist explícita.

---

## 5. Estrutura de diretórios após 0.6

```
.github/
  workflows/
    staging-deploy.yml          ← push to main → build → migrate → deploy
    pr-validate.yml             ← pull_request → typecheck + lint + build
apps/
  api/
    Dockerfile
    .dockerignore
  web/
    Dockerfile
    .dockerignore
    next.config.ts              ← output: 'standalone'
deploy/
  stack-staging.yml             ← Docker Swarm stack
  secrets.md                    ← procedimento de criação
  README.md                     ← como deploy manual / debugar
compose.local.yml               ← validar imagens localmente
```

---

## 6. Convenções de código

- **Imagens taggeadas com `sha-<7>` + `latest`** — sha permite rollback determinístico, latest facilita debug local
- **Stack file declarativo** — qualquer mudança de infra passa por commit em `deploy/stack-staging.yml`
- **Secrets nunca commitados** — somente `secrets.md` documenta o procedimento; valores reais ficam no Swarm
- **Health checks reais** — `/health` na API faz `SELECT 1` (já implementado); web precisa de algo equivalente
- **Logs em stdout/stderr** — Pino já faz isso; Swarm captura via `docker service logs`

---

## 7. Riscos e mitigações da fase

| Risco | Mitigação |
|---|---|
| Deploy quebra sem rollback | Tag por sha permite `docker service update --image <previous-sha>`. Documentar comando em `deploy/README.md`. |
| Migration falha mid-way | Prisma migrate deploy é transacional por migration; falha aborta o deploy antes da nova imagem subir |
| TLS cert demora pra emitir (rate limit Let's Encrypt) | Primeiro deploy: usar staging endpoint do LE; depois trocar pra prod. Ou aproveitar config existente do Traefik no Swarm |
| Swarm fica sem recursos (RAM/CPU) | Resource limits no stack; alertar se aproxima do total. Posterior: adicionar mais nó ao Swarm |
| Secret vazado em log | Pino redact já cobre; verificar que `docker service logs` não tem var dump |
| Deploy auto em main quebra staging por merge ruim | Workflow `pr-validate` reduz; ainda assim, manter `workflow_dispatch` para rollback rápido |

---

## 8. Definição de "Fase 0.6 concluída"

- [ ] `apps/api/Dockerfile` e `apps/web/Dockerfile` buildam localmente sem warning
- [ ] `compose.local.yml` sobe ambos os containers e responde nos endpoints
- [ ] `deploy/stack-staging.yml` validado com `docker stack config -c stack-staging.yml`
- [ ] Secrets criados no Swarm (lista em `deploy/secrets.md`)
- [ ] DNS apontando para o Swarm host
- [ ] Workflow do GitHub Actions com 4 jobs (validate, build-push, migrate, deploy) verde no primeiro push
- [ ] `https://api.crm-dev.nexasource.com.br/health` → 200 com cert válido
- [ ] `https://crm-dev.nexasource.com.br/login` carrega
- [ ] Login real no browser funciona com cookies `Secure`
- [ ] PR aberto, mergeado, branch limpa
- [ ] `docs/03` marca 0.6 ✅, este doc atualizado com §10
- [ ] CLAUDE.md atualizado com URLs de staging

---

## 9. O que NÃO entra na Fase 0.6

Para evitar escopo inflado:

- **Domínio de produção** — staging primeiro; prod entra junto com primeiro cliente pago
- **Replicação multi-node** — 1 réplica de cada serviço basta nesta fase
- **Backup automatizado off-site** — mencionado em pendências da 0.3, vai antes do beta
- **Rollback automático em falha de health check** — manual via `docker service update --image`
- **Prometheus/Grafana** — observability vai numa fase dedicada
- **Log aggregation (Loki/ELK)** — `docker service logs` cobre por enquanto
- **Rate limiting global** — adicionar antes do beta (importante mas não bloqueador)
- **CDN para assets do Next.js** — Traefik serve direto; Cloudflare/etc fica para prod
- **Secrets rotation automatizado** — manual via `docker secret` por enquanto
- **PR previews (deploy de cada PR num namespace)** — luxury feature, pós-MVP
