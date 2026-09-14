import { NextFunction, Request, Response } from 'express';

export function internalAuth(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const token = request.headers['x-internal-token'];

  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return response.status(401).json({
      success: false,
      message: 'Invalid internal service token',
    });
  }

  next();
}