import axios from 'axios';

export async function sendWhatsAppText(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}) {
  const version =
    process.env.META_GRAPH_VERSION ??
    'v23.0';

  const url =
    `https://graph.facebook.com/${version}/${params.phoneNumberId}/messages`;

  const response = await axios.post(
    url,

    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: {
        preview_url: false,
        body: params.text,
      },
    },

    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return response.data;
}