import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import axios from 'axios';
import { Queue } from 'bullmq';
import { z } from 'zod';

import { prisma } from '../../../shared/prisma';

import {
  AuthRequest,
  authMiddleware,
} from '../../../shared/auth';

import {
  sendWhatsAppText,
} from './whatsapp';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

const connection = {
  host:
    process.env.REDIS_HOST ??
    '127.0.0.1',

  port:
    Number(
      process.env.REDIS_PORT ??
      6379,
    ),
};

const metaQueue =
  new Queue(
    'meta-webhooks',
    {
      connection,
    },
  );

app.get('/health', (_request, response) => {
  response.json({
    success: true,
    service: 'meta',
  });
});

app.post(
  '/meta/accounts',
  authMiddleware,

  async (request: AuthRequest, response) => {
    const schema = z.object({
      channel: z.enum([
        'WHATSAPP',
        'FACEBOOK',
        'INSTAGRAM',
      ]),

      name: z.string(),

      externalAccountId:
        z.string().optional(),

      phoneNumberId:
        z.string().optional(),

      pageId:
        z.string().optional(),

      instagramAccountId:
        z.string().optional(),

      accessToken:
        z.string(),
    });

    const parsed =
      schema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(422).json({
        success: false,
        errors:
          parsed.error.flatten(),
      });
    }

    const account =
      await prisma.channelAccount.create({
        data: {
          organizationId:
            request.user!.organizationId,

          ...parsed.data,
        },
      });

    response.status(201).json({
      success: true,
      data: {
        ...account,

        accessToken:
          undefined,
      },
    });
  },
);

app.get(
  '/meta/accounts',
  authMiddleware,

  async (request: AuthRequest, response) => {
    const accounts =
      await prisma.channelAccount.findMany({
        where: {
          organizationId:
            request.user!.organizationId,
        },

        select: {
          id: true,
          channel: true,
          name: true,
          externalAccountId: true,
          phoneNumberId: true,
          pageId: true,
          instagramAccountId: true,
          status: true,
          createdAt: true,
        },
      });

    response.json({
      success: true,
      data: accounts,
    });
  },
);

/*
|--------------------------------------------------------------------------
| META WEBHOOK VERIFICATION
|--------------------------------------------------------------------------
*/

app.get(
  '/webhooks/meta',
  (request, response) => {
    const mode =
      request.query['hub.mode'];

    const verifyToken =
      request.query[
        'hub.verify_token'
      ];

    const challenge =
      request.query[
        'hub.challenge'
      ];

    if (
      mode === 'subscribe' &&
      verifyToken ===
        process.env.META_VERIFY_TOKEN
    ) {
      return response
        .status(200)
        .send(challenge);
    }

    return response.sendStatus(403);
  },
);

/*
|--------------------------------------------------------------------------
| META WEBHOOK
|--------------------------------------------------------------------------
*/

app.post(
  '/webhooks/meta',
  async (request, response) => {
    const receipt =
      await prisma.webhookReceipt.create({
        data: {
          source: 'META',
          payload: request.body,
        },
      });

    await metaQueue.add(
      'meta-event',

      {
        receiptId:
          receipt.id,

        payload:
          request.body,
      },

      {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    response.sendStatus(200);
  },
);

app.post(
  '/meta/conversations/:conversationId/messages',
  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    const schema = z.object({
      text:
        z.string().min(1),
    });

    const parsed =
      schema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(422).json({
        success: false,
        errors:
          parsed.error.flatten(),
      });
    }

    const conversation =
      await prisma.conversation.findFirst({
        where: {
          id:
            request.params.conversationId,

          organizationId:
            request.user!.organizationId,
        },

        include: {
          contact: {
            include: {
              identities: true,
            },
          },

          channelAccount: true,
        },
      });

    if (!conversation) {
      return response.status(404).json({
        success: false,
        message:'Conversation not found',
      });
    }

    if (conversation.channel !== 'WHATSAPP') {
      return response.status(400).json({
        success: false,
        message: 'Currently only WhatsApp sending is implemented',
      });
    }

    const identity =
      conversation.contact.identities.find(
        identity => identity.channel === 'WHATSAPP',
      );

    if (!identity) {
      return response.status(422).json({
        success: false,
        message:
          'Contact has no WhatsApp identity',
      });
    }

    if (!conversation.channelAccount) {
      return response.status(422).json({
        success: false,
        message:
          'Conversation has no channel account',
      });
    }

    const phoneNumberId =
      conversation.channelAccount
        .phoneNumberId;

    if (!phoneNumberId) {
      return response.status(422).json({
        success: false,
        message:
          'WhatsApp phoneNumberId missing',
      });
    }

    const result =
      await sendWhatsAppText({
        phoneNumberId,

        accessToken:
          conversation.channelAccount
            .accessToken,

        to:identity.externalId,

        text:
          parsed.data.text,
      });

    const externalMessageId =
      result?.messages?.[0]?.id;

    const message =
      await prisma.message.create({
        data: {
          organizationId: request.user!.organizationId,
          conversationId: conversation.id,
          contactId: conversation.contactId,
          senderUserId: request.user!.id,
          direction: 'OUTBOUND',
          type: 'TEXT',
          body: parsed.data.text,
          externalMessageId,
          status: 'SENT',
          metadata: result,
        },
      });

    await prisma.conversation.update({
      where: {
        id:conversation.id,
      },

      data: {
        lastMessageAt:
          message.createdAt,
      },
    });

    await prisma.conversationEvent.create({
      data: {
        organizationId:
          request.user!.organizationId,

        conversationId:
          conversation.id,

        actorUserId:
          request.user!.id,

        type:
          'MESSAGE_SENT',
      },
    });

    response.status(201).json({
      success: true,
      data: message,
    });
  },
);

const port =
  Number(process.env.META_PORT) ||
  4004;

app.listen(port, () => {
  console.log(
    `Meta service running on http://localhost:${port}`,
  );
});