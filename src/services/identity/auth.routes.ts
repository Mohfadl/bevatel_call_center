import {
  Router,
  type NextFunction,
  type Response,
} from 'express';
 
import { z } from 'zod';

import {
  prisma,
} from '../../../shared/prisma';

import {
  authMiddleware,
  allowRoles,
  signToken,
  type AuthRequest,
} from '../../../shared/auth';

import {
  PasswordService,
} from '../../../shared/password';

const router = Router();

const loginSchema =
  z.object({
    organizationId: z.string().trim().min(1, 'Organization ID is required',),
    email: z.string().trim().email('Invalid email address',).transform((value,) => value.toLowerCase(),),
    password: z.string().min(1,'Password is required',),});

const createUserSchema =
  z.object({
    name: z.string().trim().min(2,'Name must contain at least 2 characters',).max(100,'Name cannot exceed 100 characters',),
    email: z.string().trim().email('Invalid email address',).transform((value,) =>value.toLowerCase(),),
    password: z.string().min(8,'Password must contain at least 8 characters',),
    role: z.enum(['SUPER_ADMIN','ADMIN','SUPERVISOR','AGENT',]),
  });

const updateUserStatusSchema = z.object({status: z.enum(['ACTIVE','SUSPENDED',]),});

router.get('/health',
  (_request,response,) => {
    return response
      .status(200)
      .json({success:true, service:'identity',});
  },
);

