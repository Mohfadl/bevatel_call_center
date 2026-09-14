import {
  randomUUID,
} from 'crypto';

import {
  prisma,
} from '../../../shared/prisma';

type UnreadRow = {
  conversationId:
    string;

  unreadCount:
    bigint | number;
};

export class UnreadService {
  async markConversationAsRead(
    organizationId:
      string,

    userId:
      string,

    conversationId:
      string,
  ) {
    const conversation =
      await prisma.conversation.findFirst({
        where: {
          id:
            conversationId,

          organizationId,
        },

        select: {
          id:
            true,
        },
      });

    if (
      !conversation
    ) {
      throw Object.assign(
        new Error(
          'Conversation was not found.',
        ),
        {
          statusCode:
            404,

          code:
            'CONVERSATION_NOT_FOUND',
        },
      );
    }

    const id =
      randomUUID();

    await prisma.$executeRaw`
      INSERT INTO user_conversation_reads (
        id,
        organization_id,
        user_id,
        conversation_id,
        last_read_at,
        created_at,
        updated_at
      )
      VALUES (
        ${id},
        ${organizationId},
        ${userId},
        ${conversationId},
        NOW(3),
        NOW(3),
        NOW(3)
      )

      ON DUPLICATE KEY UPDATE
        last_read_at = NOW(3),
        updated_at = NOW(3)
    `;

    return {
      conversationId,
      unreadCount:
        0,
    };
  }

  async getConversationUnreadCount(
    organizationId:
      string,

    userId:
      string,

    conversationId:
      string,
  ): Promise<number> {
    const rows =
      await prisma.$queryRaw<
        {
          unreadCount:
            bigint;
        }[]
      >`
        SELECT
          COUNT(m.id) AS unreadCount

        FROM Message m

        LEFT JOIN user_conversation_reads r
          ON r.organization_id = ${organizationId}
          AND r.user_id = ${userId}
          AND r.conversation_id = ${conversationId}

        WHERE
          m.organizationId = ${organizationId}

          AND m.conversationId = ${conversationId}

          AND m.direction = 'INBOUND'

          AND (
            r.last_read_at IS NULL
            OR m.createdAt > r.last_read_at
          )
      `;

    return Number(
      rows[0]?.unreadCount ??
      0,
    );
  }

  async getUnreadCounts(
    organizationId:
      string,

    userId:
      string,
  ) {
    const rows =
      await prisma.$queryRaw<
        UnreadRow[]
      >`
        SELECT
          c.id AS conversationId,

          COUNT(
            CASE
              WHEN
                m.direction = 'INBOUND'
                AND (
                  r.last_read_at IS NULL
                  OR m.createdAt > r.last_read_at
                )
              THEN 1
            END
          ) AS unreadCount

        FROM Conversation c

        LEFT JOIN Message m
          ON m.conversationId = c.id
          AND m.organizationId = c.organizationId

        LEFT JOIN user_conversation_reads r
          ON r.organization_id = c.organizationId
          AND r.conversation_id = c.id
          AND r.user_id = ${userId}

        WHERE
          c.organizationId = ${organizationId}

        GROUP BY
          c.id
      `;

    const conversations =
      rows.map(
        (
          row,
        ) => ({
          conversationId:
            row.conversationId,

          unreadCount:
            Number(
              row.unreadCount,
            ),
        }),
      );

    const totalUnread =
      conversations.reduce(
        (
          total,
          conversation,
        ) =>
          total +
          conversation.unreadCount,

        0,
      );

    return {
      totalUnread,
      conversations,
    };
  }
}

export const unreadService =
  new UnreadService();