import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    } as jwt.SignOptions,
  );
}

export function authMiddleware(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return response.status(401).json({
      success: false,
      message: 'Authorization header is required',
    });
  }

  const [type, token] = authorization.split(' ');

  if (type !== 'Bearer' || !token) {
    return response.status(401).json({
      success: false,
      message: 'Invalid authorization header',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as AuthUser;

    request.user = payload;

    return next();
  } catch {
    return response.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}

export function allowRoles(...roles: string[]) {
  return (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    if (!request.user) {
      return response.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (!roles.includes(request.user.role)) {
      return response.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }

    next();
  };
}