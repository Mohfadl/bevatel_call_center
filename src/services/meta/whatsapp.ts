import 'dotenv/config';

type SendWhatsAppTextInput = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
};

type MetaSendMessageResponse = {
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

/*
|--------------------------------------------------------------------------
| Send WhatsApp Text
|--------------------------------------------------------------------------
*/

export async function sendWhatsAppText(
  input: SendWhatsAppTextInput,
): Promise<MetaSendMessageResponse> {
  const graphVersion =
    process.env
      .META_GRAPH_VERSION ??
    'v23.0';

  const url =
    `https://graph.facebook.com/${graphVersion}` +
    `/${input.phoneNumberId}/messages`;

  const response =
    await fetch(
      url,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${input.accessToken}`,

          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          messaging_product:
            'whatsapp',

          recipient_type:
            'individual',

          to:
            input.to,

          type:
            'text',

          text: {
            preview_url:
              false,

            body:
              input.body,
          },
        }),
      },
    );

  const result =
    (await response.json()) as
      MetaSendMessageResponse;

  if (
    !response.ok
  ) {
    const message =
      result.error?.message ??
      'Meta WhatsApp API request failed';

    throw new Error(
      message,
    );
  }

  return result;
}