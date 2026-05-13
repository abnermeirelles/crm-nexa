-- ============================================================================
-- Fase 1.A — Tabela `contacts` com RLS, indices especiais e trigger
-- ============================================================================

-- CreateEnum
CREATE TYPE "contact_stage" AS ENUM ('lead', 'prospect', 'customer', 'churned');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" CITEXT,
    "phone" VARCHAR(32),
    "document" VARCHAR(20),
    "company_name" VARCHAR(255),
    "stage" "contact_stage" NOT NULL DEFAULT 'lead',
    "source" VARCHAR(64),
    "owner_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_tenant_id_stage_idx" ON "contacts"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_owner_id_idx" ON "contacts"("tenant_id", "owner_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Indices que Prisma nao expressa:
-- 1) unique parcial em (tenant_id, email) ignorando soft-deleted e NULL
-- 2) trigram em name para busca ILIKE rapida
-- 3) GIN em tags para busca por tag
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "contacts_tenant_email_unique"
  ON "contacts" ("tenant_id", "email")
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

CREATE INDEX "contacts_name_trgm"
  ON "contacts" USING gin (name gin_trgm_ops);

CREATE INDEX "contacts_tags_gin"
  ON "contacts" USING gin ("tags");

-- ---------------------------------------------------------------------
-- Trigger updated_at — reusa set_updated_at() definido na 0.3.
-- ---------------------------------------------------------------------
CREATE TRIGGER set_updated_at_contacts
  BEFORE UPDATE ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Row-Level Security: contatos so podem ser lidos/escritos pelo proprio
-- tenant (current_tenant_id() vem da GUC app.current_tenant_id setada
-- pela aplicacao via Prisma extension).
-- ---------------------------------------------------------------------
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE  ROW LEVEL SECURITY;

CREATE POLICY contact_tenant_isolation ON "contacts"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- Permissoes: garantir que crm_app possa operar na tabela.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts" TO crm_app;
