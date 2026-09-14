import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';

import {
  Prisma,
} from '../../generated/prisma/client';

type ApiErrorResponse = {
  success: false;
  message: string;
  error?: string;
  details?: unknown;
  code?: string;
  requestId?: string;
};

function getPrismaReadableMessage(
  error: Prisma.PrismaClientKnownRequestError,
): string {
  switch (error.code) {
    case 'P2002': {
      const target =
        Array.isArray(error.meta?.target)
          ? error.meta?.target.join(', ')
          : String(error.meta?.target ?? 'field');

      return `A record already exists with the same ${target}.`;
    }

    case 'P2003':
      return 'A related record was not found or the relationship is invalid.';

    case 'P2025':
      return 'The requested record was not found.';

    case 'P2000':
      return 'One of the provided values is too long.';

    case 'P2001':
      return 'The requested record does not exist.';

    case 'P2011':
      return 'A required field cannot be null.';

    case 'P2012':
      return 'A required value is missing.';

    case 'P2014':
      return 'The requested operation violates a required relationship.';

    case 'P2024':
      return 'The database connection pool timed out. Please try again.';

    case 'P2034':
      return 'The database transaction failed because of a conflict. Please try again.';

    case 'P2039':
      return 'The database connection could not be acquired from the connection pool.';

    default:
      return `Database operation failed (${error.code}).`;
  }
}

export const errorHandler: ErrorRequestHandler =
  (
    error: unknown,
    request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    const requestId = request.headers['x-request-id'];
    console.error('========================================',);
    console.error('UNHANDLED APPLICATION ERROR',);
    console.error('========================================',);
    console.error({
      method: request.method,
      url: request.originalUrl,
      requestId,
      error,
    });

    console.error('========================================',);
    let statusCode = 500;
    const body: ApiErrorResponse = {
      success: false,
      message: 'Something went wrong while processing your request.',
    };

    if (typeof requestId === 'string') {
      body.requestId = requestId;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      statusCode = error.code === 'P2025' ? 404 : 500;
      body.message = getPrismaReadableMessage(error,);
      body.code = error.code;

      if (process.env.NODE_ENV !== 'production') {
        body.details = error.meta;
      }

      return response.status(statusCode).json(body);
    }

    if (
      error instanceof Prisma.PrismaClientValidationError
    ) {
      statusCode = 400;

      body.message = 'Invalid database request. Please check the submitted data.';

      body.code ='PRISMA_VALIDATION_ERROR';

      if (process.env.NODE_ENV !=='production') {
        body.error = error.message;
      }

      return response
        .status(statusCode)
        .json(body);
    }

    if (
      error instanceof Prisma.PrismaClientInitializationError
    ) {
      statusCode = 503;

      body.message =
        'Database connection is currently unavailable.';

      body.code =
        'DATABASE_UNAVAILABLE';

      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        body.error =
          error.message;
      }

      return response
        .status(statusCode)
        .json(body);
    }

    if (
      error instanceof SyntaxError &&
      'body' in error
    ) {
      statusCode = 400;

      body.message =
        'Invalid JSON request body.';

      body.code =
        'INVALID_JSON';

      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        body.error =
          error.message;
      }

      return response
        .status(statusCode)
        .json(body);
    }

    if (
      error instanceof Error
    ) {
      const customError =
        error as Error & {
          statusCode?: number;
          status?: number;
          code?: string;
          details?: unknown;
        };

      statusCode =
        customError.statusCode ??
        customError.status ??
        500;

      body.message =
        customError.message ||
        body.message;

      if (
        customError.code
      ) {
        body.code =
          customError.code;
      }

      if (
        customError.details
      ) {
        body.details =
          customError.details;
      }

      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        body.error =
          error.stack ??
          error.message;
      }

      return response
        .status(statusCode)
        .json(body);
    }

    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      body.details =
        error;
    }

    return response
      .status(statusCode)
      .json(body);
  };