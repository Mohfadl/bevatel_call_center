import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import { string, z } from 'zod';

import { prisma } from '../../../../shared/prisma';

import {
  allowRoles,
  AuthRequest,
  authMiddleware,
  signToken,
} from '../../../../shared/auth';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_request, response) => {
  response.json({
    success: true,
    service: 'identity',
  });
});

app.post('/auth/login', async (request, response) => {
  const schema = z.object({
    organizationId: z.string().uuid(),
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(422).json({
      success: false,
      errors: parsed.error.flatten(),
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
    },
  });

  if (!user) {
    return response.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  if (user.status !== 'ACTIVE') {
    return response.status(403).json({
      success: false,
      message: 'User account is suspended',
    });
  }

  const validPassword = await bcrypt.compare(
    parsed.data.password,
    user.passwordHash,
  );

  if (!validPassword) {
    return response.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const token = signToken({
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return response.json({
    success: true,
    data: {
      accessToken: token,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    },
  });
});

app.get(
  '/admin/users',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN','SUPERVISOR',),

  async (request: AuthRequest, response) => {
    const users = await prisma.user.findMany({
      where: {
        organizationId: request.user!.organizationId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    response.json({
      success: true,
      data: users,
    });
  },
);

app.post('/admin/users',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN',),

  async (request: AuthRequest, response) => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['ADMIN','SUPERVISOR','AGENT',]),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(422).json({
        success: false,
        errors: parsed.error.flatten(),
      });
    }

    const existingUser =
      await prisma.user.findFirst({
        where: {
          organizationId: request.user!.organizationId,
          email: parsed.data.email,
        },
      });

    if (existingUser) {
      return response.status(409).json({
        success: false,
        message: 'Email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password,12,);
    const user = await prisma.user.create({
      data: {
        organizationId: request.user!.organizationId,
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return response.status(201).json({
      success: true,
      data: user,
    });
  },
);

app.patch('/admin/users/:id/status',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN',),

  async (request: AuthRequest, response) => {
    const schema = z.object({
      status: z.enum(['ACTIVE','SUSPENDED',]),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(422).json({
        success: false,
        errors: parsed.error.flatten(),
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: String(request.params.id),
        organizationId: request.user!.organizationId,
      },
    });

    if (!user) {
      return response.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const updated = await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        status: parsed.data.status,
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    response.json({
      success: true,
      data: updated,
    });
  },
);

const port = Number(process.env.IDENTITY_PORT) || 4001;
app.listen(port, () => {
  console.log(`Identity service running on http://localhost:${port}`,);
});