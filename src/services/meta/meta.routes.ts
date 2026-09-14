import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../../shared/prisma';

import {
  authMiddleware,
  type AuthRequest,
} from '../../../shared/auth';

import {
  getMetaProvider,
} from './providers/provider.factory';

import {
  emitToConversation,
  emitToOrganization,
} from '../../realtime/socket';

import {
  ensureConversationChannelAccount,
} from '../conversations/channel-account.service';


const router =
  Router();


const metaChannelEnum =
  z.enum([
    'WHATSAPP',
    'FACEBOOK',
    'INSTAGRAM',
  ]);


/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

router.get(
  '/health',

  (
    _request,
    response,
  ) => {
    return response.json({
      success:
        true,

      service:
        'meta',

      graphVersion:
        process.env
          .META_GRAPH_VERSION ??
        'v26.0',
    });
  },
);


/*
|--------------------------------------------------------------------------
| List Accounts
|--------------------------------------------------------------------------
*/

router.get(
  '/accounts',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response,
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
              'Unauthorized',
          });
      }


      const accounts =
        await prisma
          .channelAccount
          .findMany({
            where: {
              organizationId:
                request.user
                  .organizationId,

              channel: {
                in: [
                  'WHATSAPP',
                  'FACEBOOK',
                  'INSTAGRAM',
                ],
              },
            },

            select: {
              id:
                true,

              channel:
                true,

              name:
                true,

              externalAccountId:
                true,

              phoneNumberId:
                true,

              pageId:
                true,

              instagramAccountId:
                true,

              status:
                true,

              metadata:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },

            orderBy: {
              createdAt:
                'desc',
            },
          });


      return response
        .status(200)
        .json({
          success:
            true,

          data:
            accounts,
        });
    } catch (
      error
    ) {
      console.error(
        'List Meta accounts error:',
        error,
      );


      return response
        .status(500)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : 'Failed to load Meta accounts',
        });
    }
  },
);


/*
|--------------------------------------------------------------------------
| Create Meta Channel Account
|--------------------------------------------------------------------------
*/

router.post(
  '/accounts',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response,
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
              'Unauthorized',
          });
      }


      const schema =
        z.object({
          channel:
            metaChannelEnum,

          name:
            z
              .string()
              .trim()
              .min(2),

          externalAccountId:
            z
              .string()
              .optional(),

          phoneNumberId:
            z
              .string()
              .optional(),

          pageId:
            z
              .string()
              .optional(),

          instagramAccountId:
            z
              .string()
              .optional(),

          accessToken:
            z
              .string()
              .min(10),

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


      if (
        !parsed.success
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errors:
              parsed.error
                .flatten(),
          });
      }


      if (
        parsed.data
          .channel ===
          'WHATSAPP' &&
        !parsed.data
          .phoneNumberId
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'phoneNumberId is required for WhatsApp',
          });
      }


      if (
        parsed.data
          .channel ===
          'FACEBOOK' &&
        !parsed.data
          .pageId
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'pageId is required for Facebook',
          });
      }


      if (
        parsed.data
          .channel ===
          'INSTAGRAM' &&
        !parsed.data
          .instagramAccountId
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'instagramAccountId is required for Instagram',
          });
      }


      const account =
        await prisma
          .channelAccount
          .create({
            data: {
              organizationId:
                request.user
                  .organizationId,

              channel:
                parsed.data
                  .channel,

              name:
                parsed.data
                  .name,

              externalAccountId:
                parsed.data
                  .externalAccountId,

              phoneNumberId:
                parsed.data
                  .phoneNumberId,

              pageId:
                parsed.data
                  .pageId,

              instagramAccountId:
                parsed.data
                  .instagramAccountId,

              accessToken:
                parsed.data
                  .accessToken,

              metadata:
                parsed.data
                  .metadata,

              status:
                'ACTIVE',
            },
          });


      /*
      |--------------------------------------------------------------------------
      | Never Return Access Token
      |--------------------------------------------------------------------------
      */

      return response
        .status(201)
        .json({
          success:
            true,

          data: {
            id:
              account.id,

            channel:
              account.channel,

            name:
              account.name,

            externalAccountId:
              account.externalAccountId,

            phoneNumberId:
              account.phoneNumberId,

            pageId:
              account.pageId,

            instagramAccountId:
              account.instagramAccountId,

            status:
              account.status,

            metadata:
              account.metadata,

            createdAt:
              account.createdAt,

            updatedAt:
              account.updatedAt,
          },
        });
    } catch (
      error
    ) {
      console.error(
        'Create Meta account error:',
        error,
      );


      return response
        .status(500)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : 'Failed to create account',
        });
    }
  },
);


/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
|
| POST /api/meta/conversations/:conversationId/messages
|
| Body:
|
| {
|   "type": "TEXT",
|   "body": "Hello from Bevatel",
|   "replyToMessageId": "optional-local-message-uuid"
| }
|
*/

