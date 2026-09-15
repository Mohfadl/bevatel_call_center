import 'dotenv/config';

import {
  Worker,
  Job,
} from 'bullmq';

import {
  MessageType,
  Prisma,
} from '../../../generated/prisma/client';

import {
  emitToOrganization,
  emitToConversation,
} from '../../realtime/socket';

import {
  prisma,
} from '../../../shared/prisma';


const META_QUEUE_NAME =
  'meta-webhooks';
 

let metaWorker:
  Worker<MetaWebhookJobData> | null =
  null;


type MetaWebhookJobData = {
  receiptId: string;
};


type WhatsAppMetadata = {
  display_phone_number?: string;
  phone_number_id?: string;
};


type WhatsAppContact = {
  profile?: {
    name?: string;
  };

  wa_id?: string;
};


type WhatsAppTextMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;

  text?: {
    body?: string;
  };

  context?: {
    from?: string;
    id?: string;
  };

  image?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
  };

  video?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
  };

  audio?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
  };

  document?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    filename?: string;
    caption?: string;
  };

  sticker?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    animated?: boolean;
  };

  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };

  contacts?: unknown[];

  interactive?: unknown;
  button?: unknown;

  [key: string]: unknown;
};


type WhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;

  conversation?: unknown;
  pricing?: unknown;
  errors?: unknown[];

  [key: string]: unknown;
};


type WhatsAppValue = {
  messaging_product?: string;

  metadata?: WhatsAppMetadata;

  contacts?: WhatsAppContact[];

  messages?: WhatsAppTextMessage[];

  statuses?: WhatsAppStatus[];

  [key: string]: unknown;
};


type MetaChange = {
  field?: string;
  value?: WhatsAppValue;
};


type MetaEntry = {
  id?: string;
  changes?: MetaChange[];
};


type MetaWebhookPayload = {
  object?: string;
  entry?: MetaEntry[];
};


function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}


/*
|--------------------------------------------------------------------------
| Convert WhatsApp Status To Local Status
|--------------------------------------------------------------------------
*/

function mapWhatsAppStatus(
  status?: string,
):
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | null {
  switch (
    String(
      status ?? '',
    ).toLowerCase()
  ) {
    case 'sent':
      return 'SENT';

    case 'delivered':
      return 'DELIVERED';

    case 'read':
      return 'READ';

    case 'failed':
      return 'FAILED';

    default:
      return null;
  }
}


/*
|--------------------------------------------------------------------------
| Resolve Incoming Message Type
|--------------------------------------------------------------------------
*/

function resolveMessageType(
  type?: string,
): MessageType {
  switch (
    String(type ?? '').toLowerCase()
  ) {
    case 'text':
      return MessageType.TEXT;

    case 'image':
      return MessageType.IMAGE;

    case 'video':
      return MessageType.VIDEO;

    case 'audio':
      return MessageType.AUDIO;

    case 'document':
      return MessageType.DOCUMENT;

    case 'location':
      return MessageType.LOCATION;

    case 'contacts':
      return MessageType.CONTACT;

    case 'sticker':
      return MessageType.STICKER;

    case 'interactive':
      return MessageType.INTERACTIVE;

    case 'template':
      return MessageType.TEMPLATE;

    default:
      return MessageType.TEXT;
  }
}


/*
|--------------------------------------------------------------------------
| Resolve Message Body
|--------------------------------------------------------------------------
*/

function resolveMessageBody(
  message: WhatsAppTextMessage,
): string | null {
  const type =
    String(
      message.type ?? '',
    ).toLowerCase();


  if (
    type === 'text'
  ) {
    return (
      message.text
        ?.body ??
      null
    );
  }


  if (
    type === 'image'
  ) {
    return (
      message.image
        ?.caption ??
      null
    );
  }


  if (
    type === 'video'
  ) {
    return (
      message.video
        ?.caption ??
      null
    );
  }


  if (
    type === 'document'
  ) {
    return (
      message.document
        ?.caption ??
      message.document
        ?.filename ??
      null
    );
  }


  if (
    type === 'location'
  ) {
    const location =
      message.location;

    if (
      !location
    ) {
      return null;
    }

    const parts = [
      location.name,
      location.address,
    ].filter(
      Boolean,
    );

    if (
      parts.length > 0
    ) {
      return parts.join(
        ' - ',
      );
    }

    if (
      location.latitude !==
        undefined &&
      location.longitude !==
        undefined
    ) {
      return `${location.latitude}, ${location.longitude}`;
    }

    return null;
  }


  return null;
}


