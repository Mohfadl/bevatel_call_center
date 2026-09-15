import {
  Router,
} from 'express';

import {
  z,
} from 'zod';

import {
  prisma,
} from '../../../../shared/prisma';

import {
  AuthRequest,
  authMiddleware,
} from '../../../../shared/auth';

const router =
  Router();

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

  (
    _request,
    response,
  ) => {
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
    request:
      AuthRequest,

    response,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const search =
        String(
          request.query
            .search ?? '',
        ).trim();

      const contacts =
        await prisma
          .contact
          .findMany({
            where: {
              organizationId:
                request.user
                  .organizationId,

              ...(search
                ? {
                    OR: [
                      {
                        displayName: {
                          contains:
                            search,
                        },
                      },

                      {
                        phone: {
                          contains:
                            search,
                        },
                      },

                      {
                        email: {
                          contains:
                            search,
                        },
                      },
                    ],
                  }
                : {}),
            },

            include: {
              identities:
                true,
            },

            orderBy: {
              createdAt:
                'desc',
            },
          });

      return response.json({
        success: true,
        data:
          contacts,
      });
    } catch (
      error
    ) {
      console.error(
        'List contacts error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to load contacts',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Get Contact Details
|--------------------------------------------------------------------------
|
| GET /api/contacts/:id
|
*/

router.get(
  '/:id',

  authMiddleware,

  async (
    request:
      AuthRequest,

    response,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const contact =
        await prisma
          .contact
          .findFirst({
            where: {
              id:
                String(
                  request.params
                    .id,
                ),

              organizationId:
                request.user
                  .organizationId,
            },

            include: {
              identities:
                true,

              conversations: {
                orderBy: {
                  createdAt:
                    'desc',
                },

                take:
                  20,
              },
            },
          });

      if (
        !contact
      ) {
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
        data:
          contact,
      });
    } catch (
      error
    ) {
      console.error(
        'Get contact error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to load contact',
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
    request:
      AuthRequest,

    response,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const schema =
        z.object({
          displayName:
            z
              .string()
              .trim()
              .min(
                1,
                'Display name is required',
              ),

          firstName:
            z
              .string()
              .trim()
              .optional(),

          lastName:
            z
              .string()
              .trim()
              .optional(),

          phone:
            z
              .string()
              .trim()
              .optional(),

          email:
            z
              .string()
              .trim()
              .email()
              .optional(),

          company:
            z
              .string()
              .trim()
              .optional(),

          bio:
            z
              .string()
              .trim()
              .optional(),

          attributes:
            z
              .record(
                z.string(),
                z.any(),
              )
              .optional(),
        });

      const parsed =
        schema.safeParse(
          request.body,
        );

      if (
        !parsed.success
      ) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Validation failed',

            errors:
              parsed.error
                .flatten(),
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Optional duplicate checks
      |--------------------------------------------------------------------------
      */

      if (
        parsed.data
          .phone
      ) {
        const phoneExists =
          await prisma
            .contact
            .findFirst({
              where: {
                organizationId:
                  request.user
                    .organizationId,

                phone:
                  parsed.data
                    .phone,
              },
            });

        if (
          phoneExists
        ) {
          return response
            .status(409)
            .json({
              success: false,
              message:
                'A contact with this phone number already exists',
            });
        }
      }

      if (
        parsed.data
          .email
      ) {
        const emailExists =
          await prisma
            .contact
            .findFirst({
              where: {
                organizationId:
                  request.user
                    .organizationId,

                email:
                  parsed.data
                    .email,
              },
            });

        if (
          emailExists
        ) {
          return response
            .status(409)
            .json({
              success: false,
              message:
                'A contact with this email already exists',
            });
        }
      }

      const contact =
        await prisma
          .contact
          .create({
            data: {
              organizationId:
                request.user
                  .organizationId,

              displayName:
                parsed.data
                  .displayName,

              firstName:
                parsed.data
                  .firstName,

              lastName:
                parsed.data
                  .lastName,

              phone:
                parsed.data
                  .phone,

              email:
                parsed.data
                  .email,

              company:
                parsed.data
                  .company,

              bio:
                parsed.data
                  .bio,

              attributes:
                parsed.data
                  .attributes,
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
    } catch (
      error
    ) {
      console.error(
        'Create contact error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to create contact',
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
    request:
      AuthRequest,

    response,
  ) => {
    try {
      if (
        !request.user
      ) {
        return response
          .status(401)
          .json({
            success: false,
            message:
              'Unauthorized',
          });
      }

      const schema =
        z.object({
          channel:
            z.enum([
              'WHATSAPP',
              'FACEBOOK',
              'INSTAGRAM',
              'SMS',
              'EMAIL',
              'WEBCHAT',
              'PHONE',
            ]),

          externalId:
            z
              .string()
              .trim()
              .min(1),

          username:
            z
              .string()
              .trim()
              .optional(),

          phone:
            z
              .string()
              .trim()
              .optional(),

          email:
            z
              .string()
              .trim()
              .email()
              .optional(),

          metadata:
            z
              .record(
                z.string(),
                z.any(),
              )
              .optional(),
        });

      const parsed =
        schema.safeParse(
          request.body,
        );

      if (
        !parsed.success
      ) {
        return response
          .status(422)
          .json({
            success: false,
            message:
              'Validation failed',

            errors:
              parsed.error
                .flatten(),
          });
      }

      const contact =
        await prisma
          .contact
          .findFirst({
            where: {
              id:
                String(
                  request.params
                    .id,
                ),

              organizationId:
                request.user
                  .organizationId,
            },
          });

      if (
        !contact
      ) {
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
      | Check existing identity
      |--------------------------------------------------------------------------
      */

      const existingIdentity =
        await prisma
          .contactIdentity
          .findFirst({
            where: {
              organizationId:
                request.user
                  .organizationId,

              channel:
                parsed.data
                  .channel,

              externalId:
                parsed.data
                  .externalId,
            },
          });

      if (
        existingIdentity
      ) {
        return response
          .status(409)
          .json({
            success: false,
            message:
              'This contact identity already exists',
          });
      }

      const identity =
        await prisma
          .contactIdentity
          .create({
            data: {
              organizationId:
                request.user
                  .organizationId,

              contactId:
                contact.id,

              channel:
                parsed.data
                  .channel,

              externalId:
                parsed.data
                  .externalId,

              username:
                parsed.data
                  .username,

              phone:
                parsed.data
                  .phone,

              email:
                parsed.data
                  .email,

              metadata:
                parsed.data
                  .metadata,
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
    } catch (
      error
    ) {
      console.error(
        'Create contact identity error:',
        error,
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Failed to create contact identity',
        });
    }
  },
);

export default router;