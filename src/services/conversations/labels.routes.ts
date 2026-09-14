import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../../shared/prisma';
import {
  authMiddleware,
  type AuthRequest,
} from '../../../shared/auth';

const router = Router();

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

const createLabelSchema = z.object({
  name: z
    .string()
    .min(1, 'Label name is required')
    .max(100),

  color: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .nullable(),
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
|
| GET /api/labels/health
|
*/

router.get(
  '/health',
  (_request, response) => {
    return response.json({
      success: true,
      service: 'labels',
    });
  },
);

/*
|--------------------------------------------------------------------------
| List Labels
|--------------------------------------------------------------------------
|
| GET /api/labels
|
*/

router.get(
  '/',

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
            message: 'Unauthorized',
          });
      }

      const labels =
        await prisma.label.findMany({
          where: {
            organizationId:
              request.user.organizationId,
          },

          orderBy: {
            createdAt: 'desc',
          },
        });

      return response.json({
        success: true,
        data: labels,
      });
    } catch (error) {
      console.error(
        'List labels error:',
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
| Create Label
|--------------------------------------------------------------------------
|
| POST /api/labels
|
*/

router.post(
  '/',

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
            message: 'Unauthorized',
          });
      }

      const parsed =
        createLabelSchema.safeParse(
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
        color,
      } = parsed.data;

      /*
      |--------------------------------------------------------------------------
      | Prevent duplicate label name in same organization
      |--------------------------------------------------------------------------
      */

      const existing =
        await prisma.label.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            name,
          },
        });

      if (existing) {
        return response
          .status(409)
          .json({
            success: false,
            message:
              'Label already exists',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Create Label
      |--------------------------------------------------------------------------
      */

      const label =
        await prisma.label.create({
          data: {
            organizationId:
              request.user.organizationId,

            name,

            color:
              color ?? null,
          },
        });

      return response
        .status(201)
        .json({
          success: true,
          message:
            'Label created successfully',
          data: label,
        });
    } catch (error) {
      console.error(
        'Create label error:',
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
| Delete Label
|--------------------------------------------------------------------------
|
| DELETE /api/labels/:id
|
*/

router.delete(
  '/:id',

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
            message: 'Unauthorized',
          });
      }

      const label =
        await prisma.label.findFirst({
          where: {
            id:
              request.params.id,

            organizationId:
              request.user.organizationId,
          },
        });

      if (!label) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'Label not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Delete conversation-label relations first
      |--------------------------------------------------------------------------
      */

      await prisma.$transaction([
        prisma.conversationLabel.deleteMany({
          where: {
            labelId:
              label.id,
          },
        }),

        prisma.label.delete({
          where: {
            id:
              label.id,
          },
        }),
      ]);

      return response.json({
        success: true,
        message:
          'Label deleted successfully',
      });
    } catch (error) {
      console.error(
        'Delete label error:',
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