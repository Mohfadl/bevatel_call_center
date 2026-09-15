import 'dotenv/config';

import {
  prisma,
} from '../shared/prisma';

import {
  PasswordService,
} from '../shared/password';

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password ) {
    console.error(
      [
        'Usage:',
        '',
        'npx tsx scripts/check-user-password.ts',
        '"user@example.com"',
        '"your-password"',
      ].join(' '),
    );

    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user =
    await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });

  if (!user) {
    console.log({
      success: false,
      code: 'USER_NOT_FOUND',
      email: normalizedEmail,
    });

    return;
  }

  const hashIsValid = PasswordService.isBcryptHash(user.passwordHash,);
  const passwordMatches = hashIsValid ? await PasswordService.verify(password, user.passwordHash,) : false;
  console.log({
    success: passwordMatches,
    user: {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    password: {
      storedHashIsBcrypt: hashIsValid,
      passwordMatches,
    },
  });
}

main()
  .catch((error: unknown,) => {
      console.error('Password check failed:', error,);
      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );