import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import {
  prisma,
} from '../../../shared/prisma';

const router =
  Router();

const registerSchema =
  z.object({
    organizationId:
      z
        .string()
        .trim()
        .min(
          1,
          'Organization ID is required',
        ),

    name:
      z
        .string()
        .trim()
        .min(
          2,
          'Name must contain at least 2 characters',
        )
        .max(
          100,
          'Name cannot exceed 100 characters',
        ),

    email:
      z
        .string()
        .trim()
        .email(
          'Invalid email address',
        )
        .transform(
          (
            value,
          ) =>
            value.toLowerCase(),
        ),

    password:
      z
        .string()
        .min(
          8,
          'Password must contain at least 8 characters',
        ),
  });

router.post(
  '/register',

  async (
    request:
      Request,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      const parsed =
        registerSchema.safeParse(
          request.body,
        );

      if (
        !parsed.success
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'The submitted registration data is invalid.',

            code:
              'VALIDATION_ERROR',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        organizationId,
        name,
        email,
        password,
      } =
        parsed.data;

      const organization =
        await prisma.organization.findUnique({
          where: {
            id:
              organizationId,
          },

          select: {
            id:
              true,

            name:
              true,

            slug:
              true,
          },
        });

      if (
        !organization
      ) {
        return response
          .status(404)
          .json({
            success:
              false,

            message:
              'Organization was not found.',

            code:
              'ORGANIZATION_NOT_FOUND',
          });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            organizationId,
            email,
          },

          select: {
            id:
              true,
          },
        });

      if (
        existingUser
      ) {
        return response
          .status(409)
          .json({
            success:
              false,

            message:
              'A user with this email already exists in this organization.',

            code:
              'EMAIL_ALREADY_EXISTS',
          });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      /*
      |--------------------------------------------------------------------------
      | Important security rule
      |--------------------------------------------------------------------------
      |
      | Public registration NEVER accepts role from the request.
      |
      | Everyone starts as AGENT.
      | ADMIN / SUPER_ADMIN can promote users later.
      |
      */

      const user =
        await prisma.user.create({
          data: {
            organizationId,
            name,
            email,
            passwordHash,

            role:
              'AGENT',

            status:
              'ACTIVE',
          },

          select: {
            id:
              true,

            organizationId:
              true,

            name:
              true,

            email:
              true,

            role:
              true,

            status:
              true,

            createdAt:
              true,
          },
        });

      return response
        .status(201)
        .json({
          success:
            true,

          message:
            'Registration completed successfully.',

          data: {
            user,

            organization,
          },
        });
    } catch (
      error
    ) {
      console.error(
        'Register user error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

export default router;