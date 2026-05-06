# 01 — Arquitetura do Sistema

> **Projeto:** CRM Nexa — Plataforma de CRM e Mídias Sociais
> **Modalidade:** SaaS comercial multi-tenant
> **Versão deste documento:** 1.0 (rascunho inicial)
> **Última atualização:** 2026-05-02
> **Autor / Owner:** Abner Meirelles
> **Status:** Em definição — sujeito a revisão antes do início da Fase 0

---

## 1. Visão Geral

O Nexa é um CRM multi-tenant focado em pequenas e médias empresas de varejo (e-commerce, drogarias, agências de marketing). O diferencial declarado é **precificação acessível** via aproveitamento de integrações com serviços mais baratos que os concorrentes (RD Station, HubSpot, ActiveCampaign, Mautic).

### 1.1 Capacidades por módulo

| Módulo | Capacidades principais | Fase |
|---|---|---|
| **Contatos** | CRUD, campos personalizados, etiquetas, segmentos dinâmicos, importação CSV, webhooks de entrada | 1 (MVP) |
| **Integrações** | Vault de credenciais por tenant para APIs externas | 2 (MVP) |
| **Campanhas — E-mail** | Templates editáveis, variáveis, disparo segmentado via SendGrid | 3 (MVP) |
| **Campanhas — SMS** | Disparo via Comtele | 4 |
| **Campanhas — WhatsApp** | API oficial Meta (Cloud API) com templates aprovados | 5 |
| **Pipeline / Funil** | Kanban de oportunidades com etapas customizáveis | 6 |
| **Automações** | Engine próprio de workflows ("se X, então Y") com builder visual nativo | 7 |
| **Agenda de Postagens** | Instagram/Facebook (Graph API), WhatsApp Status (Evolution API) | 8 |
| **Anúncios Meta Ads** | Relatórios e (futuramente) criação de campanhas | 9 |
| **IA opcional** | Geração de texto, classificação de contatos | 10 |
| **Atendimento** | Caixa unificada multi-canal — integração com Chatwoot | 11 |

### 1.2 Escala alvo (12 meses)

- **5 tenants ativos** projetados
- Até 1M contatos por tenant (expectativa do cliente maior: rede de drogarias)
- Pico de disparo estimado: 100k e-mails / hora durante campanhas

**Clientes iniciais (validação interna):** o projeto começa com duas empresas do grupo onde o owner já trabalha:
1. **Drogaria** — não usa CRM hoje; expectativa de migrar/ingerir base e crescer até ~1M contatos.
2. **Loja de varejo** — base ativa de ~70 mil contatos.

Esses dois primeiros tenants funcionam como ambiente real de validação antes de abrir comercialmente para terceiros.

---

## 2. Stack Tecnológica

### 2.1 Decisão final

| Camada | Tecnologia | Versão alvo |
|---|---|---|
| Backend | NestJS (Node.js + TypeScript) | Node 20 LTS, NestJS 10+ |
| ORM | Prisma | 5.x |
| Frontend | Next.js + React + TypeScript | Next 14 (App Router) |
| UI | Tailwind CSS + shadcn/ui | — |
| Banco principal | PostgreSQL + pgvector | 17 |
| Cache + Filas | Redis + BullMQ | Redis 7 |
| Eventos cross-módulo | RabbitMQ | 3.12+ |
| Storage de mídia | MinIO (S3-compatível) | self-hosted |
| Reverse proxy / TLS | Traefik | self-hosted |
| Auth | Auth.js (NextAuth) + JWT | — |
| Motor de automação | Engine próprio (NestJS + workers BullMQ + DSL JSON) | Fase 7 |
| Observabilidade | Sentry + Loki + Grafana | self-hosted |
| Deploy | Docker Swarm (já existente) | — |

### 2.2 Justificativas-chave

**NestJS + TypeScript no backend:**
- Modular por design — bate com o desenho em módulos do produto
- Mesma linguagem (TypeScript) entre back e front reduz custo cognitivo de troca de contexto sendo solo dev
- Decorators tornam multi-tenancy via `@CurrentTenant()` simples de aplicar uniformemente
- Ecossistema robusto de filas (BullMQ), validação (class-validator) e OpenAPI

