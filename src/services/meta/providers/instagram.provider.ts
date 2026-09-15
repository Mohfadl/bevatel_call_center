import 'dotenv/config';

import type {
  MetaProvider,
  SendMessageResult,
  SendTextInput,
} from './provider.types';

type InstagramResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

class InstagramProvider implements MetaProvider
{
  async sendText(input: SendTextInput, ): Promise<SendMessageResult> {
    const graphVersion = process.env.META_GRAPH_VERSION ?? 'v26.0';
    const instagramAccountId = input.account.instagramAccountId;
    if (!instagramAccountId) {
      throw new Error('Instagram account id is missing',);
    }

    const url = `https://graph.instagram.com/${graphVersion}/${instagramAccountId}/messages`;

    const response =
      await fetch(url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.account.accessToken}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
              recipient: {
                id: input.recipientId,
              },
              message: {
                text: input.body,
              },
            }),
        },
      );

    const result = await response.json() as InstagramResponse;
    if (!response.ok) {
      console.error('Instagram API error:',result,);
      throw new Error(result.error ?.message ?? 'Instagram API request failed',);
    }

    if (!result.message_id) {
      throw new Error('Instagram did not return message_id',);
    }

    return {
      externalMessageId: result.message_id,
      raw: result,
    };
  }
}

export const instagramProvider = new InstagramProvider();