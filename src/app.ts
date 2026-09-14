import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';

import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';

import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import {
  Prisma,
} from '../generated/prisma/client';

import authRouter from './services/identity/auth.routes';
import contactsRouter from './services/contacts/contacts.routes';
import conversationsRouter from './services/conversations/conversations.routes';
import inboxesRouter from './services/conversations/inboxes.routes';
import labelsRouter from './services/conversations/labels.routes';

import metaRouter from './services/meta/meta.routes';
import metaWebhookRouter from './services/meta/webhook.routes';

import whatsappStartConversationRouter from './services/meta/whatsapp-start-conversation.routes';

const app =
  express();

const __filename =
  fileURLToPath(
    import.meta.url,
  );

const __dirname =
  path.dirname(
    __filename,
  );

type ApiErrorResponse = {
  success: false;
  message: string;
  code?: string;
  errors?: unknown;
  details?: unknown;
  stack?: string;
};

function getPrismaReadableMessage(
  error:
    Prisma.PrismaClientKnownRequestError,
): string {
  switch (
    error.code
  ) {
    case 'P2000':
      return 'One of the provided values is too long.';

    case 'P2001':
      return 'The requested record does not exist.';

    case 'P2002': {
      const target =
        Array.isArray(
          error.meta?.target,
        )
          ? error.meta?.target.join(
              ', ',
            )
          : String(
              error.meta?.target ??
              'field',
            );

      return `A record already exists with the same value for: ${target}.`;
    }

    case 'P2003':
      return 'The requested operation references a related record that does not exist.';

    case 'P2011':
      return 'A required database field cannot be null.';

    case 'P2012':
      return 'A required value is missing.';

    case 'P2014':
      return 'The requested operation violates a required database relationship.';

    case 'P2024':
      return 'The database connection pool timed out. Please try again.';

    case 'P2025':
      return 'The requested record was not found.';

    case 'P2034':
      return 'The database transaction failed because of a conflict. Please try again.';

    case 'P2039':
      return 'The application could not acquire a database connection from the connection pool.';

    default:
      return `Database operation failed with error code ${error.code}.`;
  }
}

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
  morgan(
    'dev',
  ),
);

/*
|--------------------------------------------------------------------------
| Meta webhook must be before express.json()
|--------------------------------------------------------------------------
*/

app.use(
  '/webhooks/meta',
  metaWebhookRouter,
);

/*
|--------------------------------------------------------------------------
| Parsers
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

    limit:
      '5mb',
  }),
);

/*
|--------------------------------------------------------------------------
| Admin UI
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
| API Routes
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
| Start outbound WhatsApp conversation
|--------------------------------------------------------------------------
*/

app.use(
  '/api/whatsapp',
  whatsappStartConversationRouter,
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(
  (
    request:
      Request,

    response:
      Response,
  ) => {
    return response
      .status(404)
      .json({
        success:
          false,

        message:
          `Route ${request.method} ${request.originalUrl} was not found.`,

        code:
          'ROUTE_NOT_FOUND',
      });
  },
);

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
*/

const errorHandler:
  ErrorRequestHandler =
  (
    error,
    request,
    response,
    _next,
  ) => {
    console.error('');
    console.error(
      '========================================',
    );
    console.error(
      'APPLICATION ERROR',
    );
    console.error(
      '========================================',
    );

    console.error(
      'Method:',
      request.method,
    );

    console.error(
      'URL:',
      request.originalUrl,
    );

    console.error(
      'IP:',
      request.ip,
    );

    console.error(
      'Timestamp:',
      new Date().toISOString(),
    );

    console.error(
      'Error:',
      error,
    );

    if (
      error instanceof
      Error
    ) {
      console.error(
        'Message:',
        error.message,
      );

      console.error(
        'Stack:',
        error.stack,
      );
    }

    console.error(
      '========================================',
    );

    console.error('');

    if (
      error instanceof
        SyntaxError &&
      'body' in error
    ) {
      const body:
        ApiErrorResponse =
        {
          success:
            false,

          message:
            'The request contains invalid JSON.',

          code:
            'INVALID_JSON',
        };

      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        body.details =
          error.message;
      }

      return response
        .status(400)
        .json(
          body,
        );
    }

    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError
    ) {
      let statusCode =
        500;

      if (
        error.code ===
        'P2025'
      ) {
        statusCode =
          404;
      }

      if (
        error.code ===
        'P2002'
      ) {
        statusCode =
          409;
      }

      if (
        error.code ===
          'P2000' ||
        error.code ===
          'P2011' ||
        error.code ===
          'P2012' ||
        error.code ===
          'P2014'
      ) {
        statusCode =
          422;
      }

      if (
        error.code ===
          'P2024' ||
        error.code ===
          'P2039'
      ) {
        statusCode =
          503;
      }

      const body:
        ApiErrorResponse =
        {
          success:
            false,

          message:
            getPrismaReadableMessage(
              error,
            ),

          code:
            error.code,
        };

      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        body.details =
          error.meta;
      }

      return response
        .status(
          statusCode,
        )
        .json(
          body,
        );
    }

    if (
      error instanceof
      Prisma.PrismaClientValidationError
    ) {
      return response
        .status(422)
        .json({
          success:
            false,

          message:
            'The database request contains invalid or missing data.',

          code:
            'PRISMA_VALIDATION_ERROR',

          ...(process.env.NODE_ENV !==
          'production'
            ? {
                details:
                  error.message,
              }
            : {}),
        });
    }

    if (
      error instanceof
      Prisma.PrismaClientInitializationError
    ) {
      return response
        .status(503)
        .json({
          success:
            false,

          message:
            'The database is currently unavailable. Please try again later.',

          code:
            'DATABASE_UNAVAILABLE',

          ...(process.env.NODE_ENV !==
          'production'
            ? {
                details:
                  error.message,
              }
            : {}),
        });
    }

    if (
      error instanceof
      Error
    ) {
      const customError =
        error as Error & {
          statusCode?: number;
          status?: number;
          code?: string;
          details?: unknown;
        };

      const statusCode =
        customError.statusCode ??
        customError.status ??
        500;

      return response
        .status(
          statusCode,
        )
        .json({
          success:
            false,

          message:
            customError.message ||
            'An unexpected server error occurred.',

          code:
            customError.code ??
            'INTERNAL_SERVER_ERROR',

          ...(customError.details !==
          undefined
            ? {
                details:
                  customError.details,
              }
            : {}),

          ...(process.env.NODE_ENV !==
          'production'
            ? {
                stack:
                  error.stack,
              }
            : {}),
        });
    }

    return response
      .status(500)
      .json({
        success:
          false,

        message:
          'An unexpected server error occurred.',

        code:
          'UNKNOWN_SERVER_ERROR',
      });
  };

app.use(
  errorHandler,
);

export default app;