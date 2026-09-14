import 'dotenv/config';

import { prisma } from './shared/prisma';

async function main() {
  const result = await prisma.$queryRaw`
    SELECT 1 AS connected
  `;

  console.log(
    'MySQL connected successfully:',
    result,
  );
}

main()
  .catch(error => {
    console.error(
      'Database error:',
      error,
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });