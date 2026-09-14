import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRouter from './src/services/identity/auth.routes';
import contactsRouter from './src/services/contacts/contacts.routes';
import conversationsRouter from './src/services/conversations/conversations.routes';
import inboxesRouter from './src/services/conversations/inboxes.routes';
import labelsRouter from './src/services/conversations/labels.routes';
import metaRouter from './src/services/meta/meta.routes';
import metaWebhookRouter from './src/services/meta/webhook.routes';

const app = express();

app.use(cors());

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(morgan('dev'));

app.use(express.json());

app.get(
  '/health',
  (_request, response) => {
    response.json({
      success: true,
      service: 'bevatel-api',
    });
  },
);

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

app.use(
  '/webhooks/meta',
  metaWebhookRouter,
);

const port =
  Number(
    process.env.PORT,
  ) || 4000;

app.listen(
  port,
  () => {
    console.log(
      `Bevatel API running on http://localhost:${port}`,
    );
  },
);