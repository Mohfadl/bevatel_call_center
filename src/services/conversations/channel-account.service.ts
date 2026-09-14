import { prisma } from '../../../shared/prisma';

import {
  ChannelAccountStatus,
  ChannelType,
} from '../../../generated/prisma/client';

/*
|--------------------------------------------------------------------------
| Find Active Channel Account
|--------------------------------------------------------------------------
|
| Finds the first active channel account for the organization.
|
| Example:
|
| organizationId = xxx
| channel = WHATSAPP
|
*/

export async function findActiveChannelAccount(
  organizationId: string,
  channel: ChannelType,
) {
  return prisma.channelAccount.findFirst({
    where: {
      organizationId,

      channel,

      status:
        ChannelAccountStatus.ACTIVE,
    },

    orderBy: {
      createdAt:
        'asc',
    },
  });
}


/*
|--------------------------------------------------------------------------
| Require Active Channel Account
|--------------------------------------------------------------------------
|
| Same as findActiveChannelAccount(), but throws an error if none exists.
|
*/

export async function requireActiveChannelAccount(
  organizationId: string,
  channel: ChannelType,
) {
  const channelAccount =
    await findActiveChannelAccount(
      organizationId,
      channel,
    );

  if (!channelAccount) {
    throw new Error(
      `No active ${channel} channel account found for this organization`,
    );
  }

  return channelAccount;
}


/*
|--------------------------------------------------------------------------
| Ensure Conversation Channel Account
|--------------------------------------------------------------------------
|
| This function fixes old conversations where:
|
| channelAccountId = null
|
| If the conversation already has a channel account, it returns it normally.
|
| If not:
|
| 1. Finds the active channel account
| 2. Updates conversation.channelAccountId
| 3. Returns the repaired conversation
|
*/

export async function ensureConversationChannelAccount(
  conversationId: string,
) {
  /*
  |--------------------------------------------------------------------------
  | Load conversation
  |--------------------------------------------------------------------------
  */

  let conversation =
    await prisma.conversation.findUnique({
      where: {
        id:
          conversationId,
      },

      include: {
        channelAccount:
          true,

        contact: {
          include: {
            identities:
              true,
          },
        },

        inbox:
          true,
      },
    });


  /*
  |--------------------------------------------------------------------------
  | Conversation not found
  |--------------------------------------------------------------------------
  */

  if (!conversation) {
    throw new Error(
      'Conversation not found',
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Channel account already exists
  |--------------------------------------------------------------------------
  */

  if (
    conversation.channelAccountId &&
    conversation.channelAccount
  ) {
    return conversation;
  }


  /*
  |--------------------------------------------------------------------------
  | Find active channel account
  |--------------------------------------------------------------------------
  */

  const channelAccount =
    await requireActiveChannelAccount(
      conversation.organizationId,
      conversation.channel,
    );


  /*
  |--------------------------------------------------------------------------
  | Repair conversation
  |--------------------------------------------------------------------------
  */

  conversation =
    await prisma.conversation.update({
      where: {
        id:
          conversation.id,
      },

      data: {
        channelAccountId:
          channelAccount.id,
      },

      include: {
        channelAccount:
          true,

        contact: {
          include: {
            identities:
              true,
          },
        },

        inbox:
          true,
      },
    });


  console.log(
    'Conversation channel account repaired:',
    {
      conversationId:
        conversation.id,

      channel:
        conversation.channel,

      channelAccountId:
        conversation.channelAccountId,

      channelAccountName:
        conversation.channelAccount?.name,
    },
  );


  return conversation;
}