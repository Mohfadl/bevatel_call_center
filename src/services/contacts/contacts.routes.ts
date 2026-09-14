import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../../shared/prisma';

import {
  authMiddleware,
  type AuthRequest,
} from '../../../shared/auth';

const router = Router();

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

const createContactSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required')
    .max(150),

  firstName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  lastName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable(),

  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable(),

  company: z
    .string()
    .trim()
    .max(150)
    .optional()
    .nullable(),

  bio: z
    .string()
    .trim()
    .optional()
    .nullable(),

  attributes: z
    .record(
      z.string(),
      z.any(),
    )
    .optional()
    .nullable(),

  status: z
    .enum([
      'ACTIVE',
      'ARCHIVED',
      'BLOCKED',
    ])
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
|
| GET /api/contacts/health
|
*/

router.get(
  '/health',

  (_request, response) => {
    return response.json({
      success: true,
      service: 'contacts',
    });
  },
);

/*
|--------------------------------------------------------------------------
| List Contacts
|--------------------------------------------------------------------------
|
| GET /api/contacts
| GET /api/contacts?search=mohammed
|
*/

router.get(
  '/',

  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Unauthorized',
          });
      }

      const search =
        typeof request.query.search === 'string'
          ? request.query.search.trim()
          : '';

      const page = Math.max(
        1,
        Number(
          request.query.page ?? 1,
        ),
      );

      const perPage = Math.min(
        100,
        Math.max(
          1,
          Number(
            request.query.perPage ?? 20,
          ),
        ),
      );

      const where: any = {
        organizationId:
          request.user.organizationId,
      };

      /*
      |--------------------------------------------------------------------------
      | Search
      |--------------------------------------------------------------------------
      */

      if (search) {
        where.OR = [
          {
            displayName: {
              contains: search,
            },
          },

          {
            firstName: {
              contains: search,
            },
          },

          {
            lastName: {
              contains: search,
            },
          },

          {
            email: {
              contains: search,
            },
          },

          {
            phone: {
              contains: search,
            },
          },

          {
            company: {
              contains: search,
            },
          },
        ];
      }

      const [
        total,
        contacts,
      ] = await Promise.all([
        prisma.contact.count({
          where,
        }),

        prisma.contact.findMany({
          where,

          include: {
            identities: true,
          },

          orderBy: {
            createdAt: 'desc',
          },

          skip:
            (page - 1) *
            perPage,

          take:
            perPage,
        }),
      ]);

      return response.json({
        success: true,

        data: {
          contacts,

          pagination: {
            page,
            perPage,
            total,

            totalPages:
              Math.ceil(
                total /
                  perPage,
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        'List contacts error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Contact Details
|--------------------------------------------------------------------------
|
| GET /api/contacts/:id
|
*/

router.get(
  '/:id',

  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Unauthorized',
          });
      }

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              String(
                request.params.id,
              ),

            organizationId:
              request.user.organizationId,
          },

          include: {
            identities: true,

            conversations: {
              orderBy: {
                createdAt: 'desc',
              },

              take: 20,
            },
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'Contact not found',
          });
      }

      return response.json({
        success: true,
        data: contact,
      });
    } catch (error) {
      console.error(
        'Get contact error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Create Contact
|--------------------------------------------------------------------------
|
| POST /api/contacts
|
*/

router.post(
  '/',

  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Unauthorized',
          });
      }

      const parsed =
        createContactSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,

            message:
              'Validation failed',

            errors:
              parsed.error.flatten(),
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Check duplicate phone
      |--------------------------------------------------------------------------
      */

      if (parsed.data.phone) {
        const existingPhone =
          await prisma.contact.findFirst({
            where: {
              organizationId:
                request.user.organizationId,

              phone:
                parsed.data.phone,
            },
          });

        if (existingPhone) {
          return response
            .status(409)
            .json({
              success: false,

              message:
                'A contact with this phone number already exists',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Check duplicate email
      |--------------------------------------------------------------------------
      */

      if (parsed.data.email) {
        const existingEmail =
          await prisma.contact.findFirst({
            where: {
              organizationId:
                request.user.organizationId,

              email:
                parsed.data.email,
            },
          });

        if (existingEmail) {
          return response
            .status(409)
            .json({
              success: false,

              message:
                'A contact with this email already exists',
            });
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Create
      |--------------------------------------------------------------------------
      */

      const contact =
        await prisma.contact.create({
          data: {
            organizationId:
              request.user.organizationId,

            displayName:
              parsed.data.displayName,

            firstName:
              parsed.data.firstName ??
              null,

            lastName:
              parsed.data.lastName ??
              null,

            email:
              parsed.data.email ??
              null,

            phone:
              parsed.data.phone ??
              null,

            company:
              parsed.data.company ??
              null,

            bio:
              parsed.data.bio ??
              null,

            attributes:
              parsed.data.attributes ??
              undefined,

            status:
              parsed.data.status ??
              'ACTIVE',
          },
        });

      return response
        .status(201)
        .json({
          success: true,

          message:
            'Contact created successfully',

          data:
            contact,
        });
    } catch (error) {
      console.error(
        'Create contact error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            error instanceof Error
              ? error.message
              : 'Internal server error',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Add Contact Identity
|--------------------------------------------------------------------------
|
| POST /api/contacts/:id/identities
|
*/

router.post(
  '/:id/identities',

  authMiddleware,

  async (
    request: AuthRequest,
    response,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Unauthorized',
          });
      }

      const schema = z.object({
        channel: z.enum([
          'WHATSAPP',
          'FACEBOOK',
          'INSTAGRAM',
          'SMS',
          'EMAIL',
          'WEBCHAT',
          'PHONE',
        ]),

        externalId: z
          .string()
          .trim()
          .min(1),

        username: z
          .string()
          .trim()
          .optional()
          .nullable(),

        phone: z
          .string()
          .trim()
          .optional()
          .nullable(),

        email: z
          .string()
          .trim()
          .email()
          .optional()
          .nullable(),

        metadata: z
          .record(
            z.string(),
            z.any(),
          )
          .optional()
          .nullable(),
      });

      const parsed =
        schema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,

            message:
              'Validation failed',

            errors:
              parsed.error.flatten(),
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Find contact
      |--------------------------------------------------------------------------
      */

      const contact =
        await prisma.contact.findFirst({
          where: {
            id:
              String(
                request.params.id,
              ),

            organizationId:
              request.user.organizationId,
          },
        });

      if (!contact) {
        return response
          .status(404)
          .json({
            success: false,
            message:
              'Contact not found',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Check identity duplicate
      |--------------------------------------------------------------------------
      */

      const existingIdentity =
        await prisma.contactIdentity.findFirst({
          where: {
            organizationId:
              request.user.organizationId,

            channel:
              parsed.data.channel,

            externalId:
              parsed.data.externalId,
          },
        });

      if (existingIdentity) {
        return response
          .status(409)
          .json({
            success: false,

            message:
              'This contact identity already exists',
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Create identity
      |--------------------------------------------------------------------------
      */

      const identity =
        await prisma.contactIdentity.create({
          data: {
            organizationId:
              request.user.organizationId,

            contactId:
              contact.id,

            channel:
              parsed.data.channel,

            externalId:
              parsed.data.externalId,

            username:
              parsed.data.username ??
              null,

            phone:
              parsed.data.phone ??
              null,

            email:
              parsed.data.email ??
              null,

            metadata:
              parsed.data.metadata ??
              undefined,
          },
        });

      return response
        .status(201)
        .json({
          success: true,

          message:
            'Contact identity created successfully',

          data:
            identity,
        });
    } catch (error) {
      console.error(
        'Create identity error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,

          message:
            error instanceof Error
              ? error.message
              : 'Internal server error',
        });
    }
  },
);

export default router;