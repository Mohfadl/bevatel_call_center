import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../shared/prisma';

async function main() {
  const organization = await prisma.organization.upsert({
    where: {
      slug: 'prifit',
    },
    update: {},
    create: {
      name: 'PriFit',
      slug: 'prifit',
    },
  });

  const passwordHash = await bcrypt.hash(
    'ChangeMe123!',
    12,
  );

  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'admin@example.com',
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Super Admin',
      email: 'admin@example.com',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log({
    organizationId: organization.id,
    userId: admin.id,
    email: admin.email,
    password: 'ChangeMe123!',
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });