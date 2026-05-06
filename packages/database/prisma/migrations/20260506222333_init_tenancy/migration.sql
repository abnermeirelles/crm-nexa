-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plan" VARCHAR(32) NOT NULL DEFAULT 'starter',
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "dpo_email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'agent',
    "mfa_secret" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_type" VARCHAR(32) NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(32),
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "users_tenant_id_role_idx" ON "users"("tenant_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_tenant_id_expires_at_idx" ON "user_sessions"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_action_created_at_idx" ON "audit_log"("tenant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_entity_id_idx" ON "audit_log"("tenant_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- CUSTOM (não gerado pelo Prisma): Multi-tenant RLS + triggers
-- =====================================================================
-- Tudo abaixo foi adicionado MANUALMENTE no migration.sql gerado.
-- Mantenha em mente:
--   - Prisma não conhece RLS, triggers ou funções customizadas
--   - Mudanças aqui DEVEM virar novas migrations explícitas no futuro
--   - NUNCA edite esta migration depois de aplicada (checksum quebra)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: extrai tenant_id da sessão atual.
-- Configurado em runtime por: SET LOCAL app.current_tenant_id = '<uuid>'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
DECLARE
  v_tenant text;
BEGIN
  v_tenant := current_setting('app.current_tenant_id', true);
  IF v_tenant IS NULL OR v_tenant = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_tenant::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION current_tenant_id() IS
  'Retorna tenant_id da sessao atual ou NULL. Setar via SET LOCAL app.current_tenant_id = <uuid>.';

-- ---------------------------------------------------------------------
-- Habilitar Row-Level Security em todas as tabelas multi-tenant.
-- FORCE garante que RLS se aplique mesmo se o caller for owner da tabela
-- (somente roles com BYPASSRLS pulam, ex.: crm_admin).
-- ---------------------------------------------------------------------
ALTER TABLE "tenants"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants"       FORCE  ROW LEVEL SECURITY;
ALTER TABLE "users"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "audit_log"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"     FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Policies de isolamento por tenant.
-- USING aplica em SELECT/UPDATE/DELETE; WITH CHECK aplica em INSERT/UPDATE.
-- ---------------------------------------------------------------------

-- tenants: usuario so enxerga e mexe no proprio tenant
CREATE POLICY tenant_self_access ON "tenants"
  USING       (id = current_tenant_id())
  WITH CHECK  (id = current_tenant_id());

-- users: so users do mesmo tenant
CREATE POLICY user_tenant_isolation ON "users"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- user_sessions: so sessoes do mesmo tenant
CREATE POLICY session_tenant_isolation ON "user_sessions"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- audit_log: so logs do mesmo tenant.
-- Logs de sistema (tenant_id NULL) ficam invisiveis para crm_app — intencional.
CREATE POLICY audit_tenant_isolation ON "audit_log"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- Permissoes: garantir que crm_app possa operar nas tabelas.
-- (privilegios padrao ja concedidos via ALTER DEFAULT PRIVILEGES em 0.3.A;
-- repetimos aqui pra garantir idempotencia e clareza)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenants"       TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "users"         TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_sessions" TO crm_app;
GRANT SELECT, INSERT,         DELETE ON "audit_log"     TO crm_app;
-- audit_log nao tem UPDATE — append-only via trigger abaixo

-- ---------------------------------------------------------------------
-- Trigger: set updated_at = NOW() em UPDATE.
-- Defesa em profundidade — Prisma ja seta, mas protege escritas via raw SQL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_tenants
  BEFORE UPDATE ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: audit_log e append-only (bloqueia UPDATE).
-- DELETE permanece permitido para retencao LGPD via job admin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_audit_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only — UPDATE not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_update();
