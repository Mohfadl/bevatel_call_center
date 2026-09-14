import { Router } from 'express';

import { prisma } from '../../../shared/prisma';
import {
    authMiddleware,
} from '../../../shared/auth';

import {
    ChannelType,
    ConversationEventType,
    ConversationStatus,
} from '../../../generated/prisma/client';

import {
    requireActiveChannelAccount,
} from './channel-account.service';


const router =
    Router();


/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

router.use(
    authMiddleware,
);


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getOrganizationId(
    request: any,
): string | null {
    return (
        request.user
            ?.organizationId ??
        null
    );
}


/*
|--------------------------------------------------------------------------
| GET /api/conversations
|--------------------------------------------------------------------------
|
| List conversations.
|
*/

router.get(
    '/',
    async (
        request: any,
        response,
    ) => {
        try {
            const organizationId =
                getOrganizationId(
                    request,
                );

            if (!organizationId) {
                return response
                    .status(401)
                    .json({
                        success:
                            false,

                        message:
                            'Organization not found in authenticated user',
                    });
            }

            const channelQuery =
                request.query
                    .channel as
                    | ChannelType
                    | undefined;

            const statusQuery =
                request.query
                    .status as
                    | ConversationStatus
                    | undefined;

            const conversations =
                await prisma.conversation.findMany({
                    where: {
                        organizationId,

                        ...(channelQuery
                            ? {
                                  channel:
                                      channelQuery,
                              }
                            : {}),

                        ...(statusQuery
                            ? {
                                  status:
                                      statusQuery,
                              }
                            : {}),
                    },

                    include: {
                        contact:
                            true,

                        channelAccount: {
                            select: {
                                id: true,
                                name: true,
                                channel: true,
                                phoneNumberId:
                                    true,
                                status:
                                    true,
                            },
                        },

                        inbox:
                            true,

                        assignedUser: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },

                        messages: {
                            orderBy: {
                                createdAt:
                                    'desc',
                            },

                            take:
                                1,
                        },

                        labels: {
                            include: {
                                label:
                                    true,
                            },
                        },
                    },

                    orderBy: [
                        {
                            lastMessageAt:
                                'desc',
                        },
                        {
                            createdAt:
                                'desc',
                        },
                    ],
                });

            return response
                .status(200)
                .json({
                    success:
                        true,

                    data: {
                        conversations,
                    },
                });
        } catch (
            error
        ) {
            console.error(
                'GET conversations error:',
                error,
            );

            return response
                .status(500)
                .json({
                    success:
                        false,

                    message:
                        'Failed to load conversations',
                });
        }
    },
);


/*
|--------------------------------------------------------------------------
| GET /api/conversations/:id
|--------------------------------------------------------------------------
*/

router.get(
    '/:id',
    async (
        request: any,
        response,
    ) => {
        try {
            const organizationId =
                getOrganizationId(
                    request,
                );

            if (!organizationId) {
                return response
                    .status(401)
                    .json({
                        success:
                            false,

                        message:
                            'Unauthorized',
                    });
            }

            const conversation =
                await prisma.conversation.findFirst({
                    where: {
                        id:
                            request.params.id,

                        organizationId,
                    },

                    include: {
                        contact: {
                            include: {
                                identities:
                                    true,
                            },
                        },

                        channelAccount: {
                            select: {
                                id: true,
                                name: true,
                                channel: true,
                                phoneNumberId:
                                    true,
                                pageId:
                                    true,
                                instagramAccountId:
                                    true,
                                status:
                                    true,
                            },
                        },

                        inbox:
                            true,

                        assignedUser: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },

                        messages: {
                            orderBy: {
                                createdAt:
                                    'asc',
                            },

                            include: {
                                senderUser: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                    },
                                },
                            },
                        },

                        events: {
                            orderBy: {
                                createdAt:
                                    'asc',
                            },
                        },

                        labels: {
                            include: {
                                label:
                                    true,
                            },
                        },
                    },
                });

            if (!conversation) {
                return response
                    .status(404)
                    .json({
                        success:
                            false,

                        message:
                            'Conversation not found',
                    });
            }

            return response
                .status(200)
                .json({
                    success:
                        true,

                    data:
                        conversation,
                });
        } catch (
            error
        ) {
            console.error(
                'GET conversation error:',
                error,
            );

            return response
                .status(500)
                .json({
                    success:
                        false,

                    message:
                        'Failed to load conversation',
                });
        }
    },
);


/*
|--------------------------------------------------------------------------
| POST /api/conversations/contact/:contactId
|--------------------------------------------------------------------------
|
| Create/get conversation with a contact.
|
| Body:
|
| {
|   "channel": "WHATSAPP",
|   "subject": "Customer Support"
| }
|
*/

