import 'dotenv/config';

import axios from 'axios';
import { Worker } from 'bullmq';

import { prisma } from '../../../shared/prisma';

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

async function handleWhatsApp(
  payload: any,
) {
  const entries =
    payload?.entry ?? [];

  for (const entry of entries) {
    const changes =
      entry?.changes ?? [];

    for (const change of changes) {
      const value =
        change?.value;

      if (!value) {
        continue;
      }

      const phoneNumberId =
        value?.metadata
          ?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      const channelAccount =
        await prisma.channelAccount.findFirst({
          where: {
            channel:
              'WHATSAPP',

            phoneNumberId,

            status:
              'ACTIVE',
          },
        });

      if (!channelAccount) {
        console.warn(
          'No WhatsApp channel account for phone number:',
          phoneNumberId,
        );

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | MESSAGE STATUS EVENTS
      |--------------------------------------------------------------------------
      */

      const statuses =
        value?.statuses ?? [];

      for (const status of statuses) {
        const externalMessageId =
          status?.id;

        if (!externalMessageId) {
          continue;
        }

        let normalizedStatus:
          | 'SENT'
          | 'DELIVERED'
          | 'READ'
          | 'FAILED'
          | null = null;

        switch (status.status) {
          case 'sent':
            normalizedStatus =
              'SENT';
            break;

          case 'delivered':
            normalizedStatus =
              'DELIVERED';
            break;

          case 'read':
            normalizedStatus =
              'READ';
            break;

          case 'failed':
            normalizedStatus =
              'FAILED';
            break;
        }

        if (
          !normalizedStatus
        ) {
          continue;
        }

        const existingMessage =
          await prisma.message.findFirst({
            where: {
              externalMessageId,
            },
          });

        if (existingMessage) {
          await prisma.message.update({
            where: {
              id:
                existingMessage.id,
            },

            data: {
              status:
                normalizedStatus,
            },
          });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | INCOMING MESSAGES
      |--------------------------------------------------------------------------
      */

      const messages =
        value?.messages ?? [];

      for (const incoming of messages) {
        const sender =
          incoming?.from;

        if (!sender) {
          continue;
        }

        const externalMessageId =
          incoming?.id;

        const duplicate =
          externalMessageId
            ? await prisma.message.findFirst({
                where: {
                  organizationId:
                    channelAccount.organizationId,

                  externalMessageId,
                },
              })
            : null;

        if (duplicate) {
          continue;
        }

        /*
        |--------------------------------------------------------------------------
        | CONTACT
        |--------------------------------------------------------------------------
        */

        const profileName =
          value?.contacts?.[0]
            ?.profile?.name;

        let identity =
          await prisma.contactIdentity.findFirst({
            where: {
              organizationId:
                channelAccount.organizationId,

              channel:
                'WHATSAPP',

              externalId:
                sender,
            },

            include: {
              contact: true,
            },
          });

        let contact;

        if (identity) {
          contact =
            identity.contact;
        } else {
          contact =
            await prisma.$transaction(
              async transaction => {
                const newContact =
                  await transaction.contact.create({
                    data: {
                      organizationId:
                        channelAccount.organizationId,

                      displayName:
                        profileName ??
                        sender,

                      phone:
                        `+${sender}`,
                    },
                  });

                await transaction.contactIdentity.create({
                  data: {
                    organizationId:
                      channelAccount.organizationId,

                    contactId:
                      newContact.id,

                    channel:
                      'WHATSAPP',

                    externalId:
                      sender,

                    phone:
                      `+${sender}`,
                  },
                });

                return newContact;
              },
            );
        }

        /*
        |--------------------------------------------------------------------------
        | CONVERSATION
        |--------------------------------------------------------------------------
        */

        let conversation =
          await prisma.conversation.findFirst({
            where: {
              organizationId:
                channelAccount.organizationId,

              contactId:
                contact.id,

              channel:
                'WHATSAPP',

              channelAccountId:
                channelAccount.id,

              status: {
                in: [
                  'OPEN',
                  'PENDING',
                ],
              },
            },
          });

        if (!conversation) {
          conversation =
            await prisma.conversation.create({
              data: {
                organizationId:
                  channelAccount.organizationId,

                contactId:
                  contact.id,

                channel:
                  'WHATSAPP',

                channelAccountId:
                  channelAccount.id,
              },
            });

          await prisma.conversationEvent.create({
            data: {
              organizationId:
                channelAccount.organizationId,

              conversationId:
                conversation.id,

              type:
                'CREATED',
            },
          });
        }

        /*
        |--------------------------------------------------------------------------
        | NORMALIZE MESSAGE
        |--------------------------------------------------------------------------
        */

        let type:
          | 'TEXT'
          | 'IMAGE'
          | 'AUDIO'
          | 'VIDEO'
          | 'DOCUMENT'
          | 'LOCATION' =
          'TEXT';

        let body:
          string | undefined;

        let mediaUrl:
          string | undefined;

        switch (
          incoming.type
        ) {
          case 'text':
            type = 'TEXT';

            body =
              incoming.text?.body;
            break;

          case 'image':
            type = 'IMAGE';

            body =
              incoming.image?.caption;

            mediaUrl =
              incoming.image?.id;
            break;

          case 'audio':
            type = 'AUDIO';

            mediaUrl =
              incoming.audio?.id;
            break;

          case 'video':
            type = 'VIDEO';

            body =
              incoming.video?.caption;

            mediaUrl =
              incoming.video?.id;
            break;

          case 'document':
            type =
              'DOCUMENT';

            body =
              incoming.document
                ?.filename;

            mediaUrl =
              incoming.document
                ?.id;
            break;

          case 'location':
            type =
              'LOCATION';

            body =
              JSON.stringify(
                incoming.location,
              );
            break;
        }

        const message =
          await prisma.message.create({
            data: {
              organizationId:
                channelAccount.organizationId,

              conversationId:
                conversation.id,

              contactId:
                contact.id,

              direction:
                'INBOUND',

              type,

              body,

              mediaUrl,

              externalMessageId,

              status:
                'RECEIVED',

              metadata:
                incoming,
            },
          });

        await prisma.conversation.update({
          where: {
            id:
              conversation.id,
          },

          data: {
            lastMessageAt:
              message.createdAt,
          },
        });

        await prisma.conversationEvent.create({
          data: {
            organizationId:
              channelAccount.organizationId,

            conversationId:
              conversation.id,

            type:
              'MESSAGE_RECEIVED',
          },
        });
      }
    }
  }
}

const worker =
  new Worker(
    'meta-webhooks',

    async job => {
      const {
        receiptId,
        payload,
      } = job.data;

      if (
        payload?.object ===
        'whatsapp_business_account'
      ) {
        await handleWhatsApp(
          payload,
        );
      }

      await prisma.webhookReceipt.update({
        where: {
          id: receiptId,
        },

        data: {
          processedAt:
            new Date(),
        },
      });
    },

    {
      connection,
      concurrency: 10,
    },
  );

worker.on(
  'completed',
  job => {
    console.log(
      `Meta webhook processed: ${job.id}`,
    );
  },
);

worker.on(
  'failed',
  (job, error) => {
    console.error(
      `Meta webhook failed: ${job?.id}`,
      error,
    );
  },
);

console.log(
  'Meta webhook worker started',
);