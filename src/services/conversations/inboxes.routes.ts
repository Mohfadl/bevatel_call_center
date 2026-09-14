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
| Health
|--------------------------------------------------------------------------
|
| GET /api/inboxes/health
|
*/

router.get(
  '/health',
  (_request, response) => {
    return response.json({
      success: true,
      service: 'inboxes',
    });
  },
);

/*
|--------------------------------------------------------------------------
| List Inboxes
|--------------------------------------------------------------------------
|
| GET /api/inboxes
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

      const inboxes =
        await prisma.inbox.findMany({
          where: {
            organizationId:
              request.user.organizationId,
          },

          include: {
            team: true,

            channelAccount: {
              select: {
                id: true,
                name: true,
                channel: true,
                status: true,
              },
            },

            _count: {
              select: {
                conversations: true,
              },
            },
          },

          orderBy: {
            createdAt:
              'desc',
          },
        });

      return response.json({
        success: true,
        data: inboxes,
      });
    } catch (error) {
      console.error(
        'List inboxes error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to load inboxes',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Create Inbox
|--------------------------------------------------------------------------
|
| POST /api/inboxes
|
| Body example:
|
| {
|   "name": "WhatsApp Support",
|   "teamId": "uuid",
|   "channelAccountId": "uuid"
| }
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

      const schema =
        z.object({
          name:
            z
              .string()
              .trim()
              .min(
                2,
                'Inbox name must contain at least 2 characters',
              ),

          teamId:
            z
              .string()
              .uuid()
              .optional(),

          channelAccountId:
            z
              .string()
              .uuid()
              .optional(),
        });

      const parsed =
        schema.safeParse(
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

      const organizationId =
        request.user.organizationId;

      /*
      |--------------------------------------------------------------------------
      | Validate Team
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data.teamId
      ) {
        const team =
          await prisma.team.findFirst({
            where: {
              id:
                parsed.data.teamId,

              organizationId,
            },
          });

        if (!team) {
          return response
            .status(404)
            .json({
              success: false,
              message:
                'Team not found',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Validate Channel Account
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data.channelAccountId
      ) {
        const account =
          await prisma.channelAccount.findFirst({
            where: {
              id:
                parsed.data.channelAccountId,

              organizationId,
            },
          });

        if (!account) {
          return response
            .status(404)
            .json({
              success: false,
              message:
                'Channel account not found',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Create Inbox
      |--------------------------------------------------------------------------
      */

      const inbox =
        await prisma.inbox.create({
          data: {
            organizationId,

            name:
              parsed.data.name,

            teamId:
              parsed.data.teamId,

            channelAccountId:
              parsed.data.channelAccountId,
          },

          include: {
            team: true,

            channelAccount: {
              select: {
                id: true,
                name: true,
                channel: true,
                status: true,
              },
            },

            _count: {
              select: {
                conversations: true,
              },
            },
          },
        });

      return response
        .status(201)
        .json({
          success: true,
          message:
            'Inbox created successfully',
          data:
            inbox,
        });
    } catch (error) {
      console.error(
        'Create inbox error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to create inbox',
        });
    }
  },
);

export default router;