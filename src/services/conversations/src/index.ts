import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { z } from 'zod';

import { prisma } from '../../../../shared/prisma';

import {
  AuthRequest,
  authMiddleware,
} from '../../../../shared/auth';

import {
  internalAuth,
} from '../../../../shared/internal-auth';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
 

const channelEnum = z.enum([
  'WHATSAPP',
  'FACEBOOK',
  'INSTAGRAM',
  'SMS',
  'EMAIL',
  'WEBCHAT',
  'PHONE',
]);

const metaChannelEnum = z.enum([
  'WHATSAPP',
  'FACEBOOK',
  'INSTAGRAM',
]);

const conversationStatusEnum = z.enum([
  'OPEN',
  'PENDING',
  'RESOLVED',
  'CLOSED',
]);

const messageStatusEnum = z.enum([
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RECEIVED',
]);

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get(
  '/health',
  (_request, response) => {
    response.json({
      success: true,
      service: 'conversations',
    });
  },
);

/*
|--------------------------------------------------------------------------
| GET CONVERSATIONS
|--------------------------------------------------------------------------
|
| Examples:
|
| /conversations
| /conversations?scope=mine
| /conversations?scope=unassigned
| /conversations?status=OPEN
| /conversations?channel=WHATSAPP
| /conversations?page=1&perPage=20
|
*/

