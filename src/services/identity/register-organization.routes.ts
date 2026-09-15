import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
 
import { z } from 'zod';

import {
  prisma,
} from '../../../shared/prisma';

import {
  PasswordService,
} from '../../../shared/password';

const router = Router();

const registerOrganizationSchema =
  z
    .object({
      organizationName: z.string().trim()
                      .min(2,'Organization name must contain at least 2 characters.',)
                        .max(150,'Organization name cannot exceed 150 characters.',),
      organizationSlug: z.string().trim()
                      .min(2,'Organization slug must contain at least 2 characters.',)
                        .max(100,'Organization slug cannot exceed 100 characters.',)
                          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Organization slug may contain lowercase letters, numbers, and hyphens only.',),
      name: z.string().trim()
          .min(2,'Your name must contain at least 2 characters.',)
            .max(100,'Your name cannot exceed 100 characters.',),
      email: z.string().trim().email('Please enter a valid email address.',)
            .transform(value =>value.toLowerCase(),),
      password: z.string().min(8,'Password must contain at least 8 characters.',)
              .max(128,'Password cannot exceed 128 characters.',),

      passwordConfirmation: z.string().min(1,'Password confirmation is required.',),
    })
    .superRefine(
      (data,context,) => {
        if (data.password !== data.passwordConfirmation ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'passwordConfirmation',
            ],
            message: 'Password confirmation does not match.',
          });
        }
      },
    );


function normalizeSlug(value: string, ): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g,'',
    )
    .replace(/\s+/g,'-',)
    .replace(/-+/g,'-',)
    .replace(/^-|-$/g,'',);
}


router.get('/register-organization/slug',
  async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const name = String(request.query.name ??'',).trim();
      if (!name) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Organization name is required.',
            code: 'ORGANIZATION_NAME_REQUIRED',
          });
      }

      const baseSlug = normalizeSlug(name,);
      if (!baseSlug) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Unable to generate a valid organization slug from this name.',
            code: 'INVALID_ORGANIZATION_NAME',
          });
      }

      let slug = baseSlug;
      let counter = 1;
      while (await prisma.organization.findUnique({where: {slug}, select: {id: true},})) {
        counter += 1;
        slug = `${baseSlug}-${counter}`;
      }

      return response
        .status(200)
        .json({
          success: true,
          data: { slug,},
        });
    } catch (error) {
      console.error('Generate organization slug error:',error,);
      return next(error,);
    }
  },
);


router.post('/register-organization',
  async (request,response,next,) => {
    try {
      const {
        organizationName,
        organizationSlug,
        name,
        email,
        password,
        passwordConfirmation,
      } = request.body;

      if (
        !organizationName ||
        !name ||
        !email ||
        !password ||
        !passwordConfirmation
      ) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'All required fields must be provided.',
            code: 'VALIDATION_ERROR',
          });
      }

      if (password !== passwordConfirmation ) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Password confirmation does not match.',
            code: 'PASSWORD_CONFIRMATION_MISMATCH',
          });
      }

      if (String(password).length < 8 ) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Password must contain at least 8 characters.',
            code: 'INVALID_PASSWORD',
          });
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      const normalizedSlug =
        String(organizationSlug || organizationName,)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g,'-',)
          .replace(/^-+|-+$/g,'',);

      if (!normalizedSlug) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'Organization slug is invalid.',
            code: 'INVALID_ORGANIZATION_SLUG',
          });
      }

      const existingOrganization =
        await prisma.organization.findUnique({
          where: {
            slug: normalizedSlug,
          },

          select: {
            id: true,
          },
        });

      if (existingOrganization) {
        return response
          .status(409)
          .json({
            success: false,
            message: 'This organization slug is already in use.',
            code: 'ORGANIZATION_ALREADY_EXISTS',
          });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
          },

          select: {
            id: true,
          },
        });

      if (existingUser) {
        return response
          .status(409)
          .json({
            success: false,
            message: 'This email address is already registered.',
            code: 'EMAIL_ALREADY_EXISTS',
          });
      }

 
      const passwordHash = await PasswordService.hash(String(password),);
      const passwordHashVerified = await PasswordService.verify(String(password),passwordHash,);
      if (!passwordHashVerified) {
        throw new Error('Generated password hash could not be verified.',);
      }

      const result =
        await prisma.$transaction(
          async transaction => {
            const organization =
              await transaction.organization.create({
                data: {
                  name: String(organizationName,).trim(),
                  slug: normalizedSlug,
                },

                select: {
                  id: true,
                  name: true,
                  slug: true,
                  createdAt: true,
                  updatedAt: true,
                },
              });

            const user =
              await transaction.user.create({
                data: {
                  organizationId: organization.id,
                  name: String(name,).trim(),
                  email: normalizedEmail,
                  passwordHash,
                  role: 'SUPER_ADMIN',
                  status: 'ACTIVE',
                },

                select: {
                  id: true,
                  organizationId: true,
                  name: true,
                  email: true,
                  role: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
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
          success: true,
          message: 'Organization registered successfully.',
          data: {
            organization: result.organization,
            user: result.user,
          },
        });
    } catch (error) {
      next(error);
    }
  },
);

export default router;