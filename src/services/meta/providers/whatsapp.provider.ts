import 'dotenv/config';

import type {
  MetaProvider,
  SendMessageResult,
  SendTextInput,
} from './provider.types';

type WhatsAppResponse = {
  messaging_product?: string;

  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;

  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;

  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

class WhatsAppProvider implements MetaProvider
{
  async sendText(input: SendTextInput, ): Promise<SendMessageResult> {
    const graphVersion = process.env.META_GRAPH_VERSION ?? 'v26.0';
    const phoneNumberId = input.account.phoneNumberId;
    if (!phoneNumberId) {
      throw new Error('WhatsApp phoneNumberId is missing',);
    }

    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

    const payload: Record<string, unknown> = { 
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.recipientId,
      type: 'text',
      text: {
        preview_url: false,
        body: input.body,
      },
    };

    if (input.replyToExternalMessageId) {
      payload.context = {
        message_id: input.replyToExternalMessageId,
      };
    }

    const response =
      await fetch(url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.account.accessToken}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify(payload,),
        },
      );

    const result = await response.json() as WhatsAppResponse;
    if (!response.ok) {
      console.error('WhatsApp API error:',result,);
      throw new Error(result.error?.message ??'WhatsApp API request failed',);
    }

    const externalMessageId = result.messages?.[0]?.id;

    if (!externalMessageId) {
      throw new Error('WhatsApp did not return a message id',);
    }
    return {
      externalMessageId,
      raw: result,
    };
  }
}

export const whatsappProvider = new WhatsAppProvider();