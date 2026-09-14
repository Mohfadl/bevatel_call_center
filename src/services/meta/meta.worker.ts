import 'dotenv/config';

import {
  Worker,
  Job,
} from 'bullmq';

import {
  prisma,
} from '../../../shared/prisma';

const META_QUEUE_NAME =
  'meta-webhooks';

let metaWorker:
  Worker | null =
  null;

type MetaWebhookJobData = {
  receiptId: string;
};

export function startMetaWorker() {
  if (metaWorker) {
    console.log(
      'Meta worker already running',
    );

    return metaWorker;
  }

  const redisHost =
    process.env.REDIS_HOST ??
    '127.0.0.1';

  const redisPort =
    Number(
      process.env.REDIS_PORT ??
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
        job: Job<MetaWebhookJobData>,
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
          job.data.receiptId,
        );

        try {
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

          if (!receipt) {
            throw new Error(
              `WebhookReceipt not found: ${job.data.receiptId}`,
            );
          }

          console.log(
            'Webhook receipt loaded',
          );

          const payload =
            receipt.payload as any;

          console.log(
            'Payload object:',
            payload?.object,
          );

          /*
          |--------------------------------------------------------------------------
          | Process Meta payload here
          |--------------------------------------------------------------------------
          |
          | Keep your existing WhatsApp / Messenger / Instagram processing
          | code here.
          |
          | For now this confirms BullMQ is working.
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

          throw error;
        }
      },

      {
        connection: {
          host:
            redisHost,

          port:
            redisPort,

          /*
          |--------------------------------------------------------------------------
          | BullMQ Worker Requirement
          |--------------------------------------------------------------------------
          */

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
    (
      job,
    ) => {
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
    (
      error,
    ) => {
      console.error(
        'Meta worker error:',
        error.message,
      );
    },
  );

  return metaWorker;
}

export async function stopMetaWorker() {
  if (!metaWorker) {
    return;
  }

  console.log(
    'Closing Meta worker...',
  );

  await metaWorker.close();

  metaWorker =
    null;

  console.log(
    'Meta worker closed',
  );
}