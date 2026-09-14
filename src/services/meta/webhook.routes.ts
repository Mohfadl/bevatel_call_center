import 'dotenv/config';

import crypto from 'crypto';

import express, {
  Router,
} from 'express';

import {
  prisma,
} from '../../../shared/prisma';

import {
  metaWebhookQueue,
} from './meta.queue';

const router = Router();

/*
|--------------------------------------------------------------------------
| GET - Meta Webhook Verification
|--------------------------------------------------------------------------
|
| Example:
|
| GET /webhooks/meta
| ?hub.mode=subscribe
| &hub.verify_token=YOUR_TOKEN
| &hub.challenge=123456
|
*/

router.get(
  '/',
  (
    request,
    response,
  ) => {
    console.log(
      '\n========================================',
    );

    console.log(
      'META WEBHOOK GET RECEIVED',
    );

    console.log(
      'URL:',
      request.originalUrl,
    );

    console.log(
      'QUERY:',
      request.query,
    );

    const mode =
      String(
        request.query[
          'hub.mode'
        ] ?? '',
      );

    const verifyToken =
      String(
        request.query[
          'hub.verify_token'
        ] ?? '',
      );

    const challenge =
      String(
        request.query[
          'hub.challenge'
        ] ?? '',
      );

    const expectedToken =
      process.env
        .META_VERIFY_TOKEN ??
      '';

    console.log(
      'mode:',
      mode,
    );

    console.log(
      'received verify token:',
      verifyToken,
    );

    console.log(
      'challenge:',
      challenge,
    );

    /*
    |--------------------------------------------------------------------------
    | Valid Verification
    |--------------------------------------------------------------------------
    */

    if (
      mode === 'subscribe' &&
      verifyToken ===
        expectedToken
    ) {
      console.log(
        'META WEBHOOK VERIFICATION SUCCESS',
      );

      console.log(
        '========================================\n',
      );

      return response
        .status(200)
        .send(challenge);
    }

    /*
    |--------------------------------------------------------------------------
    | Invalid Verification
    |--------------------------------------------------------------------------
    */

    console.warn(
      'META WEBHOOK VERIFICATION FAILED',
    );

    console.log(
      '========================================\n',
    );

    return response
      .status(403)
      .send('Forbidden');
  },
);

/*
|--------------------------------------------------------------------------
| Verify Meta Signature
|--------------------------------------------------------------------------
*/

function verifySignature(
  rawBody: Buffer,
  signature:
    string | undefined,
): boolean {
  /*
  |--------------------------------------------------------------------------
  | Local Testing
  |--------------------------------------------------------------------------
  */

  if (
    process.env
      .META_VERIFY_SIGNATURE !==
    'true'
  ) {
    return true;
  }

  /*
  |--------------------------------------------------------------------------
  | Production / Real Meta Webhook
  |--------------------------------------------------------------------------
  */

  const appSecret =
    process.env
      .META_APP_SECRET;

  if (!appSecret) {
    console.error(
      'META_APP_SECRET is missing',
    );

    return false;
  }

  if (!signature) {
    console.error(
      'x-hub-signature-256 header is missing',
    );

    return false;
  }

  const expectedSignature =
    `sha256=${crypto
      .createHmac(
        'sha256',
        appSecret,
      )
      .update(rawBody)
      .digest('hex')}`;

  const receivedBuffer =
    Buffer.from(
      signature,
      'utf8',
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      'utf8',
    );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      receivedBuffer,
      expectedBuffer,
    );
}

/*
|--------------------------------------------------------------------------
| POST - Receive Meta Webhook Events
|--------------------------------------------------------------------------
*/