app.get(
  '/conversations',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const querySchema = z.object({
        status:
          conversationStatusEnum.optional(),

        channel:
          channelEnum.optional(),

        scope: z
          .enum([
            'all',
            'mine',
            'unassigned',
          ])
          .default('all'),

        inboxId:
          z.string().uuid().optional(),

        contactId:
          z.string().uuid().optional(),

        search:
          z.string().optional(),

        page: z.coerce
          .number()
          .int()
          .min(1)
          .default(1),

        perPage: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20),
      });

      const parsed =
        querySchema.safeParse(
          request.query,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Invalid query parameters',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        status,
        channel,
        scope,
        inboxId,
        contactId,
        search,
        page,
        perPage,
      } = parsed.data;

      const organizationId =
        request.user!.organizationId;

      const userId =
        request.user!.id;

      const where: any = {
        organizationId,
      };

      if (status) {
        where.status = status;
      }

      if (channel) {
        where.channel = channel;
      }

      if (inboxId) {
        where.inboxId = inboxId;
      }

      if (contactId) {
        where.contactId =
          contactId;
      }

      if (
        scope === 'mine'
      ) {
        where.assignedUserId =
          userId;
      }

      if (
        scope === 'unassigned'
      ) {
        where.assignedUserId =
          null;
      }

      if (
        search &&
        search.trim()
      ) {
        where.contact = {
          OR: [
            {
              displayName: {
                contains:
                  search.trim(),
              },
            },

            {
              phone: {
                contains:
                  search.trim(),
              },
            },

            {
              email: {
                contains:
                  search.trim(),
              },
            },
          ],
        };
      }

      const skip =
        (page - 1) *
        perPage;

      const [
        conversations,
        total,
      ] =
        await Promise.all([
          prisma.conversation.findMany({
            where,

            skip,

            take:
              perPage,

            include: {
              contact: {
                include: {
                  identities:
                    true,
                },
              },

              assignedUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },

              inbox: {
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
                },
              },

              labels: {
                include: {
                  label: true,
                },
              },

              messages: {
                take: 1,

                orderBy: {
                  createdAt:
                    'desc',
                },
              },
            },

            orderBy: [
              {
                lastMessageAt:
                  'desc',
              },

              {
                createdAt:
                  'desc',
              },
            ],
          }),

          prisma.conversation.count({
            where,
          }),
        ]);

      /*
      |--------------------------------------------------------------------------
      | Calculate unread count
      |--------------------------------------------------------------------------
      */

      const result =
        await Promise.all(
          conversations.map(
            async conversation => {
              const readState =
                await prisma.conversationRead.findUnique({
                  where: {
                    conversationId_userId:
                      {
                        conversationId:
                          conversation.id,

                        userId,
                      },
                  },
                });

              const unreadWhere:
                any = {
                conversationId:
                  conversation.id,

                direction:
                  'INBOUND',
              };

              if (
                readState
              ) {
                unreadWhere.createdAt =
                  {
                    gt:
                      readState.readAt,
                  };
              }

              const unreadCount =
                await prisma.message.count({
                  where:
                    unreadWhere,
                });

              return {
                ...conversation,

                unreadCount,
              };
            },
          ),
        );

      return response.json({
        success: true,

        data: {
          conversations:
            result,

          pagination: {
            page,

            perPage,

            total,

            totalPages:
              Math.ceil(
                total /
                  perPage,
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        'GET conversations error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to load conversations',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET SINGLE CONVERSATION
|--------------------------------------------------------------------------
*/

app.get(
  '/conversations/:id',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId:
              request.user!
                .organizationId,
          },

          include: {
            contact: {
              include: {
                identities:
                  true,
              },
            },

            assignedUser: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },

            inbox: {
              include: {
                team: {
                  include: {
                    members: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },

                channelAccount: {
                  select: {
                    id: true,
                    name: true,
                    channel: true,
                    status: true,
                  },
                },
              },
            },

            labels: {
              include: {
                label: true,
              },
            },

            messages: {
              orderBy: {
                createdAt:
                  'asc',
              },

              include: {
                senderUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },

            events: {
              orderBy: {
                createdAt:
                  'asc',
              },

              include: {
                actorUser: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'Conversation not found',
          });
      }

      return response.json({
        success: true,
        data:
          conversation,
      });
    } catch (error) {
      console.error(
        'GET conversation error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to load conversation',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CREATE / FIND CONVERSATION FOR CONTACT
|--------------------------------------------------------------------------
*/

app.post(
  '/conversations/contact/:contactId',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const contactId =
        String(
          request.params
            .contactId,
        );

      const schema =
        z.object({
          channel:
            channelEnum,

          channelAccountId:
            z
              .string()
              .uuid()
              .optional(),

          inboxId:
            z
              .string()
              .uuid()
              .optional(),

          subject:
            z
              .string()
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      /*
      |--------------------------------------------------------------------------
      | Validate contact
      |--------------------------------------------------------------------------
      */

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              contactId,

            organizationId,
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'Contact not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Validate channel account
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data
          .channelAccountId
      ) {
        const channelAccount =
          await prisma.channelAccount.findFirst({
            where: {
              id:
                parsed.data
                  .channelAccountId,

              organizationId,

              channel:
                parsed.data
                  .channel,

              status:
                'ACTIVE',
            },
          });

        if (
          !channelAccount
        ) {
          return response
            .status(404)
            .json({
              success: false,

              message:
                'Channel account not found or does not belong to this organization',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Validate inbox
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data
          .inboxId
      ) {
        const inbox =
          await prisma.inbox.findFirst({
            where: {
              id:
                parsed.data
                  .inboxId,

              organizationId,

              status:
                'ACTIVE',
            },
          });

        if (!inbox) {
          return response
            .status(404)
            .json({
              success: false,

              message:
                'Inbox not found',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Find open conversation
      |--------------------------------------------------------------------------
      */

      const existing =
        await prisma.conversation.findFirst({
          where: {
            organizationId,

            contactId:
              contact.id,

            channel:
              parsed.data
                .channel,

            channelAccountId:
              parsed.data
                .channelAccountId,

            status: {
              in: [
                'OPEN',
                'PENDING',
              ],
            },
          },

          orderBy: {
            updatedAt:
              'desc',
          },
        });

      if (existing) {
        return response.json({
          success: true,

          data:
            existing,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Create conversation
      |--------------------------------------------------------------------------
      */

      const conversation =
        await prisma.$transaction(
          async transaction => {
            const created =
              await transaction.conversation.create({
                data: {
                  organizationId,

                  contactId:
                    contact.id,

                  channel:
                    parsed.data
                      .channel,

                  channelAccountId:
                    parsed.data
                      .channelAccountId,

                  inboxId:
                    parsed.data
                      .inboxId,

                  subject:
                    parsed.data
                      .subject,
                },
              });

            await transaction.conversationEvent.create({
              data: {
                organizationId,

                conversationId:
                  created.id,

                actorUserId:
                  request.user!
                    .id,

                type:
                  'CREATED',
              },
            });

            return created;
          },
        );

      return response
        .status(201)
        .json({
          success: true,

          data:
            conversation,
        });
    } catch (error) {
      console.error(
        'Create conversation error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to create conversation',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| ASSIGN / UNASSIGN CONVERSATION
|--------------------------------------------------------------------------
*/

app.patch(
  '/conversations/:id/assign',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const schema =
        z.object({
          userId:
            z
              .string()
              .uuid()
              .nullable(),
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Validate assigned user
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data.userId
      ) {
        const user =
          await prisma.user.findFirst({
            where: {
              id:
                parsed.data
                  .userId,

              organizationId,

              status:
                'ACTIVE',

              role: {
                in: [
                  'SUPER_ADMIN',
                  'ADMIN',
                  'SUPERVISOR',
                  'AGENT',
                ],
              },
            },
          });

        if (!user) {
          return response
            .status(404)
            .json({
              success: false,

              message:
                'Agent not found',
            });
        }
      }

      const updated =
        await prisma.$transaction(
          async transaction => {
            const conversationUpdated =
              await transaction.conversation.update({
                where: {
                  id:
                    conversation.id,
                },

                data: {
                  assignedUserId:
                    parsed.data
                      .userId,
                },
              });

            await transaction.conversationEvent.create({
              data: {
                organizationId,

                conversationId:
                  conversation.id,

                actorUserId:
                  request.user!
                    .id,

                type:
                  parsed.data
                    .userId
                    ? 'ASSIGNED'
                    : 'UNASSIGNED',

                metadata:
                  parsed.data
                    .userId
                    ? {
                        assignedUserId:
                          parsed
                            .data
                            .userId,
                      }
                    : undefined,
              },
            });

            return conversationUpdated;
          },
        );

      return response.json({
        success: true,

        data:
          updated,
      });
    } catch (error) {
      console.error(
        'Assign conversation error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to assign conversation',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CHANGE CONVERSATION STATUS
|--------------------------------------------------------------------------
*/

app.patch(
  '/conversations/:id/status',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const schema =
        z.object({
          status:
            conversationStatusEnum,
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found',
          });
      }

      if (
        conversation.status ===
        parsed.data.status
      ) {
        return response.json({
          success: true,
          data:
            conversation,
        });
      }

      let eventType:
        | 'RESOLVED'
        | 'REOPENED'
        | 'CLOSED'
        | null = null;

      if (
        parsed.data.status ===
        'RESOLVED'
      ) {
        eventType =
          'RESOLVED';
      }

      if (
        parsed.data.status ===
          'OPEN' &&
        [
          'RESOLVED',
          'CLOSED',
        ].includes(
          conversation.status,
        )
      ) {
        eventType =
          'REOPENED';
      }

      if (
        parsed.data.status ===
        'CLOSED'
      ) {
        eventType =
          'CLOSED';
      }

      const updated =
        await prisma.$transaction(
          async transaction => {
            const result =
              await transaction.conversation.update({
                where: {
                  id:
                    conversation.id,
                },

                data: {
                  status:
                    parsed.data
                      .status,

                  resolvedAt:
                    parsed.data
                      .status ===
                    'RESOLVED'
                      ? new Date()
                      : null,

                  closedAt:
                    parsed.data
                      .status ===
                    'CLOSED'
                      ? new Date()
                      : null,
                },
              });

            if (
              eventType
            ) {
              await transaction.conversationEvent.create({
                data: {
                  organizationId,

                  conversationId:
                    conversation.id,

                  actorUserId:
                    request.user!
                      .id,

                  type:
                    eventType,
                },
              });
            }

            return result;
          },
        );

      return response.json({
        success: true,

        data:
          updated,
      });
    } catch (error) {
      console.error(
        'Change conversation status error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to update conversation status',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| PRIVATE NOTE
|--------------------------------------------------------------------------
*/

app.post(
  '/conversations/:id/notes',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const schema =
        z.object({
          body:
            z
              .string()
              .trim()
              .min(1),
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found',
          });
      }

      const message =
        await prisma.$transaction(
          async transaction => {
            const createdMessage =
              await transaction.message.create({
                data: {
                  organizationId,

                  conversationId:
                    conversation.id,

                  contactId:
                    conversation.contactId,

                  senderUserId:
                    request.user!
                      .id,

                  direction:
                    'INTERNAL',

                  type:
                    'NOTE',

                  body:
                    parsed.data
                      .body,

                  status:
                    'SENT',
                },
              });

            await transaction.conversationEvent.create({
              data: {
                organizationId,

                conversationId:
                  conversation.id,

                actorUserId:
                  request.user!
                    .id,

                type:
                  'NOTE_ADDED',
              },
            });

            return createdMessage;
          },
        );

      return response
        .status(201)
        .json({
          success: true,

          data:
            message,
        });
    } catch (error) {
      console.error(
        'Private note error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to add private note',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| INBOXES
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| LIST INBOXES
|--------------------------------------------------------------------------
*/

app.get(
  '/inboxes',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const inboxes =
        await prisma.inbox.findMany({
          where: {
            organizationId:
              request.user!
                .organizationId,
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
                conversations:
                  true,
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

        data:
          inboxes,
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
| CREATE INBOX
|--------------------------------------------------------------------------
*/

app.post(
  '/inboxes',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const schema =
        z.object({
          name:
            z
              .string()
              .trim()
              .min(2),

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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      /*
      |--------------------------------------------------------------------------
      | Validate team
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data.teamId
      ) {
        const team =
          await prisma.team.findFirst({
            where: {
              id:
                parsed.data
                  .teamId,

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
      | Validate channel account
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data
          .channelAccountId
      ) {
        const account =
          await prisma.channelAccount.findFirst({
            where: {
              id:
                parsed.data
                  .channelAccountId,

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

      const inbox =
        await prisma.inbox.create({
          data: {
            organizationId,

            name:
              parsed.data
                .name,

            teamId:
              parsed.data
                .teamId,

            channelAccountId:
              parsed.data
                .channelAccountId,
          },
        });

      return response
        .status(201)
        .json({
          success: true,

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

/*
|--------------------------------------------------------------------------
| LABELS
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| LIST LABELS
|--------------------------------------------------------------------------
*/

app.get(
  '/labels',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const labels =
        await prisma.label.findMany({
          where: {
            organizationId:
              request.user!
                .organizationId,
          },

          orderBy: {
            name: 'asc',
          },
        });

      return response.json({
        success: true,

        data:
          labels,
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
            'Failed to load labels',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CREATE LABEL
|--------------------------------------------------------------------------
*/

app.post(
  '/labels',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const schema =
        z.object({
          name:
            z
              .string()
              .trim()
              .min(1),

          color:
            z
              .string()
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      const existing =
        await prisma.label.findFirst({
          where: {
            organizationId,

            name:
              parsed.data
                .name,
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

      const label =
        await prisma.label.create({
          data: {
            organizationId,

            name:
              parsed.data
                .name,

            color:
              parsed.data
                .color,
          },
        });

      return response
        .status(201)
        .json({
          success: true,

          data:
            label,
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
            'Failed to create label',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| DELETE LABEL
|--------------------------------------------------------------------------
*/

app.delete(
  '/labels/:id',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const labelId =
        String(
          request.params.id,
        );

      const label =
        await prisma.label.findFirst({
          where: {
            id:
              labelId,

            organizationId:
              request.user!
                .organizationId,
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

      await prisma.label.delete({
        where: {
          id:
            label.id,
        },
      });

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
            'Failed to delete label',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| ATTACH LABEL TO CONVERSATION
|--------------------------------------------------------------------------
*/

app.post(
  '/conversations/:id/labels',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const schema =
        z.object({
          labelId:
            z
              .string()
              .uuid(),
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

            errors:
              parsed.error.flatten(),
          });
      }

      const organizationId =
        request.user!
          .organizationId;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found',
          });
      }

      const label =
        await prisma.label.findFirst({
          where: {
            id:
              parsed.data
                .labelId,

            organizationId,
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

      const relation =
        await prisma.conversationLabel.upsert({
          where: {
            conversationId_labelId:
              {
                conversationId:
                  conversation.id,

                labelId:
                  label.id,
              },
          },

          update: {},

          create: {
            organizationId,

            conversationId:
              conversation.id,

            labelId:
              label.id,
          },
        });

      return response
        .status(201)
        .json({
          success: true,

          data:
            relation,
        });
    } catch (error) {
      console.error(
        'Attach label error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to attach label',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| REMOVE LABEL FROM CONVERSATION
|--------------------------------------------------------------------------
*/

app.delete(
  '/conversations/:id/labels/:labelId',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const labelId =
        String(
          request.params
            .labelId,
        );

      const organizationId =
        request.user!
          .organizationId;

      const relation =
        await prisma.conversationLabel.findFirst({
          where: {
            organizationId,

            conversationId,

            labelId,
          },
        });

      if (!relation) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation label not found',
          });
      }

      await prisma.conversationLabel.delete({
        where: {
          id:
            relation.id,
        },
      });

      return response.json({
        success: true,

        message:
          'Label removed from conversation',
      });
    } catch (error) {
      console.error(
        'Remove conversation label error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to remove label',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| MARK CONVERSATION AS READ
|--------------------------------------------------------------------------
*/

app.post(
  '/conversations/:id/read',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const conversationId =
        String(
          request.params.id,
        );

      const organizationId =
        request.user!
          .organizationId;

      const userId =
        request.user!
          .id;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              conversationId,

            organizationId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found',
          });
      }

      const lastMessage =
        await prisma.message.findFirst({
          where: {
            conversationId:
              conversation.id,
          },

          orderBy: {
            createdAt:
              'desc',
          },
        });

      const read =
        await prisma.conversationRead.upsert({
          where: {
            conversationId_userId:
              {
                conversationId:
                  conversation.id,

                userId,
              },
          },

          update: {
            lastReadMessageId:
              lastMessage?.id,

            readAt:
              new Date(),
          },

          create: {
            organizationId,

            conversationId:
              conversation.id,

            userId,

            lastReadMessageId:
              lastMessage?.id,

            readAt:
              new Date(),
          },
        });

      return response.json({
        success: true,

        data:
          read,
      });
    } catch (error) {
      console.error(
        'Mark conversation read error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to mark conversation as read',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| PREVIOUS CONVERSATIONS FOR CONTACT
|--------------------------------------------------------------------------
*/

app.get(
  '/contacts/:contactId/conversations',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const contactId =
        String(
          request.params
            .contactId,
        );

      const organizationId =
        request.user!
          .organizationId;

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              contactId,

            organizationId,
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Contact not found',
          });
      }

      const conversations =
        await prisma.conversation.findMany({
          where: {
            organizationId,
            contactId: contact.id,
          },
          include: {
            assignedUser: {
              select: {
                id: true,
                name: true,
              },
            },
            messages: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
            labels: {
              include: {
                label: true,
              },
            },
          },
          orderBy: {
            createdAt:'desc',
          },
        });

      return response.json({
        success: true,

        data:
          conversations,
      });
    } catch (error) {
      console.error(
        'Previous conversations error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to load previous conversations',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CONTACT GALLERY
|--------------------------------------------------------------------------
*/

app.get(
  '/contacts/:contactId/gallery',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      const contactId =
        String(
          request.params
            .contactId,
        );

      const organizationId =
        request.user!
          .organizationId;

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              contactId,

            organizationId,
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Contact not found',
          });
      }

      const media =
        await prisma.message.findMany({
          where: {
            organizationId,

            contactId:
              contact.id,

            type: {
              in: [
                'IMAGE',
                'VIDEO',
                'AUDIO',
                'DOCUMENT',
              ],
            },
          },

          select: {
            id: true,

            conversationId:
              true,

            direction:
              true,

            type:
              true,

            body:
              true,

            mediaUrl:
              true,

            mimeType:
              true,

            createdAt:
              true,
          },

          orderBy: {
            createdAt:
              'desc',
          },
        });

      return response.json({
        success: true,

        data:
          media,
      });
    } catch (error) {
      console.error(
        'Contact gallery error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to load gallery',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| INTERNAL META
|--------------------------------------------------------------------------
|
| These endpoints must not be publicly trusted.
| They require x-internal-token.
|
*/

/*
|--------------------------------------------------------------------------
| INTERNAL CREATE/FIND/REOPEN CONVERSATION
|--------------------------------------------------------------------------
*/

app.post(
  '/internal/conversations/resolve',
  internalAuth,

  async (
    request,
    response,
  ) => {
    try {
      const schema =
        z.object({
          organizationId:
            z
              .string()
              .uuid(),

          contactId:
            z
              .string()
              .uuid(),

          channel:
            metaChannelEnum,

          channelAccountId:
            z
              .string()
              .uuid(),
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

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        organizationId,
        contactId,
        channel,
        channelAccountId,
      } = parsed.data;

      /*
      |--------------------------------------------------------------------------
      | Validate contact belongs to organization
      |--------------------------------------------------------------------------
      */

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              contactId,

            organizationId,
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Contact not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Validate account belongs to organization/channel
      |--------------------------------------------------------------------------
      */

      const channelAccount =
        await prisma.channelAccount.findFirst({
          where: {
            id:
              channelAccountId,

            organizationId,

            channel,

            status:
              'ACTIVE',
          },
        });

      if (
        !channelAccount
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Channel account not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Find most recent open/pending/resolved conversation
      |--------------------------------------------------------------------------
      */

      const existing =
        await prisma.conversation.findFirst({
          where: {
            organizationId,

            contactId,

            channel,

            channelAccountId,

            status: {
              in: [
                'OPEN',
                'PENDING',
                'RESOLVED',
              ],
            },
          },

          orderBy: {
            updatedAt:
              'desc',
          },
        });

      /*
      |--------------------------------------------------------------------------
      | Reopen resolved conversation
      |--------------------------------------------------------------------------
      */

      if (
        existing?.status ===
        'RESOLVED'
      ) {
        const reopened =
          await prisma.$transaction(
            async transaction => {
              const conversation =
                await transaction.conversation.update({
                  where: {
                    id:
                      existing.id,
                  },

                  data: {
                    status:
                      'OPEN',

                    resolvedAt:
                      null,
                  },
                });

              await transaction.conversationEvent.create({
                data: {
                  organizationId,

                  conversationId:
                    existing.id,

                  type:
                    'REOPENED',
                },
              });

              return conversation;
            },
          );

        return response.json({
          success: true,

          data:
            reopened,
        });
      }

      if (existing) {
        return response.json({
          success: true,

          data:
            existing,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Find inbox connected to account
      |--------------------------------------------------------------------------
      */

      const inbox =
        await prisma.inbox.findFirst({
          where: {
            organizationId,

            channelAccountId:
              channelAccount.id,

            status:
              'ACTIVE',
          },
        });

      /*
      |--------------------------------------------------------------------------
      | Create conversation
      |--------------------------------------------------------------------------
      */

      const conversation =
        await prisma.$transaction(
          async transaction => {
            const created =
              await transaction.conversation.create({
                data: {
                  organizationId,

                  contactId,

                  channel,

                  channelAccountId,

                  inboxId:
                    inbox?.id,
                },
              });

            await transaction.conversationEvent.create({
              data: {
                organizationId,

                conversationId:
                  created.id,

                type:
                  'CREATED',
              },
            });

            return created;
          },
        );

      return response
        .status(201)
        .json({
          success: true,

          data:
            conversation,
        });
    } catch (error) {
      console.error(
        'Internal resolve conversation error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to resolve conversation',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| INTERNAL CREATE MESSAGE
|--------------------------------------------------------------------------
*/

app.post(
  '/internal/messages',
  internalAuth,

  async (
    request,
    response,
  ) => {
    try {
      const schema =
        z.object({
          organizationId:
            z
              .string()
              .uuid(),

          conversationId:
            z
              .string()
              .uuid(),

          contactId:
            z
              .string()
              .uuid(),

          direction:
            z.enum([
              'INBOUND',
              'OUTBOUND',
            ]),

          type: z.enum([
            'TEXT',
            'IMAGE',
            'AUDIO',
            'VIDEO',
            'DOCUMENT',
            'LOCATION',
            'TEMPLATE',
            'INTERACTIVE',
          ]),

          body:
            z
              .string()
              .optional(),

          externalMessageId:
            z
              .string()
              .optional(),

          mediaUrl:
            z
              .string()
              .optional(),

          mimeType:
            z
              .string()
              .optional(),

          replyToMessageId:
            z
              .string()
              .optional(),

          status:
            messageStatusEnum,

          metadata:
            z
              .record(
                z.string(),
                z.any(),
              )
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

            errors:
              parsed.error.flatten(),
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Verify conversation belongs to organization and contact
      |--------------------------------------------------------------------------
      */

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id:
              parsed.data
                .conversationId,

            organizationId:
              parsed.data
                .organizationId,

            contactId:
              parsed.data
                .contactId,
          },
        });

      if (
        !conversation
      ) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Conversation not found or contact mismatch',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Idempotency check
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data
          .externalMessageId
      ) {
        const existing =
          await prisma.message.findFirst({
            where: {
              organizationId:
                parsed.data
                  .organizationId,

              externalMessageId:
                parsed.data
                  .externalMessageId,
            },
          });

        if (existing) {
          return response.json({
            success: true,

            data:
              existing,
          });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Create message
      |--------------------------------------------------------------------------
      */

      const message =
        await prisma.$transaction(
          async transaction => {
            const created =
              await transaction.message.create({
                data: {
                  organizationId:
                    parsed.data
                      .organizationId,

                  conversationId:
                    parsed.data
                      .conversationId,

                  contactId:
                    parsed.data
                      .contactId,

                  direction:
                    parsed.data
                      .direction,

                  type:
                    parsed.data
                      .type,

                  body:
                    parsed.data
                      .body,

                  externalMessageId:
                    parsed.data
                      .externalMessageId,

                  mediaUrl:
                    parsed.data
                      .mediaUrl,

                  mimeType:
                    parsed.data
                      .mimeType,

                  replyToMessageId:
                    parsed.data
                      .replyToMessageId,

                  status:
                    parsed.data
                      .status,

                  metadata:
                    parsed.data
                      .metadata,
                },
              });

            await transaction.conversation.update({
              where: {
                id:
                  conversation.id,
              },

              data: {
                lastMessageAt:
                  created.createdAt,
              },
            });

            await transaction.conversationEvent.create({
              data: {
                organizationId:
                  parsed.data
                    .organizationId,

                conversationId:
                  parsed.data
                    .conversationId,

                type:
                  parsed.data
                    .direction ===
                  'INBOUND'
                    ? 'MESSAGE_RECEIVED'
                    : 'MESSAGE_SENT',
              },
            });

            return created;
          },
        );

      return response
        .status(201)
        .json({
          success: true,

          data:
            message,
        });
    } catch (error) {
      console.error(
        'Internal create message error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to create message',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| INTERNAL UPDATE MESSAGE STATUS
|--------------------------------------------------------------------------
*/

app.patch(
  '/internal/messages/status',
  internalAuth,

  async (
    request,
    response,
  ) => {
    try {
      const schema =
        z.object({
          organizationId:
            z
              .string()
              .uuid(),

          externalMessageId:
            z
              .string()
              .min(1),

          status:
            z.enum([
              'SENT',
              'DELIVERED',
              'READ',
              'FAILED',
            ]),
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

            errors:
              parsed.error.flatten(),
          });
      }

      const message =
        await prisma.message.findFirst({
          where: {
            organizationId:
              parsed.data
                .organizationId,

            externalMessageId:
              parsed.data
                .externalMessageId,
          },
        });

      if (!message) {
        return response
          .status(404)
          .json({
            success: false,

            message:
              'Message not found',
          });
      }

      const updated =
        await prisma.message.update({
          where: {
            id:
              message.id,
          },

          data: {
            status:
              parsed.data
                .status,
          },
        });

      return response.json({
        success: true,

        data:
          updated,
      });
    } catch (error) {
      console.error(
        'Update message status error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            'Failed to update message status',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(
  (
    request,
    response,
  ) => {
    response
      .status(404)
      .json({
        success: false,

        message:
          `Route ${request.method} ${request.originalUrl} not found`,
      });
  },
);

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

const port =
  Number(
    process.env
      .CONVERSATIONS_PORT,
  ) || 4003;

app.listen(
  port,
  () => {
    console.log(
      `Conversation service running on http://localhost:${port}`,
    );
  },
);