/*
|--------------------------------------------------------------------------
| Resolve MIME Type
|--------------------------------------------------------------------------
*/

function resolveMimeType(
  message: WhatsAppTextMessage,
): string | null {
  switch (
    String(
      message.type ?? '',
    ).toLowerCase()
  ) {
    case 'image':
      return (
        message.image
          ?.mime_type ??
        null
      );

    case 'video':
      return (
        message.video
          ?.mime_type ??
        null
      );

    case 'audio':
      return (
        message.audio
          ?.mime_type ??
        null
      );

    case 'document':
      return (
        message.document
          ?.mime_type ??
        null
      );

    case 'sticker':
      return (
        message.sticker
          ?.mime_type ??
        null
      );

    default:
      return null;
  }
}


/*
|--------------------------------------------------------------------------
| Resolve Meta Media ID
|--------------------------------------------------------------------------
|
| We currently store the Meta media ID in metadata.
|
| Downloading Meta media and generating mediaUrl should be handled by a
| dedicated media service later.
|
*/

function resolveMediaId(
  message: WhatsAppTextMessage,
): string | null {
  switch (
    String(
      message.type ?? '',
    ).toLowerCase()
  ) {
    case 'image':
      return (
        message.image
          ?.id ??
        null
      );

    case 'video':
      return (
        message.video
          ?.id ??
        null
      );

    case 'audio':
      return (
        message.audio
          ?.id ??
        null
      );

    case 'document':
      return (
        message.document
          ?.id ??
        null
      );

    case 'sticker':
      return (
        message.sticker
          ?.id ??
        null
      );

    default:
      return null;
  }
}


/*
|--------------------------------------------------------------------------
| Process WhatsApp Status
|--------------------------------------------------------------------------
*/

async function processWhatsAppStatus(
  status: WhatsAppStatus,
) {
  const externalMessageId =
    status.id;

  if (
    !externalMessageId
  ) {
    console.log(
      'Skipping WhatsApp status without message ID',
    );

    return;
  }


  const mappedStatus =
    mapWhatsAppStatus(
      status.status,
    );


  if (
    !mappedStatus
  ) {
    console.log(
      `Ignoring unsupported WhatsApp status: ${status.status ?? 'unknown'}`,
    );

    return;
  }


  const existingMessage =
    await prisma
      .message
      .findFirst({
        where: {
          externalMessageId,
        },
      });


  if (
    !existingMessage
  ) {
    console.log(
      `Outbound message not found for Meta status: ${externalMessageId}`,
    );

    return;
  }


  /*
  |--------------------------------------------------------------------------
  | Prevent Status Regression
  |--------------------------------------------------------------------------
  |
  | READ should not become DELIVERED later.
  | DELIVERED should not become SENT later.
  |
  */

  const statusRank:
    Record<string, number> = {
      QUEUED: 0,
      SENT: 1,
      DELIVERED: 2,
      READ: 3,
      FAILED: 4,
    };


  const currentRank =
    statusRank[
      existingMessage
        .status
    ] ?? 0;


  const incomingRank =
    statusRank[
      mappedStatus
    ] ?? 0;


  if (
    mappedStatus !==
      'FAILED' &&
    existingMessage
      .status !==
      'FAILED' &&
    incomingRank <
      currentRank
  ) {
    console.log(
      `Ignoring status regression ${existingMessage.status} -> ${mappedStatus}`,
    );

    return;
  }


  if (
    existingMessage
      .status ===
    mappedStatus
  ) {
    console.log(
      `Message already has status ${mappedStatus}: ${externalMessageId}`,
    );

    return;
  }


  const updatedMessage =
    await prisma
      .message
      .update({
        where: {
          id:
            existingMessage
              .id,
        },

        data: {
          status:
            mappedStatus,

          metadata: {
            provider:
              'META',

            ...(typeof existingMessage
              .metadata ===
              'object' &&
            existingMessage
              .metadata !==
              null &&
            !Array.isArray(
              existingMessage
                .metadata,
            )
              ? existingMessage
                  .metadata
              : {}),

            lastStatusWebhook: toPrismaJson(status),
          },
        },
      });


  console.log(
    `Message status updated: ${externalMessageId} -> ${mappedStatus}`,
  );


  emitToOrganization(
    existingMessage
      .organizationId,

    'message.status.updated',

    updatedMessage,
  );


  emitToConversation(
    existingMessage
      .conversationId,

    'message.status.updated',

    updatedMessage,
  );
}