router.post(
  '/',

  express.raw({
    type: 'application/json',
    limit: '5mb',
  }),

  async (
    request,
    response,
  ) => {
    console.log(
      '\n========================================',
    );

    console.log(
      'META WEBHOOK POST RECEIVED',
    );

    try {
      /*
      |--------------------------------------------------------------------------
      | Raw Body
      |--------------------------------------------------------------------------
      */

      const rawBody =
        request.body as Buffer;

      if (
        !Buffer.isBuffer(
          rawBody,
        )
      ) {
        console.error(
          'Webhook body is not a Buffer',
        );

        return response
          .status(400)
          .json({
            success: false,
            message:
              'Invalid webhook body',
          });
      }

      console.log(
        'Raw body bytes:',
        rawBody.length,
      );

      /*
      |--------------------------------------------------------------------------
      | Signature
      |--------------------------------------------------------------------------
      */

      const signatureHeader =
        request.headers[
          'x-hub-signature-256'
        ];

      const signature =
        Array.isArray(
          signatureHeader,
        )
          ? signatureHeader[0]
          : signatureHeader;

      console.log(
        'Checking Meta signature...',
      );

      if (
        !verifySignature(
          rawBody,
          signature,
        )
      ) {
        console.warn(
          'Invalid Meta webhook signature',
        );

        console.log(
          '========================================\n',
        );

        return response
          .status(401)
          .json({
            success: false,
            message:
              'Invalid signature',
          });
      }

      console.log(
        'Signature accepted',
      );

      /*
      |--------------------------------------------------------------------------
      | Parse JSON
      |--------------------------------------------------------------------------
      */

      let payload: any;

      try {
        payload =
          JSON.parse(
            rawBody.toString(
              'utf8',
            ),
          );
      } catch (
        error
      ) {
        console.error(
          'Invalid webhook JSON:',
          error,
        );

        return response
          .status(400)
          .json({
            success: false,
            message:
              'Invalid JSON',
          });
      }

      console.log(
        'Payload parsed',
      );

      console.log(
        'Webhook object:',
        payload?.object,
      );

      /*
      |--------------------------------------------------------------------------
      | Extract External Event ID
      |--------------------------------------------------------------------------
      */

      const externalEventId =
        extractExternalEventId(
          payload,
        );

      console.log(
        'External event ID:',
        externalEventId ??
          'not-found',
      );

      /*
      |--------------------------------------------------------------------------
      | Store Receipt
      |--------------------------------------------------------------------------
      */

      console.log(
        '1. Saving WebhookReceipt to MySQL...',
      );

      const receipt =
        await prisma
          .webhookReceipt
          .create({
            data: {
              source:
                'META',

              externalEventId,

              payload:
                payload as any,
            },
          });

      console.log(
        '2. WebhookReceipt saved:',
        receipt.id,
      );

      /*
      |--------------------------------------------------------------------------
      | Add to BullMQ
      |--------------------------------------------------------------------------
      */

      console.log(
        '3. Adding webhook to BullMQ...',
      );

      await metaWebhookQueue.add(
        'process-meta-webhook',
        {
          receiptId:
            receipt.id,
        },
        {
          attempts: 3,

          backoff: {
            type:
              'exponential',

            delay: 1000,
          },

          removeOnComplete: {
            count: 100,
          },

          removeOnFail: {
            count: 500,
          },
        },
      );

      console.log(
        '4. BullMQ job created successfully',
      );

      /*
      |--------------------------------------------------------------------------
      | Response
      |--------------------------------------------------------------------------
      */

      console.log(
        'META WEBHOOK ACCEPTED',
      );

      console.log(
        '========================================\n',
      );

      return response
        .status(200)
        .json({
          success: true,
        });
    } catch (
      error
    ) {
      console.error(
        'META WEBHOOK ERROR:',
        error,
      );

      console.log(
        '========================================\n',
      );

      return response
        .status(500)
        .json({
          success: false,
          message:
            'Webhook processing failed',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Extract External Event ID
|--------------------------------------------------------------------------
*/

function extractExternalEventId(
  payload: any,
):
  | string
  | undefined {
  try {
    const value =
      payload
        ?.entry?.[0]
        ?.changes?.[0]
        ?.value;

    /*
    |--------------------------------------------------------------------------
    | WhatsApp Incoming Message
    |--------------------------------------------------------------------------
    */

    const whatsappMessageId =
      value
        ?.messages?.[0]
        ?.id;

    if (
      whatsappMessageId
    ) {
      return whatsappMessageId;
    }

    /*
    |--------------------------------------------------------------------------
    | WhatsApp Status
    |--------------------------------------------------------------------------
    */

    const whatsappStatus =
      value
        ?.statuses?.[0];

    if (
      whatsappStatus?.id
    ) {
      return `${whatsappStatus.id}:${whatsappStatus.status}`;
    }

    /*
    |--------------------------------------------------------------------------
    | Facebook Messenger
    |--------------------------------------------------------------------------
    */

    const messaging =
      payload
        ?.entry?.[0]
        ?.messaging?.[0];

    if (
      messaging
        ?.message
        ?.mid
    ) {
      return messaging
        .message
        .mid;
    }

    return undefined;
  } catch (
    error
  ) {
    console.error(
      'Failed to extract external event ID:',
      error,
    );

    return undefined;
  }
}

export default router;