**Next.js no frontend:**
- App Router com Server Components reduz bundle do cliente
- SSR ajuda em telas pesadas de listagem (contatos, relatórios)
- Roteamento e auth resolvidos por convenção

**Postgres 17 + pgvector + Prisma:**
- Postgres já está provisionado no Docker Swarm (versão 17 com pgvector instalado)
- JSONB nativo resolve campos personalizados sem tabela EAV (que seria desastre em 1M de contatos)
- Row-Level Security (RLS) elimina classe inteira de bugs de vazamento entre tenants
- Full-text search nativo (com extensão `pg_trgm`) cobre busca de contato sem Elasticsearch
- **pgvector** disponibiliza busca por similaridade semântica — usado nas features de IA opcionais (busca semântica de contatos, classificação por embedding, deduplicação inteligente). Sem dependência de banco vetorial separado.
- Prisma reduz boilerplate; type-safety end-to-end com TypeScript

**Redis + BullMQ:**
- Redis já está provisionado
- BullMQ suporta jobs agendados, retentativas com backoff exponencial, rate limit e prioridade — exatamente o que campanhas precisam
- Mais simples que orquestrar via RabbitMQ para casos de fila

**RabbitMQ para eventos:**
- Já provisionado
- Padrão pub/sub para eventos de domínio: `contato.criado`, `campanha.enviada`, etc.
- Permite desacoplar módulos (timeline e automações escutam eventos sem o emissor saber)

**Engine de automação próprio (NestJS):**
- Decisão revisada após análise de UX: usuário final do SaaS (marketing manager de drogaria, e-commerce, agência) não vai usar n8n — ferramenta é técnica demais
- Engine próprio garante UX consistente, vocabulário do domínio (contato, etiqueta, segmento) e diferencial competitivo claro contra concorrentes
- MVP comercial sai SEM automações; engine entra na **Fase 7**, pós-MVP
- Escopo enxuto inicial: gatilhos de domínio, ações nativas (e-mail/SMS/WhatsApp/etiqueta/campo), delays, ramificação if/else. **Não tenta clonar n8n.**
- Persistência: definição em JSONB versionado; execução: workers BullMQ com BullMQ Flows para workflows com dependências
- Trade-off aceito: +6 a 8 semanas de desenvolvimento em troca de produto coeso e independência operacional

**MinIO em vez de AWS S3:**
- Sem custo de egress (importante para mídias de campanha)
- Mantém todos os dados sob seu controle (favorável a LGPD)
- Trade-off: backup off-site é responsabilidade sua

---

## 3. Estratégia Multi-Tenant

### 3.1 Modelo escolhido: **Pool (banco único, schema único, isolamento por linha)**

Todas as tabelas de domínio têm coluna `tenant_id UUID NOT NULL` com índice. Isolamento garantido por **Row-Level Security (RLS)** do Postgres.

### 3.2 Por que não outras estratégias

| Modelo | Descartado porque |
|---|---|
| Database por tenant | 15 bancos no MVP é gerenciável, mas migrations e backups multiplicam. Cresce mal. |
| Schema por tenant | Mesma dor de migrations × N. Postgres tem limite prático de ~milhares de schemas. |
| Pool com filtro só na aplicação | Um único `WHERE tenant_id` esquecido vaza dados entre tenants. RLS no banco é defesa em profundidade obrigatória. |

### 3.3 Como funciona na prática

1. Cada request autenticada injeta `tenant_id` no contexto da sessão Postgres via `SET app.current_tenant_id = '<uuid>'`.
2. Toda tabela com dados de tenant tem política RLS:
   ```sql
   CREATE POLICY tenant_isolation ON contacts
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   ```
3. Mesmo um bug em query da aplicação não consegue retornar dados de outro tenant — o banco filtra.
4. Operações administrativas (cross-tenant) usam role separada com `BYPASSRLS`.

### 3.4 Identificação do tenant no request

- **Subdomínio:** `acme.crmnexa.com.br` → tenant `acme`
- **Header alternativo:** `X-Tenant-Slug` (para chamadas API server-to-server)
- **JWT:** o token carrega `tenant_id` e é a fonte de verdade — subdomínio só serve para roteamento de UI

