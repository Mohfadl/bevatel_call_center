import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '../../../shared/prisma';
import {
  authMiddleware,
  allowRoles,
  signToken,
  type AuthRequest,
} from '../../../shared/auth';

const router = Router();

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

const loginSchema = z.object({
  organizationId: z
    .string()
    .min(1, 'Organization ID is required'),

  email: z
    .string()
    .email('Invalid email address'),

  password: z
    .string()
    .min(1, 'Password is required'),
});

const createUserSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(100),

  email: z
    .string()
    .email(),

  password: z
    .string()
    .min(8),

  role: z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'SUPERVISOR',
    'AGENT',
  ]),
});

const updateUserStatusSchema = z.object({
  status: z.enum([
    'ACTIVE',
    'INACTIVE',
  ]),
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
|
| GET /api/auth/health
|
*/

router.get(
  '/health',
  (_request, response) => {
    return response.json({
      success: true,
      service: 'identity',
    });
  },
);

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
|
| POST /api/auth/login
|
*/

router.post(
  '/login',

  async (
    request,
    response,
  ) => {
    try {
      /*
      |--------------------------------------------------------------------------
      | Validate request
      |--------------------------------------------------------------------------
      */

      const parsed =
        loginSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Validation failed',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        organizationId,
        email,
        password,
      } = parsed.data;

      /*
      |--------------------------------------------------------------------------
      | Find organization
      |--------------------------------------------------------------------------
      */

      const organization =
        await prisma.organization.findUnique({
          where: {
            id: organizationId,
          },
        });

      if (!organization) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Invalid credentials',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Find user
      |--------------------------------------------------------------------------
      */

      const user =
        await prisma.user.findFirst({
          where: {
            organizationId:
              organization.id,

            email,
          },
        });

      if (!user) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Invalid credentials',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Check status
      |--------------------------------------------------------------------------
      */

      if (
        user.status !==
        'ACTIVE'
      ) {
        return response
          .status(403)
          .json({
            success: false,
            message:
              'User account is inactive',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Verify password
      |--------------------------------------------------------------------------
      */

      const passwordIsValid =
        await bcrypt.compare(
          password,
          user.passwordHash,
        );

      if (!passwordIsValid) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Invalid credentials',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Generate JWT
      |--------------------------------------------------------------------------
      */

      const accessToken =
        signToken({
          id: user.id,
          organizationId: user.organizationId,
          email: user.email,
          role: user.role,
        });

      /*
      |--------------------------------------------------------------------------
      | Response
      |--------------------------------------------------------------------------
      */

      return response.json({
        success: true,
        message: 'Login successful',

        data: {
          accessToken,
          tokenType:
            'Bearer',

          user: {
            id:
              user.id,

            organizationId:
              user.organizationId,

            name:
              user.name,

            email:
              user.email,

            role:
              user.role,

            status:
              user.status,
          },

          organization: {
            id:
              organization.id,

            name:
              organization.name,

            slug:
              organization.slug,
          },
        },
      });
    } catch (error) {
      console.error(
        'Login error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Current User
|--------------------------------------------------------------------------
|
| GET /api/auth/me
|
*/

router.get(
  '/me',

  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const user =
        await prisma.user.findFirst({
          where: {
            id:
              request.user.id,

            organizationId:
              request.user.organizationId,
          },

          select: {
            id: true,
            organizationId:
              true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,

            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

      if (!user) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'User not found',
          });
      }

      return response.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error(
        'Get current user error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| List Users
|--------------------------------------------------------------------------
|
| GET /api/auth/users
|
*/

router.get(
  '/users',

  authMiddleware,

  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'SUPERVISOR',
  ),

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const users =
        await prisma.user.findMany({
          where: {
            organizationId:
              request.user.organizationId,
          },

          select: {
            id: true,
            organizationId:
              true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },

          orderBy: {
            createdAt:
              'desc',
          },
        });

      return response.json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error(
        'List users error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Create User
|--------------------------------------------------------------------------
|
| POST /api/auth/users
|
*/

router.post(
  '/users',

  authMiddleware,

  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
  ),

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const parsed =
        createUserSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Validation failed',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        name,
        email,
        password,
        role,
      } = parsed.data;

      /*
      |--------------------------------------------------------------------------
      | Check duplicate email
      |--------------------------------------------------------------------------
      */

      const existingUser =
        await prisma.user.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            email,
          },
        });

      if (existingUser) {
        return response
          .status(409)
          .json({
            success: false,
            message:
              'Email already exists',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Password
      |--------------------------------------------------------------------------
      */

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      /*
      |--------------------------------------------------------------------------
      | Create
      |--------------------------------------------------------------------------
      */

      const user =
        await prisma.user.create({
          data: {
            organizationId:
              request.user.organizationId,

            name,

            email,

            passwordHash,

            role,

            status:
              'ACTIVE',
          },

          select: {
            id: true,
            organizationId:
              true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

      return response
        .status(201)
        .json({
          success: true,

          message:
            'User created successfully',

          data: user,
        });
    } catch (error) {
      console.error(
        'Create user error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Update User Status
|--------------------------------------------------------------------------
|
| PATCH /api/auth/users/:id/status
|
*/

router.patch(
  '/users/:id/status',

  authMiddleware,

  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
  ),

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const parsed =
        updateUserStatusSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Validation failed',

            errors:
              parsed.error.flatten(),
          });
      }

      const user =
        await prisma.user.findFirst({
          where: {
            id:
              request.params.id,

            organizationId:
              request.user.organizationId,
          },
        });

      if (!user) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'User not found',
          });
      }

      const updatedUser =
        await prisma.user.update({
          where: {
            id:
              user.id,
          },

          data: {
            status:
              parsed.data.status,
          },

          select: {
            id: true,
            organizationId:
              true,
            name: true,
            email: true,
            role: true,
            status: true,
            updatedAt: true,
          },
        });

      return response.json({
        success: true,

        message:
          'User status updated successfully',

        data:
          updatedUser,
      });
    } catch (error) {
      console.error(
        'Update user status error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

export default router;