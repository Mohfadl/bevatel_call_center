import {
  Router,
  type NextFunction,
  type Response,
} from 'express';

import { z } from 'zod';

import {
  prisma,
} from '../../../shared/prisma';

import {
  authMiddleware,
  allowRoles,
  type AuthRequest,
} from '../../../shared/auth';

const router = Router();

const changeRoleSchema = z.object({role: z.enum(['SUPER_ADMIN','ADMIN','SUPERVISOR','AGENT',]),});

router.get('/',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN','SUPERVISOR',),
  async (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const users =
        await prisma.user.findMany({
          where: {
            organizationId: request.user.organizationId,
          },

          select: {
            id: true,
            organizationId: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      return response
        .status(200)
        .json({
          success: true,
          data: users,
        });
    } catch (error) {
      console.error('List users error:',error,);
      return next(error,);
    }
  },
);

router.patch('/:userId/role',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN',),

  async (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const parsed = changeRoleSchema.safeParse(request.body,);
      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Invalid role.',
            code: 'VALIDATION_ERROR',
            errors: parsed.error.flatten(),
          });
      }

      const userId = request.params.userId;
      const targetUser =
        await prisma.user.findFirst({
          where: {
            id: String(userId),
            organizationId: request.user.organizationId,
          },
        });

      if (!targetUser) {
        return response
          .status(404)
          .json({
            success: false,
            message: 'User was not found.',
            code: 'USER_NOT_FOUND',
          });
      }
 
      if (request.user.role ==='ADMIN' &&targetUser.role ==='SUPER_ADMIN') {
        return response
          .status(403)
          .json({
            success: false,
            message: 'Admin cannot change a Super Admin role.',
            code: 'FORBIDDEN',
          });
      }
 
      if (parsed.data.role ==='SUPER_ADMIN' &&request.user.role !=='SUPER_ADMIN') {
        return response
          .status(403)
          .json({
            success: false,
            message: 'Only a Super Admin can assign the Super Admin role.',
            code: 'FORBIDDEN',
          });
      } 

      if (targetUser.id ===request.user.id) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'You cannot change your own role.',
            code: 'CANNOT_CHANGE_OWN_ROLE',
          });
      }

      const updatedUser =
        await prisma.user.update({
          where: {
            id: targetUser.id,
          },

          data: {
            role: parsed.data.role,
          },

          select: {
            id: true,
            organizationId: true,
            name: true,
            email: true,
            role: true,
            status: true,
            updatedAt: true,
          },
        });

      return response
        .status(200)
        .json({
          success: true,
          message: 'User role updated successfully.',
          data: updatedUser,
        });
    } catch (error) {
      console.error('Change user role error:',error,);
      return next(error,);
    }
  },
);

export default router;