/*
|--------------------------------------------------------------------------
| Process Incoming WhatsApp Message
|--------------------------------------------------------------------------
*/

async function processWhatsAppMessage(
  value: WhatsAppValue,
  incomingMessage: WhatsAppTextMessage,
) {
  const phoneNumberId =
    value.metadata
      ?.phone_number_id;


  const externalMessageId =
    incomingMessage.id;


  const senderExternalId =
    incomingMessage.from;


  console.log(
    'Processing inbound WhatsApp message',
  );

  console.log(
    'Phone Number ID:',
    phoneNumberId ??
      'missing',
  );

  console.log(
    'External Message ID:',
    externalMessageId ??
      'missing',
  );

  console.log(
    'Sender:',
    senderExternalId ??
      'missing',
  );


  if (
    !phoneNumberId
  ) {
    throw new Error(
      'Inbound WhatsApp webhook is missing metadata.phone_number_id',
    );
  }


  if (
    !externalMessageId
  ) {
    throw new Error(
      'Inbound WhatsApp webhook is missing message.id',
    );
  }


  if (
    !senderExternalId
  ) {
    throw new Error(
      'Inbound WhatsApp webhook is missing message.from',
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Resolve Channel Account
  |--------------------------------------------------------------------------
  */

  const channelAccount =
    await prisma
      .channelAccount
      .findFirst({
        where: {
          channel:
            'WHATSAPP',

          phoneNumberId,

          status:
            'ACTIVE',
        },
      });


  if (
    !channelAccount
  ) {
    throw new Error(
      `Active WhatsApp ChannelAccount not found for phoneNumberId ${phoneNumberId}`,
    );
  }


  const organizationId =
    channelAccount
      .organizationId;


  console.log(
    'Channel account resolved:',
    channelAccount.id,
  );

  console.log(
    'Organization:',
    organizationId,
  );


  /*
  |--------------------------------------------------------------------------
  | Idempotency
  |--------------------------------------------------------------------------
  */

  const duplicateMessage =
    await prisma
      .message
      .findFirst({
        where: {
          organizationId,

          externalMessageId,
        },
      });


  if (
    duplicateMessage
  ) {
    console.log(
      `Inbound message already exists: ${externalMessageId}`,
    );

    return duplicateMessage;
  }


  /*
  |--------------------------------------------------------------------------
  | Resolve Meta Contact Data
  |--------------------------------------------------------------------------
  */

  const webhookContact =
    value.contacts
      ?.find(
        contact =>
          contact.wa_id ===
          senderExternalId,
      ) ??
    value.contacts?.[0];


  const displayName =
    webhookContact
      ?.profile
      ?.name
      ?.trim() ||
    senderExternalId;


  /*
  |--------------------------------------------------------------------------
  | Find Existing WhatsApp Identity
  |--------------------------------------------------------------------------
  */

  let identity =
    await prisma
      .contactIdentity
      .findUnique({
        where: {
          organizationId_channel_externalId:
            {
              organizationId,

              channel:
                'WHATSAPP',

              externalId:
                senderExternalId,
            },
        },

        include: {
          contact:
            true,
        },
      });


  let contact;


  if (
    identity
  ) {
    contact =
      identity.contact;


    console.log(
      'Existing WhatsApp contact resolved:',
      contact.id,
    );


    /*
    |--------------------------------------------------------------------------
    | Keep Name / Phone Fresh
    |--------------------------------------------------------------------------
    */

    contact =
      await prisma
        .contact
        .update({
          where: {
            id:
              contact.id,
          },

          data: {
            phone:
              contact.phone ??
              senderExternalId,

            displayName:
              displayName ||
              contact.displayName,
          },
        });


    identity =
      await prisma
        .contactIdentity
        .update({
          where: {
            id:
              identity.id,
          },

          data: {
            phone:
              senderExternalId,

            metadata: {
              provider:
                'META',

              profileName:
                displayName,

              webhookContact: webhookContact ? toPrismaJson(webhookContact) : null,
            },
          },

          include: {
            contact:
              true,
          },
        });
  } else {
    /*
    |--------------------------------------------------------------------------
    | Create Contact + Identity
    |--------------------------------------------------------------------------
    */

    const result =
      await prisma
        .$transaction(
          async transaction => {
            const createdContact =
              await transaction
                .contact
                .create({
                  data: {
                    organizationId,

                    displayName,

                    phone:
                      senderExternalId,

                    status:
                      'ACTIVE',

                    attributes: {
                      source:
                        'META',

                      channel:
                        'WHATSAPP',
                    },
                  },
                });


            const createdIdentity =
              await transaction
                .contactIdentity
                .create({
                  data: {
                    organizationId,

                    contactId:
                      createdContact
                        .id,

                    channel:
                      'WHATSAPP',

                    externalId:
                      senderExternalId,

                    phone:
                      senderExternalId,

                    metadata: {
                      provider:
                        'META',

                      profileName:
                        displayName,

                      webhookContact:
                        webhookContact ??
                        null,
                    },
                  },
                });


            return {
              contact:
                createdContact,

              identity:
                createdIdentity,
            };
          },
        );


    contact =
      result.contact;


    console.log(
      'New WhatsApp contact created:',
      contact.id,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Find Inbox
  |--------------------------------------------------------------------------
  |
  | If an inbox is linked to this ChannelAccount, attach the conversation.
  |
  */

  const inbox =
    await prisma
      .inbox
      .findFirst({
        where: {
          organizationId,

          channelAccountId:
            channelAccount.id,

          status:
            'ACTIVE',
        },

        orderBy: {
          createdAt:
            'asc',
        },
      });


  /*
  |--------------------------------------------------------------------------
  | Find Existing Conversation
  |--------------------------------------------------------------------------
  */

  let conversation =
    await prisma
      .conversation
      .findFirst({
        where: {
          organizationId,

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

        orderBy: {
          createdAt:
            'desc',
        },
      });


  let conversationCreated =
    false;


  if (
    !conversation
  ) {
    conversation =
      await prisma
        .conversation
        .create({
          data: {
            organizationId,

            contactId:
              contact.id,

            channelAccountId:
              channelAccount.id,

            inboxId:
              inbox?.id ??
              null,

            channel:
              'WHATSAPP',

            status:
              'OPEN',

            priority:
              'NORMAL',

            openedAt:
              new Date(),
          },
        });


    conversationCreated =
      true;


    console.log(
      'New WhatsApp conversation created:',
      conversation.id,
    );
  } else {
    console.log(
      'Existing WhatsApp conversation resolved:',
      conversation.id,
    );


    /*
    |--------------------------------------------------------------------------
    | Repair Inbox When Missing
    |--------------------------------------------------------------------------
    */

    if (
      !conversation
        .inboxId &&
      inbox
    ) {
      conversation =
        await prisma
          .conversation
          .update({
            where: {
              id:
                conversation.id,
            },

            data: {
              inboxId:
                inbox.id,
            },
          });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Resolve Message Data
  |--------------------------------------------------------------------------
  */

const messageType =
  resolveMessageType(
    incomingMessage.type,
  );


  const body =
    resolveMessageBody(
      incomingMessage,
    );


  const mimeType =
    resolveMimeType(
      incomingMessage,
    );


  const mediaId =
    resolveMediaId(
      incomingMessage,
    );


  /*
  |--------------------------------------------------------------------------
  | Resolve Reply-To Message
  |--------------------------------------------------------------------------
  */

  let replyToMessageId:
    string | null =
    null;


  if (
    incomingMessage
      .context
      ?.id
  ) {
    const replyMessage =
      await prisma
        .message
        .findFirst({
          where: {
            organizationId,

            conversationId:
              conversation.id,

            externalMessageId:
              incomingMessage
                .context
                .id,
          },

          select: {
            id:
              true,
          },
        });


    replyToMessageId =
      replyMessage?.id ??
      null;
  }


  /*
  |--------------------------------------------------------------------------
  | Create Inbound Message + Update Conversation
  |--------------------------------------------------------------------------
  */

  const createdMessage =
    await prisma
      .$transaction(
        async transaction => {
          const message =
            await transaction
              .message
              .create({
                data: {
                  organizationId,

                  conversationId:
                    conversation.id,

                  contactId:
                    contact.id,

                  senderUserId:
                    null,

                  direction:
                    'INBOUND',

                  type:
                    messageType,

                  body,

                  mediaUrl:
                    null,

                  mimeType,

                  externalMessageId,

                  replyToMessageId,

                  status:
                    'RECEIVED',

                  metadata: {
                    provider:
                      'META',

                    channel:
                      'WHATSAPP',

                    phoneNumberId,

                    senderExternalId,

                    mediaId,

                    whatsappType:
                      incomingMessage.type ??
                      null,

                    raw:
                      toPrismaJson(
                        incomingMessage,
                      ),
                  },
                },
              });


          await transaction
            .conversation
            .update({
              where: {
                id:
                  conversation.id,
              },

              data: {
                lastMessageAt:
                  message.createdAt,

                /*
                |--------------------------------------------------------------------------
                | Re-open Resolved / Closed Conversation
                |--------------------------------------------------------------------------
                |
                | Current lookup only returns OPEN/PENDING, therefore a new conversation
                | is normally created for a resolved/closed thread.
                |
                */
              },
            });


          await transaction
            .conversationEvent
            .create({
              data: {
                organizationId,

                conversationId:
                  conversation.id,

                actorUserId:
                  null,

                type:
                  'MESSAGE_RECEIVED',

                metadata: {
                  provider:
                    'META',

                  channel:
                    'WHATSAPP',

                  externalMessageId,
                },
              },
            });


          return message;
        },
      );


  console.log(
    'INBOUND MESSAGE CREATED',
  );

  console.log(
    'Message ID:',
    createdMessage.id,
  );

  console.log(
    'Conversation ID:',
    conversation.id,
  );

  console.log(
    'Contact ID:',
    contact.id,
  );


  /*
  |--------------------------------------------------------------------------
  | Realtime Events
  |--------------------------------------------------------------------------
  */

  if (
    conversationCreated
  ) {
    emitToOrganization(
      organizationId,

      'conversation.created',

      conversation,
    );
  }


  emitToOrganization(
    organizationId,

    'message.created',

    createdMessage,
  );


  emitToConversation(
    conversation.id,

    'message.created',

    createdMessage,
  );


  emitToOrganization(
    organizationId,

    'conversation.updated',

    {
      ...conversation,

      lastMessageAt:
        createdMessage
          .createdAt,
    },
  );


  return createdMessage;
}


/*
|--------------------------------------------------------------------------
| Process WhatsApp Change
|--------------------------------------------------------------------------
*/

async function processWhatsAppChange(
  change: MetaChange,
) {
  if (
    change.field !==
    'messages'
  ) {
    console.log(
      `Ignoring Meta change field: ${change.field ?? 'unknown'}`,
    );

    return;
  }


  const value =
    change.value;


  if (
    !value
  ) {
    console.log(
      'Skipping WhatsApp change without value',
    );

    return;
  }


  /*
  |--------------------------------------------------------------------------
  | Incoming Messages
  |--------------------------------------------------------------------------
  */

  if (
    Array.isArray(
      value.messages,
    )
  ) {
    console.log(
      `WhatsApp inbound messages: ${value.messages.length}`,
    );


    for (
      const incomingMessage
      of value.messages
    ) {
      await processWhatsAppMessage(
        value,
        incomingMessage,
      );
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Message Status Updates
  |--------------------------------------------------------------------------
  */

  if (
    Array.isArray(
      value.statuses,
    )
  ) {
    console.log(
      `WhatsApp status updates: ${value.statuses.length}`,
    );


    for (
      const status
      of value.statuses
    ) {
      await processWhatsAppStatus(
        status,
      );
    }
  }


  if (
    !Array.isArray(
      value.messages,
    ) &&
    !Array.isArray(
      value.statuses,
    )
  ) {
    console.log(
      'WhatsApp messages change contained neither messages nor statuses',
    );
  }
}


/*
|--------------------------------------------------------------------------
| Process Meta Webhook
|--------------------------------------------------------------------------
*/

async function processMetaWebhook(
  payload: MetaWebhookPayload,
) {
  if (
    payload.object !==
    'whatsapp_business_account'
  ) {
    console.log(
      `Ignoring unsupported Meta webhook object: ${payload.object ?? 'unknown'}`,
    );

    return;
  }


  const entries =
    Array.isArray(
      payload.entry,
    )
      ? payload.entry
      : [];


  console.log(
    `Meta webhook entries: ${entries.length}`,
  );


  for (
    const entry
    of entries
  ) {
    const changes =
      Array.isArray(
        entry.changes,
      )
        ? entry.changes
        : [];


    console.log(
      `Meta entry changes: ${changes.length}`,
    );


    for (
      const change
      of changes
    ) {
      await processWhatsAppChange(
        change,
      );
    }
  }
}


/*
|--------------------------------------------------------------------------
| Start Worker
|--------------------------------------------------------------------------
*/

export function startMetaWorker() {
  if (
    metaWorker
  ) {
    console.log(
      'Meta worker already running',
    );

    return metaWorker;
  }


  const redisHost =
    process.env
      .REDIS_HOST ??
    '127.0.0.1';


  const redisPort =
    Number(
      process.env
        .REDIS_PORT ??
      6379,
    );


  console.log(
    `Starting Meta worker on queue: ${META_QUEUE_NAME}`,
  );


  console.log(
    `Meta Worker Redis: ${redisHost}:${redisPort}`,
  );


  metaWorker =
    new Worker<MetaWebhookJobData>(
      META_QUEUE_NAME,

      async (
        job:
          Job<MetaWebhookJobData>,
      ) => {
        console.log(
          '\n========================================',
        );


        console.log(
          'META WEBHOOK JOB STARTED',
        );


        console.log(
          'Job ID:',
          job.id,
        );


        console.log(
          'Receipt ID:',
          job.data
            .receiptId,
        );


        try {
          /*
          |--------------------------------------------------------------------------
          | Load Receipt
          |--------------------------------------------------------------------------
          */

          const receipt =
            await prisma
              .webhookReceipt
              .findUnique({
                where: {
                  id:
                    job.data
                      .receiptId,
                },
              });


          if (
            !receipt
          ) {
            throw new Error(
              `WebhookReceipt not found: ${job.data.receiptId}`,
            );
          }


          console.log(
            'Webhook receipt loaded',
          );


          /*
          |--------------------------------------------------------------------------
          | Already Processed
          |--------------------------------------------------------------------------
          */

          if (
            receipt.processedAt
          ) {
            console.log(
              'Webhook receipt already processed:',
              receipt.id,
            );


            console.log(
              '========================================\n',
            );


            return {
              success:
                true,

              duplicate:
                true,

              receiptId:
                receipt.id,
            };
          }


          const payload =
            receipt.payload as
              unknown as
              MetaWebhookPayload;


          console.log(
            'Payload object:',
            payload?.object,
          );


          /*
          |--------------------------------------------------------------------------
          | Process Payload
          |--------------------------------------------------------------------------
          */

          await processMetaWebhook(
            payload,
          );


          /*
          |--------------------------------------------------------------------------
          | Mark Receipt Processed
          |--------------------------------------------------------------------------
          |
          | Do this only AFTER all message/status processing succeeds.
          |
          */

          await prisma
            .webhookReceipt
            .update({
              where: {
                id:
                  receipt.id,
              },

              data: {
                processedAt:
                  new Date(),
              },
            });


          console.log(
            'Webhook receipt marked as processed',
          );


          console.log(
            'META WEBHOOK JOB COMPLETED',
          );


          console.log(
            '========================================\n',
          );


          return {
            success:
              true,

            receiptId:
              receipt.id,
          };
        } catch (
          error
        ) {
          console.error(
            'META WORKER JOB ERROR:',
            error,
          );


          console.log(
            '========================================\n',
          );


          throw error;
        }
      },

      {
        connection: {
          host:
            redisHost,

          port:
            redisPort,

          maxRetriesPerRequest:
            null,
        },
      },
    );


  /*
  |--------------------------------------------------------------------------
  | Worker Events
  |--------------------------------------------------------------------------
  */

  metaWorker.on(
    'ready',
    () => {
      console.log(
        'Meta worker ready',
      );
    },
  );


  metaWorker.on(
    'completed',
    job => {
      console.log(
        `Meta job completed: ${job.id}`,
      );
    },
  );


  metaWorker.on(
    'failed',
    (
      job,
      error,
    ) => {
      console.error(
        `Meta job failed: ${job?.id ?? 'unknown'}`,
        error,
      );
    },
  );


  metaWorker.on(
    'error',
    error => {
      console.error(
        'Meta worker error:',
        error.message,
      );
    },
  );


  return metaWorker;
}

      
/*
|--------------------------------------------------------------------------
| Stop Worker
|--------------------------------------------------------------------------
*/
    
export async function stopMetaWorker() {
  if (
    !metaWorker
  ) {
    return;     
  }

  console.log(
    'Closing Meta worker...',
  );


  await metaWorker
    .close();


  metaWorker =
    null;


  console.log(
    'Meta worker closed',
  );
}