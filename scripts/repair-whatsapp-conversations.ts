import 'dotenv/config';

import { prisma } from '../shared/prisma';

import {
    ChannelAccountStatus,
    ChannelType,
} from '../generated/prisma/client';


async function main() {
    console.log('========================================',);
    console.log('REPAIR WHATSAPP CONVERSATIONS',);
    console.log('========================================',);

    const conversations =
        await prisma.conversation.findMany({
            where: {
                channel: ChannelType.WHATSAPP,
                channelAccountId: null,
            },
            include: {
                contact: true,
            },
        });
    console.log(`Found ${conversations.length} WhatsApp conversations without channel account`,);

    if (conversations.length === 0) {
        console.log('Nothing to repair ✅',);
        return;
    }
 
    for (const conversation of conversations ) {
        console.log('',);
        console.log('Conversation:',conversation.id,);
        console.log('Contact:', conversation.contact ?.displayName ?? conversation.contactId, );

        const channelAccount =
            await prisma.channelAccount.findFirst({
                where: {
                    organizationId: conversation.organizationId,
                    channel: ChannelType.WHATSAPP,
                    status: ChannelAccountStatus.ACTIVE,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });


        if (!channelAccount) {
            console.log('❌ No active WhatsApp ChannelAccount found',);
            continue;
        }

        console.log('Using channel:',channelAccount.name,);
        console.log('Channel account ID:',channelAccount.id,);

        const inbox =
            await prisma.inbox.findFirst({
                where: {
                    organizationId: conversation.organizationId,
                    channelAccountId: channelAccount.id,
                    status: 'ACTIVE',
                },
            });

        await prisma.conversation.update({
            where: {
                id: conversation.id,
            },

            data: {
                channelAccountId: channelAccount.id,
                ...(inbox && !conversation.inboxId
                    ? {
                          inboxId: inbox.id,
                      }
                    : {}),
            },
        });
        console.log('✅ Conversation repaired',);
    }

    console.log('',);
    console.log('========================================',);
    console.log('REPAIR FINISHED',);
    console.log('========================================',);
}

main()
    .catch(
        error => {
            console.error('Repair failed:',error,);
            process.exit(1,);
        },
    )
    .finally(
        async () => {
            await prisma.$disconnect();
        },
    );