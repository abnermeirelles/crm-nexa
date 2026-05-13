-- ============================================================================
-- Fase 1.E — Tabela `contact_imports` para rastrear jobs de import CSV
-- ============================================================================

-- CreateEnum
CREATE TYPE "contact_import_status" AS ENUM ('queued', 'processing', 'done', 'failed');

-- Nota: o diff do Prisma incluiu DROP INDEX para `contacts_name_trgm` e
-- `contacts_tags_gin` (indices SQL custom da 1.A que o Prisma nao
-- conhece). Removidos do migration para preservar esses indices.

-- CreateTable
CREATE TABLE "contact_imports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "status" "contact_import_status" NOT NULL DEFAULT 'queued',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "inserted_rows" INTEGER NOT NULL DEFAULT 0,
    "updated_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_imports_tenant_id_created_at_idx" ON "contact_imports"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Row-Level Security: jobs de import isolados por tenant.
-- ---------------------------------------------------------------------
ALTER TABLE "contact_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_imports" FORCE  ROW LEVEL SECURITY;

CREATE POLICY contact_import_tenant_isolation ON "contact_imports"
  USING       (tenant_id = current_tenant_id())
  WITH CHECK  (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- Permissoes: crm_app gerencia jobs do proprio tenant.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "contact_imports" TO crm_app;
