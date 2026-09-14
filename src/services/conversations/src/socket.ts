import {
  Server,
} from 'socket.io';

import jwt from 'jsonwebtoken';

import {
  AuthUser,
} from '../../../../shared/auth';

let io: Server | null = null;

export function createSocketServer(
  httpServer: any,
) {
  io = new Server(
    httpServer,
    {
      cors: {
        origin: '*',
        methods: [
          'GET',
          'POST',
        ],
      },
    },
  );

  io.use(
    (
      socket,
      next,
    ) => {
      try {
        const token =
          socket.handshake.auth
            ?.token;

        if (!token) {
          return next(
            new Error(
              'Authentication required',
            ),
          );
        }

        const user =
          jwt.verify(
            token,
            process.env.JWT_SECRET!,
          ) as AuthUser;

        socket.data.user =
          user;

        next();
      } catch {
        next(
          new Error(
            'Invalid token',
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
          .user as AuthUser;

      console.log(
        `Socket connected: ${user.name}`,
      );

      socket.join(
        `organization:${user.organizationId}`,
      );

      socket.join(
        `user:${user.id}`,
      );

      socket.on(
        'conversation:join',
        conversationId => {
          socket.join(
            `conversation:${conversationId}`,
          );
        },
      );

      socket.on(
        'conversation:leave',
        conversationId => {
          socket.leave(
            `conversation:${conversationId}`,
          );
        },
      );

      socket.on(
        'typing:start',
        conversationId => {
          socket
            .to(
              `conversation:${conversationId}`,
            )
            .emit(
              'typing.start',
              {
                conversationId,
                user: {
                  id: user.id,
                  name: user.name,
                },
              },
            );
        },
      );

      socket.on(
        'typing:stop',
        conversationId => {
          socket
            .to(
              `conversation:${conversationId}`,
            )
            .emit(
              'typing.stop',
              {
                conversationId,
                userId:
                  user.id,
              },
            );
        },
      );

      socket.on(
        'disconnect',
        () => {
          console.log(
            `Socket disconnected: ${user.name}`,
          );
        },
      );
    },
  );

  return io;
}

export function socketServer() {
  if (!io) {
    throw new Error(
      'Socket server is not initialized',
    );
  }

  return io;
}