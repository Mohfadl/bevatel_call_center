import 'dotenv/config';

import type {
  Server as HttpServer,
} from 'http';

import {
  Server,
  type Socket,
} from 'socket.io';

import jwt from 'jsonwebtoken';

import {
  prisma,
} from '../../shared/prisma';

type SocketUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
};

type TokenPayload = {
  sub?: string;
  id?: string;
  userId?: string;
  organizationId?: string;
};

let io:
  Server | null =
  null;

function organizationRoom(
  organizationId: string,
) {
  return `organization:${organizationId}`;
}

function conversationRoom(
  conversationId: string,
) {
  return `conversation:${conversationId}`;
}

function userRoom(
  userId: string,
) {
  return `user:${userId}`;
}

async function authenticateSocket(
  socket: Socket,
): Promise<SocketUser> {
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.headers
      .authorization
      ?.replace(
        /^Bearer\s+/i,
        '',
      );

  if (
    !token ||
    typeof token !==
      'string'
  ) {
    throw new Error(
      'Authentication token missing',
    );
  }

  const secret =
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET is not configured',
    );
  }

  const decoded =
    jwt.verify(
      token,
      secret,
    ) as TokenPayload;

  const userId =
    decoded.sub ??
    decoded.id ??
    decoded.userId;

  if (!userId) {
    throw new Error(
      'Invalid token payload',
    );
  }

  const user =
    await prisma.user.findFirst({
      where: {
        id:
          userId,

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
      },
    });

  if (!user) {
    throw new Error(
      'User not found',
    );
  }

  if (
    decoded.organizationId &&
    decoded.organizationId !==
      user.organizationId
  ) {
    throw new Error(
      'Organization mismatch',
    );
  }

  return {
    id:
      user.id,

    organizationId:
      user.organizationId,

    name:
      user.name,

    email:
      user.email,

    role:
      user.role,
  };
}

export function initializeSocket(
  httpServer: HttpServer,
) {
  io =
    new Server(
      httpServer,
      {
        cors: {
          origin:
            process.env.CORS_ORIGIN ??
            '*',

          methods: [
            'GET',
            'POST',
          ],

          credentials:
            true,
        },
      },
    );

  io.use(
    async (
      socket,
      next,
    ) => {
      try {
        const user =
          await authenticateSocket(
            socket,
          );

        socket.data.user =
          user;

        next();
      } catch (
        error
      ) {
        console.error(
          'Socket authentication failed:',
          error,
        );

        next(
          new Error(
            'Unauthorized',
          ),
        );
      }
    },
  );

  io.on(
    'connection',
    socket => {
      const user =
        socket.data
          .user as SocketUser;

      console.log(
        `Socket connected: ${user.email} (${socket.id})`,
      );

      socket.join(
        organizationRoom(
          user.organizationId,
        ),
      );

      socket.join(
        userRoom(
          user.id,
        ),
      );

      /*
      |--------------------------------------------------------------------------
      | Join Conversation
      |--------------------------------------------------------------------------
      */

      socket.on(
        'conversation:join',

        async (
          conversationId:
            string,
        ) => {
          try {
            const conversation =
              await prisma.conversation.findFirst({
                where: {
                  id:
                    conversationId,

                  organizationId:
                    user.organizationId,
                },

                select: {
                  id:
                    true,
                },
              });

            if (
              !conversation
            ) {
              socket.emit(
                'error',
                {
                  message:
                    'Conversation not found',
                },
              );

              return;
            }

            socket.join(
              conversationRoom(
                conversationId,
              ),
            );

            socket.emit(
              'conversation:joined',
              {
                conversationId,
              },
            );
          } catch (
            error
          ) {
            console.error(
              'Join conversation error:',
              error,
            );
          }
        },
      );

      /*
      |--------------------------------------------------------------------------
      | Leave Conversation
      |--------------------------------------------------------------------------
      */

      socket.on(
        'conversation:leave',

        (
          conversationId:
            string,
        ) => {
          socket.leave(
            conversationRoom(
              conversationId,
            ),
          );
        },
      );

      /*
      |--------------------------------------------------------------------------
      | Agent Typing
      |--------------------------------------------------------------------------
      */

      socket.on(
        'typing:start',

        (
          data: {
            conversationId: string;
          },
        ) => {
          socket
            .to(
              conversationRoom(
                data.conversationId,
              ),
            )
            .emit(
              'typing:start',
              {
                conversationId:
                  data.conversationId,

                user: {
                  id:
                    user.id,

                  name:
                    user.name,
                },
              },
            );
        },
      );

      socket.on(
        'typing:stop',

        (
          data: {
            conversationId: string;
          },
        ) => {
          socket
            .to(
              conversationRoom(
                data.conversationId,
              ),
            )
            .emit(
              'typing:stop',
              {
                conversationId:
                  data.conversationId,

                userId:
                  user.id,
              },
            );
        },
      );

      socket.on(
        'disconnect',

        reason => {
          console.log(
            `Socket disconnected: ${user.email}, reason=${reason}`,
          );
        },
      );
    },
  );

  return io;
}

export function getSocketServer() {
  return io;
}

export function emitToOrganization(
  organizationId: string,
  event: string,
  data: unknown,
) {
  if (!io) {
    return;
  }

  io
    .to(
      organizationRoom(
        organizationId,
      ),
    )
    .emit(
      event,
      data,
    );
}

export function emitToConversation(
  conversationId: string,
  event: string,
  data: unknown,
) {
  if (!io) {
    return;
  }

  io
    .to(
      conversationRoom(
        conversationId,
      ),
    )
    .emit(
      event,
      data,
    );
}

export function emitToUser(
  userId: string,
  event: string,
  data: unknown,
) {
  if (!io) {
    return;
  }

  io
    .to(
      userRoom(
        userId,
      ),
    )
    .emit(
      event,
      data,
    );
}