---

## 4. Componentes e Comunicação

### 4.1 Diagrama lógico

```
                        ┌─────────────────────────┐
                        │   Cliente (Browser)     │
                        └───────────┬─────────────┘
                                    │ HTTPS
                            ┌───────▼────────┐
                            │    Traefik     │  (TLS, roteamento)
                            └───┬────────┬───┘
                                │        │
                ┌───────────────▼─┐    ┌─▼──────────────┐
                │   Next.js (UI)  │    │  NestJS (API)  │
                │   App Router    │◄──►│  REST + WS     │
                └─────────────────┘    └───┬────┬───┬───┘
                                           │    │   │
                              ┌────────────┘    │   └──────────┐
                              │                 │              │
                       ┌──────▼──────┐   ┌──────▼──────┐  ┌────▼─────┐
                       │ PostgreSQL  │   │   Redis     │  │ RabbitMQ │
                       │ (RLS)       │   │ + BullMQ    │  │ (events) │
                       └─────────────┘   └─────────────┘  └────┬─────┘
                                                               │
                              ┌────────────────────────────────┤
                              │                                │
                       ┌──────▼──────┐                  ┌──────▼──────────┐
                       │   Workers   │                  │ Automation      │
                       │  (NestJS)   │                  │ Engine (NestJS) │
                       └──────┬──────┘                  └─────────────────┘
                              │
              ┌───────────────┼───────────────┬────────────┬─────────────┐
              │               │               │            │             │
        ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐ ┌────▼────┐  ┌─────▼──────┐
        │ SendGrid  │  │   Comtele   │  │ WhatsApp  │ │  Meta   │  │  Evolution │
        │  (email)  │  │    (SMS)    │  │ Cloud API │ │ Graph   │  │    API     │
        └───────────┘  └─────────────┘  └───────────┘ └─────────┘  └────────────┘
```

### 4.2 Tipos de processo

| Processo | Função | Escala horizontal |
|---|---|---|
| **API (NestJS)** | Atende HTTP/WS do front, valida, persiste, emite eventos | Sim (stateless) |
| **Worker (NestJS)** | Consome filas BullMQ: envio de campanhas, importação CSV, sincronização Meta | Sim |
| **Scheduler** | Cron interno: processar agendamentos, recálculo de segmentos dinâmicos, expiração de tokens | 1 instância (lock distribuído via Redis) |
| **Event Listener** | Consome RabbitMQ e gera entradas de timeline + dispara automações | Sim |

API e Worker compartilham o mesmo monorepo NestJS, ativados por flag de inicialização.

---

## 5. Padrões Arquiteturais

### 5.1 Estrutura do monorepo

```
/apps
  /api          → NestJS (HTTP + Workers)
  /web          → Next.js
/packages
  /database     → Prisma schema + migrations + seeds
  /shared       → tipos compartilhados, validadores Zod, utils
  /ui           → componentes shadcn customizados (se necessário)
```

Gerenciador: **pnpm workspaces** + **Turborepo** para build/cache.

### 5.2 Organização interna do backend

Cada módulo de domínio segue:

```
/src/modules/contacts
  /contacts.module.ts
  /contacts.controller.ts        → HTTP
  /contacts.service.ts           → orquestração
  /contacts.repository.ts        → acesso ao Prisma
  /dto/                          → request/response com class-validator
  /events/                       → emissores e listeners de RabbitMQ
  /jobs/                         → processadores BullMQ
  /policies/                     → regras de autorização
```

### 5.3 Camadas e responsabilidades

- **Controller:** valida DTO, extrai contexto (tenant, user), delega ao service. Sem lógica de negócio.
- **Service:** lógica de domínio, orquestra repository e eventos. Não conhece HTTP.
- **Repository:** única camada que toca Prisma. Facilita testes e troca futura de ORM.
- **Policies:** regras de autorização (tenant tem acesso? user tem permissão?). Aplicadas no service, nunca no controller.

---

## 6. Segurança

### 6.1 Autenticação e autorização