router.post('/login',
  async (request, response, next, ) => {
    try {
      const parsed = loginSchema.safeParse(request.body,);
      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'The submitted login data is invalid.',
            code: 'VALIDATION_ERROR',
            errors: parsed.error.flatten(),
          });
      }

      const {organizationId, email, password, } = parsed.data;

      const organization =
        await prisma.organization.findUnique({
          where: {
            id: organizationId,
          },

          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

      if (!organization) {
        console.warn('Login failed: organization not found',
          {
            organizationId, email,
          },
        );

        return response
          .status(401)
          .json({
            success: false,
            message: 'The organization ID, email, or password is incorrect.',
            code: 'INVALID_CREDENTIALS',
          });
      }

      const user =
        await prisma.user.findFirst({
          where: {
            organizationId: organization.id,
            email,
          },

          select: {
            id: true,
            organizationId:true,
            name: true,
            email: true,
            passwordHash:true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

      if (!user) {
        console.warn('Login failed: user not found',
          {
            organizationId: organization.id,
            email,
          },
        );

        return response
          .status(401)
          .json({
            success: false,
            message: 'The organization ID, email, or password is incorrect.',
            code: 'INVALID_CREDENTIALS',
          });
      }

      if (user.status !== 'ACTIVE' ) {
        console.warn('Login failed: user suspended',
          {
            userId: user.id,
            email: user.email,
          },
        );

        return response
          .status(403)
          .json({
            success: false,
            message: 'Your account is suspended.',
            code: 'ACCOUNT_SUSPENDED',
          });
      }

      const passwordMatches = await PasswordService.verify(password,user.passwordHash,);
      if (!passwordMatches) {
        console.warn('Login failed: password mismatch',
          {
            userId: user.id,
            organizationId: user.organizationId,
            email: user.email,
            storedHashIsBcrypt: PasswordService.isBcryptHash(user.passwordHash,),
          },
        );

        return response
          .status(401)
          .json({
            success: false,
            message:'The organization ID, email, or password is incorrect.',
            code:'INVALID_CREDENTIALS',
          });
      }

      const accessToken =
        signToken({
          id: user.id,
          organizationId: user.organizationId,
          email: user.email,
          name: user.name,
          role: user.role,
        });

      console.log('Login successful',{
          userId: user.id,
          organizationId: user.organizationId,
          email: user.email,
        },
      );

      return response
        .status(200)
        .json({
          success: true,
          message: 'Login successful.',
          data: {
            accessToken,
            user: {
              id:user.id,
              organizationId:user.organizationId,
              name:user.name,
              email:user.email,
              role:user.role,
              status:user.status,
            },
            organization,
          },
        });
    } catch (error) {
      console.error('Login error:',error,);
      return next(error);
    }
  },
);


router.get('/me',
  authMiddleware,
  async ( 
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const user =
        await prisma.user.findFirst({
          where: {
            id: request.user.id,
            organizationId: request.user.organizationId,
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
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

      if (!user) {
        return response
          .status(404)
          .json({
            success: false,
            message: 'The authenticated user could not be found.',
            code: 'USER_NOT_FOUND',
          });
      }

      if (user.status !== 'ACTIVE' ) {
        return response
          .status(403)
          .json({
            success: false,
            message: 'Your account is suspended.',
            code: 'USER_SUSPENDED',
          });
      }

      return response
        .status(200)
        .json({
          success: true,
          data: user,
        });
    } catch (error) {
      console.error('Get current user error:', error, );
      return next(error,);
    }
  },
);
 

router.get('/users',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN','SUPERVISOR',),
  async (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const users =
        await prisma.user.findMany({
          where: {
            organizationId: request.user.organizationId,
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

          orderBy: {
            createdAt: 'desc',
          },
        });

      return response
        .status(200)
        .json({
          success: true,
          data: users,
        });
    } catch (error) {
      console.error('List users error:', error,);
      return next(error,);
    }
  },
);
 

router.post('/users',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN',),
  async (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const parsed = createUserSchema.safeParse(request.body,);
      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'The submitted user data is invalid.',
            code: 'VALIDATION_ERROR',
            errors: parsed.error.flatten(),
          });
      }

      const { name, email, password, role, } = parsed.data;
 
      if (role === 'SUPER_ADMIN' && request.user.role !== 'SUPER_ADMIN' ) {
        return response
          .status(403)
          .json({
            success: false,
            message: 'Only a Super Admin can create another Super Admin.',
            code: 'FORBIDDEN',
          });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            organizationId: request.user.organizationId,
            email,
          },
        });

      if (existingUser) {
        return response
          .status(409)
          .json({
            success: false,
            message: 'A user with this email address already exists in this organization.',
            code: 'EMAIL_ALREADY_EXISTS',
          });
      }

      const passwordHash = await PasswordService.hash(password,);
      const passwordHashVerified = await PasswordService.verify(password,passwordHash,);
      if (!passwordHashVerified) {
        throw new Error('Generated password hash could not be verified.',);
      }

      const user =
        await prisma.user.create({
          data: {
            organizationId: request.user.organizationId,
            name,
            email,
            passwordHash,
            role,
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

      return response
        .status(201)
        .json({
          success: true,
          message: 'User created successfully.',
          data: user,
        });
    } catch (error) {
      console.error('Create user error:',error,);
      return next(error,);
    }
  },
);


router.patch('/users/:id/status',
  authMiddleware,
  allowRoles('SUPER_ADMIN','ADMIN',),
  async (
    request: AuthRequest,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      if (!request.user) {
        return response
          .status(401)
          .json({
            success: false,
            message: 'Authentication is required.',
            code: 'UNAUTHORIZED',
          });
      }

      const parsed = updateUserStatusSchema.safeParse(request.body,);

      if (!parsed.success) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'The submitted user status is invalid.',
            code: 'VALIDATION_ERROR',
            errors: parsed.error.flatten(),
          });
      }
 
      const user =
        await prisma.user.findFirst({
          where: {
            id: String(request.params.id),
            organizationId: request.user.organizationId,
          },
        });

      if (!user) {
        return response
          .status(404)
          .json({
            success: false,
            message: 'The requested user was not found.',
            code: 'USER_NOT_FOUND',
          });
      }

      if (user.role === 'SUPER_ADMIN' && request.user.role !== 'SUPER_ADMIN' ) {
        return response
          .status(403)
          .json({
            success: false,
            message: 'Only a Super Admin can change the status of another Super Admin.',
            code: 'FORBIDDEN',
          });
      }

      if (user.id === request.user.id && parsed.data.status === 'SUSPENDED' ) {
        return response
          .status(422)
          .json({
            success: false,
            message: 'You cannot suspend your own account.',
            code: 'CANNOT_SUSPEND_SELF',
          });
      }

      const updatedUser =
        await prisma.user.update({
          where: {
            id: user.id,
          },

          data: {
            status: parsed.data.status,
          },

          select: {
            id: true,
            organizationId: true,
            name: true,
            email: true,
            role: true,
            status: true,
            updatedAt: true,
          },
        });

      return response
        .status(200)
        .json({
          success: true,
          message:
            parsed.data.status === 'ACTIVE'
              ? 'User activated successfully.'
              : 'User suspended successfully.',
          data: updatedUser,
        });
    } catch (error) {
      console.error('Update user status error:', error, );
      return next(error,);
    }
  },
);

export default router;