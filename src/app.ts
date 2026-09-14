import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRouter from './services/identity/auth.routes';
import contactsRouter from './services/contacts/contacts.routes';
import conversationsRouter from './services/conversations/conversations.routes';
import inboxesRouter from './services/conversations/inboxes.routes';
import labelsRouter from './services/conversations/labels.routes';

import metaRouter from './services/meta/meta.routes';
import metaWebhookRouter from './services/meta/webhook.routes';

const app = express();

/*
|--------------------------------------------------------------------------
| ESM directory helpers
|--------------------------------------------------------------------------
*/

const __filename =
  fileURLToPath(
    import.meta.url,
  );

const __dirname =
  path.dirname(
    __filename,
  );

/*
|--------------------------------------------------------------------------
| Global middleware
|--------------------------------------------------------------------------
*/

app.use(
  cors(),
);

app.use(
  helmet({
    crossOriginResourcePolicy:
      false,

    contentSecurityPolicy:
      false,
  }),
);

app.use(
  morgan('dev'),
);

/*
|--------------------------------------------------------------------------
| Meta Webhook
|--------------------------------------------------------------------------
|
| Must be before express.json()
|
*/

app.use(
  '/webhooks/meta',
  metaWebhookRouter,
);

/*
|--------------------------------------------------------------------------
| Body parsers
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit:
      '5mb',
  }),
);

app.use(
  express.urlencoded({
    extended:
      true,
  }),
);

/*
|--------------------------------------------------------------------------
| Static Admin UI
|--------------------------------------------------------------------------
*/

const webPath =
  path.join(
    __dirname,
    'web',
  );

app.use(
  '/admin',
  express.static(
    webPath,
  ),
);

app.get(
  '/admin',
  (
    _request,
    response,
  ) => {
    return response.sendFile(
      path.join(
        webPath,
        'index.html',
      ),
    );
  },
);

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get(
  '/health',
  (
    _request,
    response,
  ) => {
    return response
      .status(200)
      .json({
        success:
          true,

        service:
          'bevatel-api',

        version:
          'meta-realtime-1',

        environment:
          process.env.NODE_ENV ??
          'development',

        port:
          Number(
            process.env.PORT ??
              4000,
          ),
      });
  },
);

/*
|--------------------------------------------------------------------------
| APIs
|--------------------------------------------------------------------------
*/

app.use(
  '/api/auth',
  authRouter,
);

app.use(
  '/api/contacts',
  contactsRouter,
);

app.use(
  '/api/conversations',
  conversationsRouter,
);

app.use(
  '/api/inboxes',
  inboxesRouter,
);

app.use(
  '/api/labels',
  labelsRouter,
);

app.use(
  '/api/meta',
  metaRouter,
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
    return response
      .status(404)
      .json({
        success:
          false,

        message:
          `Route ${request.method} ${request.originalUrl} not found`,
      });
  },
);

export default app;