- **Autenticação:** Auth.js no Next; tokens JWT assinados (HS256 ou RS256 conforme escolha) com TTL curto + refresh token rotativo.
- **MFA:** TOTP (Google Authenticator) opcional por usuário, **obrigatório para roles admin**.
- **Autorização:** RBAC em três níveis:
  - **Sistema** (global): superadmin (você)
  - **Tenant**: owner, admin, manager, agent, viewer
  - **Recurso**: regras finas (ex.: "agent só vê contatos atribuídos a ele")
- Toda checagem passa por policies centralizadas (Casbin ou implementação própria).

### 6.2 Vault de credenciais de integração

Credenciais de SendGrid, Meta, WhatsApp etc. são **criptografadas em repouso** com AES-256-GCM. A chave-mestra fica em variável de ambiente do worker (não no banco). Cada tenant tem seu próprio vetor de inicialização.

### 6.3 Dados sensíveis

- Senhas: argon2id (não bcrypt).
- Telefones e e-mails de contatos: armazenados em claro (necessário para envio); protegidos por RLS e criptografia em trânsito.
- Logs nunca registram credenciais, tokens ou conteúdo de campanhas (só metadados).

### 6.4 Rate limiting e abuso

- Limite por tenant em endpoints de envio (configurável por plano).
- Limite por IP em endpoints de auth.
- CAPTCHA em registro e recuperação de senha.

---

## 7. LGPD — Conformidade

> **Bloqueador comercial:** o sistema NÃO pode receber primeiro cliente pago sem este checklist completo. Buscar consultoria jurídica antes do beta.

### 7.1 Papéis

- **Controlador:** o cliente (tenant). Ele decide o que fazer com os dados dos contatos dele.
- **Operador:** Nexa (você). Você processa em nome do cliente.

### 7.2 Obrigações que o sistema precisa atender

| Requisito LGPD | Como o sistema cumpre |
|---|---|
| Direito de acesso | Endpoint de exportação de dados de um titular |
| Direito de eliminação | Soft delete + hard delete agendado (purga em 30 dias) |
| Direito de portabilidade | Exportação em CSV/JSON |
| Consentimento | Campo `consent_status` por contato + histórico de mudanças |
| Auditoria | Tabela `audit_log` com toda ação sensível (acesso, alteração, exportação) |
| Notificação de incidente | Logs de acesso suspeito + alerta para o owner do tenant |
| Minimização | Coleta só o necessário; campos opcionais marcados |
| DPO | Contato do DPO da Nexa visível na UI |

### 7.3 Documentos legais necessários (responsabilidade humana)

- Termos de Uso
- Política de Privacidade
- Contrato de Tratamento de Dados (DPA) — anexo do contrato de cada cliente
- Política de Retenção de Dados

---

## 8. Filas e Jobs

### 8.1 Filas principais (BullMQ)

| Fila | Trigger | SLA |
|---|---|---|
| `email-send` | Disparo de campanha | < 5 min para campanha de até 100k |
| `sms-send` | Disparo de SMS | < 2 min para 10k |
| `whatsapp-send` | Disparo WhatsApp | Respeitando rate limit Meta |
| `import-csv` | Upload de contatos | Best-effort, com progresso |
| `social-post` | Postagem agendada IG/FB | No horário ± 1 min |
| `webhook-deliver` | Saída para integrações do cliente | Retry 5x com backoff |
| `automation-execute` | Passo do engine de automação (Fase 7) | < 30s entre passos sequenciais |
| `automation-delay` | Delay temporal de automação ("esperar 3 dias") | Precisão de minuto |
| `contact-enrich` | Enriquecimento (futuro) | Best-effort |

### 8.2 Padrões aplicados

- **Idempotência:** todo job tem `idempotency_key`; reexecução não duplica efeito colateral.
- **Retry com backoff exponencial:** 3 tentativas iniciais, depois DLQ (dead letter queue).
- **Rate limit por destino:** ex. SendGrid 100 req/s — BullMQ rate limiter no worker.
- **Observabilidade:** Bull Board para inspeção visual; métricas exportadas para Grafana.

---

## 9. Integrações Externas

### 9.1 Princípios

