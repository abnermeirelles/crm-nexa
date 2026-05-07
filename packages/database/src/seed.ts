import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@crm-nexa/shared';

// Seed idempotente: roda contra DATABASE_ADMIN_URL (BYPASSRLS) e cria
// um tenant "dev" com um owner para autenticacao em desenvolvimento.
// Re-rodar nao apaga sessoes nem outras escritas — apenas garante o
// tenant + user iniciais.

const DEV_TENANT_SLUG = 'dev';
const DEV_OWNER_EMAIL = 'owner@nexa.dev';
const DEV_OWNER_PASSWORD = 'dev123!';

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error(
      'DATABASE_ADMIN_URL is required for seed (needs BYPASSRLS).',
    );
  }
  const db = new PrismaClient({ datasourceUrl: url });

  try {
    const tenant = await db.tenant.upsert({
      where: { slug: DEV_TENANT_SLUG },
      create: {
        slug: DEV_TENANT_SLUG,
        name: 'Nexa Dev',
        plan: 'starter',
      },
      update: {},
    });

    const existing = await db.user.findUnique({
      where: {
        tenantId_email: { tenantId: tenant.id, email: DEV_OWNER_EMAIL },
      },
    });

    if (existing) {
      console.log(`✓ owner ${DEV_OWNER_EMAIL} already exists in tenant ${tenant.slug}`);
    } else {
      const passwordHash = await hashPassword(DEV_OWNER_PASSWORD);
      await db.user.create({
        data: {
          tenantId: tenant.id,
          email: DEV_OWNER_EMAIL,
          passwordHash,
          name: 'Dev Owner',
          role: 'owner',
        },
      });
      console.log(`✓ created owner ${DEV_OWNER_EMAIL} in tenant ${tenant.slug}`);
    }

    console.log(
      `\nReady — login with:\n  email:    ${DEV_OWNER_EMAIL}\n  password: ${DEV_OWNER_PASSWORD}\n  tenant:   ${tenant.slug} (${tenant.id})`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
