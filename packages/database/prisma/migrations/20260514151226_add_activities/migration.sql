-- ============================================================================
-- Fase 2.A — Tabela `activities` para timeline do contato
-- ============================================================================

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('note', 'call', 'email', 'meeting', 'system');

-- Nota: o diff do Prisma incluiu DROP INDEX para indices SQL custom
-- da 1.A (`contacts_name_trgm`, `contacts_tags_gin`). Removidos do
-- migration para preservar.

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "type" "activity_type" NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_tenant_id_contact_id_created_at_idx" ON "activities"("tenant_id", "contact_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activities_tenant_id_type_idx" ON "activities"("tenant_id", "type");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Trigger updated_at — reusa funcao definida na 0.3
-- ---------------------------------------------------------------------
CREATE TRIGGER set_updated_at_activities
  BEFORE UPDATE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Row-Level Security: timeline isolada por tenant.
-- ---------------------------------------------------------------------
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE  ROW LEVEL SECURITY;

CREATE POLICY activity_tenant_isolation ON "activities"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- Permissoes: crm_app gerencia atividades do proprio tenant.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "activities" TO crm_app;