1. **Cada integração mora atrás de uma interface** (`IEmailProvider`, `ISMSProvider`). Trocar SendGrid por Mailgun um dia = trocar implementação, não tocar nas regras de negócio.
2. **Credenciais por tenant** — o cliente conecta a CONTA DELE de SendGrid, não a sua. Isso simplifica LGPD e custos.
3. **Webhooks de retorno** — cada provedor tem endpoint dedicado para receber eventos (entrega, abertura, clique, falha) com verificação de assinatura.
4. **Timeout e circuit breaker** em toda chamada externa.

### 9.2 Mapeamento

| Provedor | Tipo | Endpoint do CRM | Webhook de retorno |
|---|---|---|---|
| SendGrid | E-mail | `/integrations/sendgrid` | `/webhooks/sendgrid` (HMAC) |
| Comtele | SMS | `/integrations/comtele` | `/webhooks/comtele` |
| WhatsApp Cloud API | WhatsApp | `/integrations/whatsapp` | `/webhooks/whatsapp` (verify token Meta) |
| Meta Graph (IG/FB) | Social | `/integrations/meta` | `/webhooks/meta` |
| Evolution API | WhatsApp não-oficial | self-hosted | `/webhooks/evolution` |
| Cresce Vendas | Push notification | `/integrations/cresce-vendas` | — |

---

## 10. Observabilidade

| Sinal | Ferramenta | O que captura |
|---|---|---|
| Logs estruturados | Pino → Loki | JSON com `tenant_id`, `request_id`, `user_id` |
| Erros | Sentry | Stack trace + breadcrumbs, agrupados por release |
| Métricas | Prometheus → Grafana | Latência, throughput, fila, taxa de erro por endpoint/job |
| Tracing | OpenTelemetry → Tempo (futuro) | Span de request HTTP através de jobs |
| Health checks | `/health` e `/ready` | Para Traefik e monitoramento externo |

**Alertas mínimos do MVP:**
- API com taxa de erro > 1% por 5 min
- Fila com mais de 10k jobs pendentes por 10 min
- Job com falha permanente (DLQ recebendo > 100 itens/h)
- Postgres com replicação > 30s atrasada (quando réplica existir)

---

## 11. Deploy e Infraestrutura

### 11.1 Topologia atual aproveitada

```
Servidor dedicado (Proxmox)
├── VM pfSense (firewall)
└── VM Docker Swarm (80GB RAM, 24 cores, 330GB)
    ├── Traefik         ← já existe
    ├── PostgreSQL      ← já existe
    ├── Redis           ← já existe
    ├── RabbitMQ        ← já existe
    ├── MinIO           ← já existe
    ├── n8n             ← já existe (uso interno/admin, não do produto)
    ├── Mautic, Baserow, Chatwoot, etc. ← já existe
    └── [novos] CRM Nexa stack:
        ├── api (3 réplicas)
        ├── worker (2 réplicas)
        ├── scheduler (1 réplica)
        └── web (Next.js, 2 réplicas)
```

### 11.2 Pipeline de CI/CD

```
git push (main) → GitHub Actions
  ├── lint + typecheck + test (unit + integration)
  ├── build Docker image (multi-stage)
  ├── push para registry (GHCR ou self-hosted)
  └── deploy via webhook → Portainer / docker stack deploy
```

Migrations Prisma rodam em job separado **antes** do rollout das instâncias novas.

### 11.3 Backups e continuidade

- **MinIO:** já está rodando no Swarm (cluster do owner). Bucket dedicado por tenant (`crm-<tenant_slug>`).
- **Replicação off-site das mídias:** **DigitalOcean Spaces** (S3-compatível) é a opção principal — menos custo de transferência que AWS S3, integração trivial via SDK S3, mesma região (NYC ou outra) para reduzir latência. Alternativas equivalentes: Wasabi e Backblaze B2.
- **Postgres:** dump diário + WAL archiving para storage off-site (DO Spaces ou VPS barato em outra região).
- **Restore testado mensalmente** em ambiente de staging.
- **Plano de continuidade documentado** — anexo do contrato com clientes.

### 11.4 Ambientes

| Ambiente | Onde | Dados |
|---|---|---|
| Dev | Máquina local (Docker Compose) | Mock |
| Staging | Mesmo Swarm, stack separado | Anonimizado de prod |
| Produção | Swarm | Real |

---

## 12. ADRs — Decisões Arquiteturais Registradas

