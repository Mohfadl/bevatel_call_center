import 'dotenv/config';

import http from 'http';

import app from './app';

import {
  initializeSocket,
} from './realtime/socket';

import {
  startMetaWorker,
  stopMetaWorker,
} from './services/meta/meta.worker';

import {
  metaWebhookQueue,
} from './services/meta/meta.queue';

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const port =
  Number(
    process.env.PORT ??
      4000,
  );

const host =
  '0.0.0.0';

/*
|--------------------------------------------------------------------------
| HTTP Server
|--------------------------------------------------------------------------
*/

const httpServer =
  http.createServer(
    app,
  );

/*
|--------------------------------------------------------------------------
| Socket.IO
|--------------------------------------------------------------------------
*/

initializeSocket(
  httpServer,
);

/*
|--------------------------------------------------------------------------
| Start Meta Worker
|--------------------------------------------------------------------------
*/

try {
  startMetaWorker();

  console.log(
    'Meta worker started',
  );
} catch (
  error
) {
  console.error(
    'Failed to start Meta worker:',
    error,
  );
}

/*
|--------------------------------------------------------------------------
| Start HTTP Server
|--------------------------------------------------------------------------
*/

httpServer.listen(
  port,
  host,
  () => {
    console.log(
      '\n========================================',
    );

    console.log(
      'BEVATEL API STARTED',
    );

    console.log(
      '========================================',
    );

    console.log(
      `HTTP:     http://localhost:${port}`,
    );

    console.log(
      `Health:   http://localhost:${port}/health`,
    );

    console.log(
      `Meta:     http://localhost:${port}/api/meta/health`,
    );

    console.log(
      `Webhook:  http://localhost:${port}/webhooks/meta`,
    );

    console.log(
      `Socket:   ws://localhost:${port}`,
    );

    console.log(
      `Graph:    ${
        process.env
          .META_GRAPH_VERSION ??
        'v26.0'
      }`,
    );

    console.log(
      '========================================\n',
    );
  },
);

/*
|--------------------------------------------------------------------------
| HTTP Server Errors
|--------------------------------------------------------------------------
*/

httpServer.on(
  'error',
  (
    error: NodeJS.ErrnoException,
  ) => {
    if (
      error.code ===
      'EADDRINUSE'
    ) {
      console.error(
        `Port ${port} is already in use.`,
      );

      console.error(
        `Run: netstat -ano | findstr :${port}`,
      );

      process.exit(
        1,
      );
    }

    console.error(
      'HTTP server error:',
      error,
    );
  },
);

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/

let shuttingDown =
  false;

const shutdown =
  async (
    signal:
      string,
  ) => {
    if (
      shuttingDown
    ) {
      return;
    }

    shuttingDown =
      true;

    console.log(
      `\n${signal} received`,
    );

    console.log(
      'Shutting down Bevatel...',
    );

    httpServer.close(
      async () => {
        try {
          console.log(
            'Stopping Meta worker...',
          );

          await stopMetaWorker();

          console.log(
            'Closing Meta queue...',
          );

          await metaWebhookQueue.close();

          console.log(
            'Shutdown completed',
          );

          process.exit(
            0,
          );
        } catch (
          error
        ) {
          console.error(
            'Shutdown error:',
            error,
          );

          process.exit(
            1,
          );
        }
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Force shutdown after 10 seconds
    |--------------------------------------------------------------------------
    */

    setTimeout(
      () => {
        console.error(
          'Forced shutdown after timeout',
        );

        process.exit(
          1,
        );
      },
      10000,
    ).unref();
  };

/*
|--------------------------------------------------------------------------
| Process Events
|--------------------------------------------------------------------------
*/

process.on(
  'SIGINT',
  () => {
    void shutdown(
      'SIGINT',
    );
  },
);

process.on(
  'SIGTERM',
  () => {
    void shutdown(
      'SIGTERM',
    );
  },
);

process.on(
  'unhandledRejection',
  (
    reason,
  ) => {
    console.error(
      'Unhandled Promise Rejection:',
      reason,
    );
  },
);

process.on(
  'uncaughtException',
  (
    error,
  ) => {
    console.error(
      'Uncaught Exception:',
      error,
    );
  },
);