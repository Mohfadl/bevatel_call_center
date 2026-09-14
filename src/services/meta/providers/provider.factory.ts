import type {
  MetaChannel,
  MetaProvider,
} from './provider.types';

import {
  whatsappProvider,
} from './whatsapp.provider';

import {
  messengerProvider,
} from './messenger.provider';

import {
  instagramProvider,
} from './instagram.provider';

export function getMetaProvider(
  channel:
    MetaChannel,
): MetaProvider {
  switch (
    channel
  ) {
    case 'WHATSAPP':
      return whatsappProvider;

    case 'FACEBOOK':
      return messengerProvider;

    case 'INSTAGRAM':
      return instagramProvider;

    default:
      throw new Error(
        `Unsupported Meta channel: ${channel}`,
      );
  }
}