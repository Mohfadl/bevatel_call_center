import 'dotenv/config';

import {
  Queue,
} from 'bullmq';

export const META_WEBHOOK_QUEUE_NAME =
  'meta-webhooks';

const redisHost =
  process.env.REDIS_HOST ??
  '127.0.0.1';

const redisPort =
  Number(
    process.env.REDIS_PORT ??
    6379,
  );

console.log(
  `Meta Queue Redis: ${redisHost}:${redisPort}`,
);

export const metaWebhookQueue =
  new Queue(
    META_WEBHOOK_QUEUE_NAME,
    {
      connection: {
        host:
          redisHost,

        port:
          redisPort,

        connectTimeout:
          5000,

        maxRetriesPerRequest:
          1,
      },

      defaultJobOptions: {
        attempts:
          3,

        backoff: {
          type:
            'exponential',

          delay:
            1000,
        },

        removeOnComplete: {
          count:
            100,
        },

        removeOnFail: {
          count:
            500,
        },
      },
    },
  );

metaWebhookQueue.on(
  'error',
  (
    error,
  ) => {
    console.error(
      'Meta webhook queue error:',
      error.message,
    );
  },
);