> Cada decisão importante vira um ADR curto. Esta lista cresce conforme o projeto evolui.

### ADR-001: Monolito modular em vez de microsserviços
**Contexto:** Solo dev, MVP em 2,5 meses.
**Decisão:** Monolito modular NestJS, com workers separados por tipo de processo (mas mesmo código).
**Consequências:** Simplicidade operacional > escalabilidade independente. Refatorar para microsserviços é factível depois se o domínio exigir.

### ADR-002: PostgreSQL com pool multi-tenant + RLS
**Contexto:** 5 tenants no ano 1 com expectativa de crescer (clientes maiores até 1M contatos).
**Decisão:** Banco único Postgres 17 + pgvector, isolamento por `tenant_id` + RLS.
**Consequências:** Migrations centralizadas. Risco de "vizinho barulhento" mitigado por quotas de plano e índices adequados. pgvector disponível para features de IA sem banco extra.

### ADR-003: Engine de automação próprio (não n8n)
**Contexto:** Inicial mente cogitamos usar n8n via API para acelerar o MVP. Após análise de UX, ficou claro que o n8n não atende usuário final de SaaS comercial — é ferramenta técnica.
**Decisão:** Construir engine próprio em NestJS, com builder visual nativo no front. Workflows persistidos em JSONB, executados por workers BullMQ (com BullMQ Flows quando precisar de dependências). Escopo enxuto inicial — não tenta clonar n8n.
**Consequências:** +6 a 8 semanas de desenvolvimento na Fase 7. MVP comercial sai SEM automações. Em troca: UX coerente, vocabulário do domínio (contato/etiqueta/segmento), zero dependência operacional, diferencial competitivo. n8n permanece no Swarm para uso administrativo interno do owner, não do produto.

### ADR-004: Não fazer fork do Chatwoot
**Contexto:** Módulo de atendimento é fase 11.
**Decisão:** Integrar com Chatwoot via API; não forkar.
**Consequências:** Solo dev não consegue manter merge de upstream de produto OSS vivo. Trade-off: limitado pelas APIs do Chatwoot.

### ADR-005: TypeScript em toda a stack
**Contexto:** Solo dev precisa minimizar troca de contexto.
**Decisão:** NestJS no back, Next.js no front, mesmo `tsconfig` raiz.
**Consequências:** Sem PHP/Python. Tipos compartilhados via `packages/shared`.

### ADR-006: MinIO em vez de S3 da AWS
**Contexto:** Custo de egress de mídia, controle de dados (LGPD).
**Decisão:** MinIO no Swarm com backup off-site.
**Consequências:** Manutenção da infra é responsabilidade nossa. Backup off-site obrigatório.

---

## 13. Riscos Conhecidos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Solo dev (bus factor 1) | Alta | Crítico | Documentação obrigatória. Backups testados. Eventualmente contratar 2º dev. |
| LGPD não cumprida no lançamento | Alta | Crítico | Consultoria jurídica antes do beta. Checklist da seção 7. |
| Concentração em um único Proxmox | Média | Alto | Réplica de Postgres + backup de mídia em outro provedor. |
| Custo de WhatsApp Cloud API surpreende cliente | Média | Médio | Repassar com margem por evento. Mostrar custo estimado antes do disparo. |
| Engine de automação fica complexo demais para solo dev | Média | Médio | Manter escopo enxuto inicial. Postergar features avançadas (loops, sub-workflows). Lançar com 6 ações + 5 gatilhos é suficiente. |
| Mudança breaking na Graph API da Meta | Média | Médio | Fixar versão da API; testes contra mock; alertas no Sentry para erros 4xx repentinos. |
| Vazamento de dados entre tenants | Baixa | Crítico | RLS + testes E2E que tentam vazamento + auditoria de toda query. |

---

## 14. Próximos Passos

1. Revisar este documento e dar OK ou ajustar.
2. Aprovar `docs/02-modelo-de-dados.md` (entidades, índices, políticas RLS).
3. Iniciar **Fase 0 — Fundação** com plano detalhado dos primeiros commits.
4. Buscar consultoria jurídica para LGPD em paralelo ao desenvolvimento.

---

> **Status:** Aguardando revisão do owner.
