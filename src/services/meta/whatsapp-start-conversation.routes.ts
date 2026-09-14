import {
  Router,
  type NextFunction,
  type Response,
} from 'express';

import axios from 'axios';
import { z } from 'zod';

import {
  prisma,
} from '../../../shared/prisma';

import {
  authMiddleware,
  type AuthRequest,
} from '../../../shared/auth';

const router =
  Router();

const startConversationSchema =
  z.object({
    channelAccountId:
      z
        .string()
        .trim()
        .min(
          1,
          'Channel account ID is required',
        ),

    phone:
      z
        .string()
        .trim()
        .min(
          8,
          'Phone number is required',
        ),

    displayName:
      z
        .string()
        .trim()
        .min(
          1,
          'Display name is required',
        )
        .optional(),

    mode:
      z.enum([
        'TEXT',
        'TEMPLATE',
      ]),

    body:
      z
        .string()
        .trim()
        .optional(),

    templateName:
      z
        .string()
        .trim()
        .optional(),

    templateLanguage:
      z
        .string()
        .trim()
        .default(
          'en_US',
        ),
  })
  .superRefine(
    (
      data,
      context,
    ) => {
      if (
        data.mode ===
          'TEXT' &&
        !data.body
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,

          path: [
            'body',
          ],

          message:
            'Message body is required when mode is TEXT',
        });
      }

      if (
        data.mode ===
          'TEMPLATE' &&
        !data.templateName
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,

          path: [
            'templateName',
          ],

          message:
            'Template name is required when mode is TEMPLATE',
        });
      }
    },
  );

function normalizePhone(
  phone:
    string,
): string {
  return phone
    .replace(
      /[^\d]/g,
      '',
    )
    .replace(
      /^00/,
      '',
    );
}

