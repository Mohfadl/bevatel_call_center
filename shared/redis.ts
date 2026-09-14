import 'dotenv/config';

import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',

  port: Number(
    process.env.REDIS_PORT ?? 6379,
  ),

  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', error => {
  console.error(
    'Redis error:',
    error,
  );
});