router.post(
  '/conversations/:conversationId/messages',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response,
  ) => {
    try {
      /*
      |--------------------------------------------------------------------------
      | Authentication
      |--------------------------------------------------------------------------
      */

      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            message:
              'Unauthorized',
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Validate Request
      |--------------------------------------------------------------------------
      */

      const schema =
        z.object({
          type:
            z
              .literal(
                'TEXT',
              )
              .default(
                'TEXT',
              ),

          body:
            z
              .string()
              .trim()
              .min(1),

          replyToMessageId:
            z
              .string()
              .uuid()
              .optional(),
        });


      const parsed =
        schema.safeParse(
          request.body,
        );


      if (
        !parsed.success
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errors:
              parsed.error
                .flatten(),
          });
      }


      const organizationId =
        request.user
          .organizationId;


      const conversationId =
        String(
          request.params
            .conversationId,
        );


      /*
      |--------------------------------------------------------------------------
      | Verify Conversation Belongs To Organization
      |--------------------------------------------------------------------------
      |
      | We do this BEFORE calling ensureConversationChannelAccount().
      |
      | That keeps the repair service generic while preventing one organization
      | from attempting to repair another organization's conversation.
      |
      */

      const conversationExists =
        await prisma
          .conversation
          .findFirst({
            where: {
              id:
                conversationId,

              organizationId,

              channel: {
                in: [
                  'WHATSAPP',
                  'FACEBOOK',
                  'INSTAGRAM',
                ],
              },
            },

            select: {
              id:
                true,

              organizationId:
                true,

              channel:
                true,
            },
          });


      if (
        !conversationExists
      ) {
        return response
          .status(404)
          .json({
            success:
              false,

            message:
              'Conversation not found',
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Ensure Conversation Has Channel Account
      |--------------------------------------------------------------------------
      |
      | For old conversations:
      |
      | channelAccountId = null
      |
      | ensureConversationChannelAccount() will:
      |
      | 1. Load the conversation
      | 2. Find the active account for the same organization/channel
      | 3. Set channelAccountId
      | 4. Return the repaired conversation
      |
      */

      let conversation;

      try {
        conversation =
          await ensureConversationChannelAccount(
            conversationId,
          );
      } catch (
        error
      ) {
        console.error(
          'Ensure conversation channel account error:',
          error,
        );


        return response
          .status(422)
          .json({
            success:
              false,

            message:
              error instanceof Error
                ? error.message
                : 'Unable to resolve channel account',
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Organization Security Check
      |--------------------------------------------------------------------------
      */

      if (
        conversation
          .organizationId !==
        organizationId
      ) {
        return response
          .status(403)
          .json({
            success:
              false,

            message:
              'Forbidden',
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Channel Account Validation
      |--------------------------------------------------------------------------
      */

      if (
        !conversation
          .channelAccount
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'Unable to resolve channel account',
          });
      }


      if (
        conversation
          .channelAccount
          .status !==
        'ACTIVE'
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'Channel account is disabled',
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Find Contact Identity
      |--------------------------------------------------------------------------
      |
      | WHATSAPP conversation must use WHATSAPP identity.
      | FACEBOOK must use FACEBOOK identity.
      | INSTAGRAM must use INSTAGRAM identity.
      |
      */

      const identity =
        conversation
          .contact
          .identities
          .find(
            item =>
              item.channel ===
              conversation.channel,
          );


      if (
        !identity
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              `Contact has no ${conversation.channel} identity`,
          });
      }


      /*
      |--------------------------------------------------------------------------
      | Resolve Reply-To External Message ID
      |--------------------------------------------------------------------------
      */

      let replyExternalId:
        string | undefined;


      if (
        parsed.data
          .replyToMessageId
      ) {
        const replyMessage =
          await prisma
            .message
            .findFirst({
              where: {
                id:
                  parsed.data
                    .replyToMessageId,

                organizationId,

                conversationId:
                  conversation.id,
              },

              select: {
                externalMessageId:
                  true,
              },
            });


        if (
          !replyMessage
        ) {
          return response
            .status(404)
            .json({
              success:
                false,

              message:
                'Reply message not found',
            });
        }


        replyExternalId =
          replyMessage
            .externalMessageId ??
          undefined;
      }


      /*
      |--------------------------------------------------------------------------
      | Create QUEUED Local Message
      |--------------------------------------------------------------------------
      |
      | Save before calling Meta so our system has an audit trail even if
      | the provider call fails.
      |
      */

      const queuedMessage =
        await prisma
          .message
          .create({
            data: {
              organizationId,

              conversationId:
                conversation.id,

              contactId:
                conversation
                  .contactId,

              senderUserId:
                request.user
                  .id,

              direction:
                'OUTBOUND',

              type:
                'TEXT',

              body:
                parsed.data
                  .body,

              replyToMessageId:
                parsed.data
                  .replyToMessageId,

              status:
                'QUEUED',

              metadata: {
                provider:
                  'META',

                channel:
                  conversation
                    .channel,
              },
            },
          });


      /*
      |--------------------------------------------------------------------------
      | Socket: Message Created
      |--------------------------------------------------------------------------
      */

      emitToOrganization(
        organizationId,

        'message.created',

        queuedMessage,
      );


      emitToConversation(
        conversation.id,

        'message.created',

        queuedMessage,
      );


      /*
      |--------------------------------------------------------------------------
      | Send Through Meta Provider
      |--------------------------------------------------------------------------
      */

      try {
        const provider =
          getMetaProvider(
            conversation
              .channel as
              | 'WHATSAPP'
              | 'FACEBOOK'
              | 'INSTAGRAM',
          );


        const result =
          await provider.sendText({
            account: {
              id:
                conversation
                  .channelAccount
                  .id,

              organizationId:
                conversation
                  .channelAccount
                  .organizationId,

              channel:
                conversation
                  .channelAccount
                  .channel as
                  | 'WHATSAPP'
                  | 'FACEBOOK'
                  | 'INSTAGRAM',

              name:
                conversation
                  .channelAccount
                  .name,

              externalAccountId:
                conversation
                  .channelAccount
                  .externalAccountId,

              phoneNumberId:
                conversation
                  .channelAccount
                  .phoneNumberId,

              pageId:
                conversation
                  .channelAccount
                  .pageId,

              instagramAccountId:
                conversation
                  .channelAccount
                  .instagramAccountId,

              accessToken:
                conversation
                  .channelAccount
                  .accessToken,
            },

            recipientId:
              identity
                .externalId,

            body:
              parsed.data
                .body,

            replyToExternalMessageId:
              replyExternalId,
          });


        /*
        |--------------------------------------------------------------------------
        | Mark Message As SENT
        |--------------------------------------------------------------------------
        */

        const sentMessage =
          await prisma
            .$transaction(
              async transaction => {
                const updated =
                  await transaction
                    .message
                    .update({
                      where: {
                        id:
                          queuedMessage
                            .id,
                      },

                      data: {
                        status:
                          'SENT',

                        externalMessageId:
                          result
                            .externalMessageId,

                        metadata: {
                          provider:
                            'META',

                          channel:
                            conversation
                              .channel,

                          response:
                            result.raw as any,
                        },
                      },
                    });


                /*
                |--------------------------------------------------------------------------
                | Update Conversation
                |--------------------------------------------------------------------------
                */

                await transaction
                  .conversation
                  .update({
                    where: {
                      id:
                        conversation
                          .id,
                    },

                    data: {
                      lastMessageAt:
                        updated
                          .createdAt,
                    },
                  });


                /*
                |--------------------------------------------------------------------------
                | Conversation Event
                |--------------------------------------------------------------------------
                */

                await transaction
                  .conversationEvent
                  .create({
                    data: {
                      organizationId,

                      conversationId:
                        conversation
                          .id,

                      actorUserId:
                        request.user!
                          .id,

                      type:
                        'MESSAGE_SENT',
                    },
                  });


                return updated;
              },
            );


        /*
        |--------------------------------------------------------------------------
        | Socket: Message Status Updated
        |--------------------------------------------------------------------------
        */

        emitToOrganization(
          organizationId,

          'message.status.updated',

          sentMessage,
        );


        emitToConversation(
          conversation.id,

          'message.status.updated',

          sentMessage,
        );


        return response
          .status(201)
          .json({
            success:
              true,

            data:
              sentMessage,
          });
      } catch (
        providerError
      ) {
        /*
        |--------------------------------------------------------------------------
        | Mark Message As FAILED
        |--------------------------------------------------------------------------
        */

        const failed =
          await prisma
            .message
            .update({
              where: {
                id:
                  queuedMessage
                    .id,
              },

              data: {
                status:
                  'FAILED',

                metadata: {
                  provider:
                    'META',

                  channel:
                    conversation
                      .channel,

                  error:
                    providerError instanceof Error
                      ? providerError
                          .message
                      : String(
                          providerError,
                        ),
                },
              },
            });


        /*
        |--------------------------------------------------------------------------
        | Socket: Failed
        |--------------------------------------------------------------------------
        */

        emitToOrganization(
          organizationId,

          'message.status.updated',

          failed,
        );


        emitToConversation(
          conversation.id,

          'message.status.updated',

          failed,
        );


        throw providerError;
      }
    } catch (
      error
    ) {
      console.error(
        'Send Meta message error:',
        error,
      );


      return response
        .status(500)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : 'Message send failed',
        });
    }
  },
);


export default router;