router.post(
  '/start-conversation',

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

      const parsed =
        startConversationSchema.safeParse(
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

            message:
              'The submitted WhatsApp conversation data is invalid.',

            code:
              'VALIDATION_ERROR',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        channelAccountId,
        phone,
        displayName,
        mode,
        body,
        templateName,
        templateLanguage,
      } =
        parsed.data;

      const normalizedPhone =
        normalizePhone(
          phone,
        );

      const channelAccount =
        await prisma.channelAccount.findFirst({
          where: {
            id:
              channelAccountId,

            organizationId:
              request.user.organizationId,

            channel:
              'WHATSAPP',

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
            success:
              false,

            message:
              'The selected WhatsApp Business account was not found or is inactive.',

            code:
              'WHATSAPP_ACCOUNT_NOT_FOUND',
          });
      }

      if (
        !channelAccount.phoneNumberId
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'The selected WhatsApp account does not have a phoneNumberId.',

            code:
              'PHONE_NUMBER_ID_MISSING',
          });
      }

      if (
        !channelAccount.accessToken
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'The selected WhatsApp account does not have an access token.',

            code:
              'ACCESS_TOKEN_MISSING',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Find or create contact
      |--------------------------------------------------------------------------
      */

      let contact =
        await prisma.contact.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            phone:
              normalizedPhone,
          },
        });

      if (
        !contact
      ) {
        contact =
          await prisma.contact.create({
            data: {
              organizationId:
                request.user.organizationId,

              displayName:
                displayName ??
                normalizedPhone,

              phone:
                normalizedPhone,

              status:
                'ACTIVE',
            },
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Find or create WhatsApp identity
      |--------------------------------------------------------------------------
      */

      const existingIdentity =
        await prisma.contactIdentity.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            channel:
              'WHATSAPP',

            externalId:
              normalizedPhone,
          },
        });

      if (
        !existingIdentity
      ) {
        await prisma.contactIdentity.create({
          data: {
            organizationId:
              request.user.organizationId,

            contactId:
              contact.id,

            channel:
              'WHATSAPP',

            externalId:
              normalizedPhone,

            phone:
              normalizedPhone,
          },
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Find active/open conversation
      |--------------------------------------------------------------------------
      */

      let conversation =
        await prisma.conversation.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            contactId:
              contact.id,

            channelAccountId:
              channelAccount.id,

            channel:
              'WHATSAPP',

            status: {
              in: [
                'OPEN',
                'PENDING',
              ],
            },
          },

          orderBy: {
            createdAt:
              'desc',
          },
        });

      /*
      |--------------------------------------------------------------------------
      | Create conversation
      |--------------------------------------------------------------------------
      */

      if (
        !conversation
      ) {
        conversation =
          await prisma.conversation.create({
            data: {
              organizationId:
                request.user.organizationId,

              contactId:
                contact.id,

              channelAccountId:
                channelAccount.id,

              channel:
                'WHATSAPP',

              status:
                'OPEN',

              priority:
                'NORMAL',

              openedAt:
                new Date(),

              lastMessageAt:
                new Date(),
            },
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Build Meta request
      |--------------------------------------------------------------------------
      */

      const graphVersion =
        process.env.META_GRAPH_VERSION ??
        'v26.0';

      const metaUrl =
        `https://graph.facebook.com/${graphVersion}/${channelAccount.phoneNumberId}/messages`;

      let metaPayload:
        Record<
          string,
          unknown
        >;

      if (
        mode ===
        'TEMPLATE'
      ) {
        metaPayload = {
          messaging_product:
            'whatsapp',

          recipient_type:
            'individual',

          to:
            normalizedPhone,

          type:
            'template',

          template: {
            name:
              templateName,

            language: {
              code:
                templateLanguage,
            },
          },
        };
      } else {
        metaPayload = {
          messaging_product:
            'whatsapp',

          recipient_type:
            'individual',

          to:
            normalizedPhone,

          type:
            'text',

          text: {
            preview_url:
              false,

            body:
              body,
          },
        };
      }

      /*
      |--------------------------------------------------------------------------
      | Send to Meta
      |--------------------------------------------------------------------------
      */

      let metaResponseData:
        any;

      try {
        const metaResponse =
          await axios.post(
            metaUrl,

            metaPayload,

            {
              headers: {
                Authorization:
                  `Bearer ${channelAccount.accessToken}`,

                'Content-Type':
                  'application/json',
              },

              timeout:
                20000,
            },
          );

        metaResponseData =
          metaResponse.data;
      } catch (
        error:
          any
      ) {
        const metaError =
          error?.response?.data ??
          error?.message ??
          error;

        console.error(
          'WhatsApp send error:',
          metaError,
        );

        return response
          .status(
            error?.response?.status ??
            502,
          )
          .json({
            success:
              false,

            message:
              error?.response?.data?.error?.message ??
              'Meta rejected the WhatsApp message.',

            code:
              'META_SEND_FAILED',

            details:
              error?.response?.data ??
              undefined,
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Extract Meta message ID
      |--------------------------------------------------------------------------
      */

      const externalMessageId =
        metaResponseData?.messages?.[0]?.id ??
        null;

      /*
      |--------------------------------------------------------------------------
      | Save outbound message
      |--------------------------------------------------------------------------
      */

      const message =
        await prisma.message.create({
          data: {
            organizationId:
              request.user.organizationId,

            conversationId:
              conversation.id,

            contactId:
              contact.id,

            senderUserId:
              request.user.id,

            direction:
              'OUTBOUND',

            type:
              mode ===
              'TEMPLATE'
                ? 'TEMPLATE'
                : 'TEXT',

            body:
              mode ===
              'TEXT'
                ? body
                : templateName,

            externalMessageId,

            status:
              'SENT',

            metadata: {
              provider:
                'meta',

              channel:
                'whatsapp',

              mode,

              metaResponse:
                metaResponseData,

              templateName:
                templateName ??
                null,

              templateLanguage:
                templateLanguage ??
                null,
            },
          },
        });

      /*
      |--------------------------------------------------------------------------
      | Update conversation
      |--------------------------------------------------------------------------
      */

      conversation =
        await prisma.conversation.update({
          where: {
            id:
              conversation.id,
          },

          data: {
            lastMessageAt:
              new Date(),
          },
        });

      /*
      |--------------------------------------------------------------------------
      | Return result
      |--------------------------------------------------------------------------
      */

      return response
        .status(201)
        .json({
          success:
            true,

          message:
            mode ===
            'TEMPLATE'
              ? 'WhatsApp template message sent successfully.'
              : 'WhatsApp message sent successfully.',

          data: {
            contact: {
              id:
                contact.id,

              displayName:
                contact.displayName,

              phone:
                contact.phone,
            },

            conversation: {
              id:
                conversation.id,

              channel:
                conversation.channel,

              status:
                conversation.status,

              channelAccountId:
                conversation.channelAccountId,

              lastMessageAt:
                conversation.lastMessageAt,
            },

            message: {
              id:
                message.id,

              direction:
                message.direction,

              type:
                message.type,

              body:
                message.body,

              status:
                message.status,

              externalMessageId:
                message.externalMessageId,

              createdAt:
                message.createdAt,
            },

            provider: {
              messageId:
                externalMessageId,
            },
          },
        });
    } catch (
      error
    ) {
      console.error(
        'Start WhatsApp conversation error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

export default router;