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

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

const registerOrganizationSchema =
  z
    .object({
      organizationName:
        z
          .string()
          .trim()
          .min(
            2,
            'Organization name must contain at least 2 characters.',
          )
          .max(
            150,
            'Organization name cannot exceed 150 characters.',
          ),

      organizationSlug:
        z
          .string()
          .trim()
          .min(
            2,
            'Organization slug must contain at least 2 characters.',
          )
          .max(
            100,
            'Organization slug cannot exceed 100 characters.',
          )
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            'Organization slug may contain lowercase letters, numbers, and hyphens only.',
          ),

      name:
        z
          .string()
          .trim()
          .min(
            2,
            'Your name must contain at least 2 characters.',
          )
          .max(
            100,
            'Your name cannot exceed 100 characters.',
          ),

      email:
        z
          .string()
          .trim()
          .email(
            'Please enter a valid email address.',
          )
          .transform(
            value =>
              value.toLowerCase(),
          ),

      password:
        z
          .string()
          .min(
            8,
            'Password must contain at least 8 characters.',
          )
          .max(
            128,
            'Password cannot exceed 128 characters.',
          ),

      passwordConfirmation:
        z
          .string()
          .min(
            1,
            'Password confirmation is required.',
          ),
    })
    .superRefine(
      (
        data,
        context,
      ) => {
        if (
          data.password !==
          data.passwordConfirmation
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,

            path: [
              'passwordConfirmation',
            ],

            message:
              'Password confirmation does not match.',
          });
        }
      },
    );

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeSlug(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9\s-]/g,
      '',
    )
    .replace(
      /\s+/g,
      '-',
    )
    .replace(
      /-+/g,
      '-',
    )
    .replace(
      /^-|-$/g,
      '',
    );
}

/*
|--------------------------------------------------------------------------
| Generate slug
|--------------------------------------------------------------------------
|
| This endpoint is useful for the UI while the user types an organization
| name.
|
| GET /api/auth/register-organization/slug?name=My Company
|
*/

router.get(
  '/register-organization/slug',

  async (
    request:
      Request,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      const name =
        String(
          request.query.name ??
          '',
        )
          .trim();

      if (
        !name
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'Organization name is required.',

            code:
              'ORGANIZATION_NAME_REQUIRED',
          });
      }

      const baseSlug =
        normalizeSlug(
          name,
        );

      if (
        !baseSlug
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            message:
              'Unable to generate a valid organization slug from this name.',

            code:
              'INVALID_ORGANIZATION_NAME',
          });
      }

      let slug =
        baseSlug;

      let counter =
        1;

      while (
        await prisma.organization.findUnique({
          where: {
            slug,
          },

          select: {
            id:
              true,
          },
        })
      ) {
        counter +=
          1;

        slug =
          `${baseSlug}-${counter}`;
      }

      return response
        .status(200)
        .json({
          success:
            true,

          data: {
            slug,
          },
        });
    } catch (
      error
    ) {
      console.error(
        'Generate organization slug error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| Register Organization
|--------------------------------------------------------------------------
|
| POST /api/auth/register-organization
|
| Creates:
| - Organization
| - First user as SUPER_ADMIN
|
| The organizationId is generated internally.
| The frontend NEVER needs to provide organizationId.
|
*/

router.post(
  '/register-organization',

  async (
    request:
      Request,

    response:
      Response,

    next:
      NextFunction,
  ) => {
    try {
      const body = {
        ...request.body,

        organizationSlug:
          normalizeSlug(
            String(
              request.body
                ?.organizationSlug ??
              request.body
                ?.organizationName ??
              '',
            ),
          ),
      };

      const parsed =
        registerOrganizationSchema.safeParse(
          body,
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
              'The submitted registration information is invalid.',

            code:
              'VALIDATION_ERROR',

            errors:
              parsed.error.flatten(),
          });
      }

      const {
        organizationName,
        organizationSlug,
        name,
        email,
        password,
      } =
        parsed.data;

      /*
      |--------------------------------------------------------------------------
      | Check organization slug
      |--------------------------------------------------------------------------
      */

      const existingOrganization =
        await prisma.organization.findUnique({
          where: {
            slug:
              organizationSlug,
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
        existingOrganization
      ) {
        return response
          .status(409)
          .json({
            success:
              false,

            message:
              'This organization URL is already being used.',

            code:
              'ORGANIZATION_SLUG_EXISTS',

            errors: {
              fieldErrors: {
                organizationSlug: [
                  'Please choose another organization slug.',
                ],
              },
            },
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Global email check
      |--------------------------------------------------------------------------
      |
      | Your Prisma schema currently allows the same email in different
      | organizations.
      |
      | Because we want login to eventually work using email + password only,
      | we prevent duplicate emails globally at application level.
      |
      */

      const existingUser =
        await prisma.user.findFirst({
          where: {
            email,
          },

          select: {
            id:
              true,

            email:
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
              'An account with this email address already exists.',

            code:
              'EMAIL_ALREADY_EXISTS',

            errors: {
              fieldErrors: {
                email: [
                  'This email address is already registered.',
                ],
              },
            },
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Hash password
      |--------------------------------------------------------------------------
      */

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      /*
      |--------------------------------------------------------------------------
      | Create Organization + Owner Atomically
      |--------------------------------------------------------------------------
      |
      | If creating either record fails, the complete transaction rolls back.
      |
      */

      const result =
        await prisma.$transaction(
          async transaction => {
            const organization =
              await transaction
                .organization
                .create({
                  data: {
                    name:
                      organizationName,

                    slug:
                      organizationSlug,
                  },

                  select: {
                    id:
                      true,

                    name:
                      true,

                    slug:
                      true,

                    createdAt:
                      true,
                  },
                });

            const user =
              await transaction
                .user
                .create({
                  data: {
                    organizationId:
                      organization.id,

                    name,

                    email,

                    passwordHash,

                    role:
                      'SUPER_ADMIN',

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

            return {
              organization,
              user,
            };
          },
        );

      return response
        .status(201)
        .json({
          success:
            true,

          message:
            'Organization registered successfully.',

          data: {
            organization:
              result.organization,

            user:
              result.user,
          },
        });
    } catch (
      error:
        any
    ) {
      /*
      |--------------------------------------------------------------------------
      | Prisma uniqueness fallback
      |--------------------------------------------------------------------------
      |
      | This protects against two registration requests arriving at almost
      | exactly the same moment.
      |
      */

      if (
        error?.code ===
        'P2002'
      ) {
        return response
          .status(409)
          .json({
            success:
              false,

            message:
              'The organization or account already exists.',

            code:
              'DUPLICATE_REGISTRATION',
          });
      }

      console.error(
        'Register organization error:',
        error,
      );

      return next(
        error,
      );
    }
  },
);

export default router;