router.post(
    '/contact/:contactId',
    async (
        request: any,
        response,
    ) => {
        try {
            const organizationId =
                getOrganizationId(
                    request,
                );

            if (!organizationId) {
                return response
                    .status(401)
                    .json({
                        success:
                            false,

                        message:
                            'Unauthorized',
                    });
            }

            const {
                channel,
                subject,
            } =
                request.body;

            /*
            |--------------------------------------------------------------------------
            | Validate channel
            |--------------------------------------------------------------------------
            */

            if (!channel) {
                return response
                    .status(422)
                    .json({
                        success:
                            false,

                        message:
                            'channel is required',
                    });
            }

            if (
                !Object.values(
                    ChannelType,
                ).includes(
                    channel,
                )
            ) {
                return response
                    .status(422)
                    .json({
                        success:
                            false,

                        message:
                            'Invalid channel',
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | Contact
            |--------------------------------------------------------------------------
            */

            const contact =
                await prisma.contact.findFirst({
                    where: {
                        id:
                            request.params.contactId,

                        organizationId,
                    },
                });

            if (!contact) {
                return response
                    .status(404)
                    .json({
                        success:
                            false,

                        message:
                            'Contact not found',
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | Channel account
            |--------------------------------------------------------------------------
            */

            let channelAccount;

            try {
                channelAccount =
                    await requireActiveChannelAccount(
                        organizationId,
                        channel,
                    );
            } catch (
                error: any
            ) {
                return response
                    .status(422)
                    .json({
                        success:
                            false,

                        message:
                            error.message,
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | Find inbox
            |--------------------------------------------------------------------------
            */

            const inbox =
                await prisma.inbox.findFirst({
                    where: {
                        organizationId,

                        channelAccountId:
                            channelAccount.id,

                        status:
                            'ACTIVE',
                    },

                    orderBy: {
                        createdAt:
                            'asc',
                    },
                });

            /*
            |--------------------------------------------------------------------------
            | Existing conversation
            |--------------------------------------------------------------------------
            */

            let existingConversation =
                await prisma.conversation.findFirst({
                    where: {
                        organizationId,

                        contactId:
                            contact.id,

                        channel,

                        status: {
                            in: [
                                ConversationStatus.OPEN,
                                ConversationStatus.PENDING,
                            ],
                        },
                    },

                    include: {
                        contact:
                            true,

                        channelAccount:
                            true,

                        inbox:
                            true,

                        messages: {
                            orderBy: {
                                createdAt:
                                    'asc',
                            },
                        },
                    },

                    orderBy: {
                        createdAt:
                            'desc',
                    },
                });

            /*
            |--------------------------------------------------------------------------
            | Repair old conversation
            |--------------------------------------------------------------------------
            |
            | This is the important part.
            |
            | Existing old conversations may have:
            |
            | channelAccountId = null
            |
            */

            if (
                existingConversation &&
                !existingConversation.channelAccountId
            ) {
                existingConversation =
                    await prisma.conversation.update({
                        where: {
                            id:
                                existingConversation.id,
                        },

                        data: {
                            channelAccountId:
                                channelAccount.id,

                            ...(inbox &&
                            !existingConversation.inboxId
                                ? {
                                      inboxId:
                                          inbox.id,
                                  }
                                : {}),
                        },

                        include: {
                            contact:
                                true,

                            channelAccount:
                                true,

                            inbox:
                                true,

                            messages: {
                                orderBy: {
                                    createdAt:
                                        'asc',
                                },
                            },
                        },
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | Return existing
            |--------------------------------------------------------------------------
            */

            if (
                existingConversation
            ) {
                return response
                    .status(200)
                    .json({
                        success:
                            true,

                        existing:
                            true,

                        data:
                            existingConversation,
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | Create conversation
            |--------------------------------------------------------------------------
            */

            const conversation =
                await prisma.$transaction(
                    async tx => {
                        const created =
                            await tx.conversation.create({
                                data: {
                                    organizationId,

                                    contactId:
                                        contact.id,

                                    channel,

                                    channelAccountId:
                                        channelAccount.id,

                                    inboxId:
                                        inbox?.id ??
                                        null,

                                    subject:
                                        subject ??
                                        null,

                                    status:
                                        ConversationStatus.OPEN,

                                    openedAt:
                                        new Date(),
                                },
                            });

                        /*
                        |--------------------------------------------------------------------------
                        | Conversation event
                        |--------------------------------------------------------------------------
                        */

                        await tx.conversationEvent.create({
                            data: {
                                organizationId,

                                conversationId:
                                    created.id,

                                type:
                                    ConversationEventType.CREATED,

                                metadata: {
                                    channel,

                                    channelAccountId:
                                        channelAccount.id,
                                },
                            },
                        });

                        return tx.conversation.findUnique({
                            where: {
                                id:
                                    created.id,
                            },

                            include: {
                                contact:
                                    true,

                                channelAccount:
                                    true,

                                inbox:
                                    true,

                                messages:
                                    true,
                            },
                        });
                    },
                );

            return response
                .status(201)
                .json({
                    success:
                        true,

                    existing:
                        false,

                    data:
                        conversation,
                });
        } catch (
            error
        ) {
            console.error(
                'CREATE conversation error:',
                error,
            );

            return response
                .status(500)
                .json({
                    success:
                        false,

                    message:
                        'Failed to create conversation',
                });
        }
    },
);


export default router;