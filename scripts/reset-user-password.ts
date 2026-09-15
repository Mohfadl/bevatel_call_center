import 'dotenv/config';

import {
  prisma,
} from '../shared/prisma';

import {
  PasswordService,
} from '../shared/password';

async function main(): Promise<void> {
  const [email, newPassword, ] = process.argv.slice(2);
  if (!email || !newPassword ) {
    console.error(
      [
        'Usage:',
        '',
        'npx tsx scripts/reset-user-password.ts',
        '"user@example.com"',
        '"new-password"',
      ].join(' '),
    );
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser =
    await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        email: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });

  if (!existingUser) {
    console.error({
      success: false,
      code: 'USER_NOT_FOUND',
      message: 'User was not found.',
      email: normalizedEmail,
    });
    process.exitCode = 1;
    return;
  }

  const passwordHash = await PasswordService.hash(newPassword,);
  const user =
    await prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        passwordHash,
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

  const verified = await PasswordService.verify(newPassword,user.passwordHash,);
  if (!verified) {
    throw new Error('Password was updated but verification failed.',);
  }

  console.log({
    success: true,
    message: 'Password updated and verified successfully.',
    user: {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    passwordVerified: verified,
  });
}

main()
  .catch((error: unknown,) => {
      console.error('Password reset failed:', error,);
      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );