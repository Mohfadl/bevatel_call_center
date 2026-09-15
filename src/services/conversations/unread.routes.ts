import {
  Router,
  type NextFunction,
  type Response,
} from 'express';

import {
  authMiddleware,
  type AuthRequest,
} from '../../../shared/auth';

import {
  unreadService,
} from './unread.service';

const router =
  Router();

router.get(
  '/',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            message:
              'Authentication is required.',

            code:
              'UNAUTHORIZED',
          });
      }

      const result =
        await unreadService.getUnreadCounts(
          request.user.organizationId,
          request.user.id,
        );

      return response
        .status(200)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (
      error
    ) {
      console.error(
        'Get unread counts error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

router.get(
  '/:conversationId',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            message:
              'Authentication is required.',

            code:
              'UNAUTHORIZED',
          });
      }

      const unreadCount =
        await unreadService.getConversationUnreadCount(
          request.user.organizationId,
          request.user.id,
          request.params.conversationId,
        );

      return response
        .status(200)
        .json({
          success:
            true,

          data: {
            conversationId:
              request.params.conversationId,

            unreadCount,
          },
        });
    } catch (
      error
    ) {
      console.error(
        'Get conversation unread count error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

router.post(
  '/:conversationId/read',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            message:
              'Authentication is required.',

            code:
              'UNAUTHORIZED',
          });
      }

      const result =
        await unreadService.markConversationAsRead(
          request.user.organizationId,
          request.user.id,
          request.params.conversationId,
        );

      return response
        .status(200)
        .json({
          success:
            true,

          message:
            'Conversation marked as read.',

          data:
            result,
        });
    } catch (
      error
    ) {
      console.error(
        'Mark conversation as read error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

export default router;