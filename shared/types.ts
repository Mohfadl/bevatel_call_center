export interface InternalMessagePayload {
  organizationId: string;
  contactId: string;
  conversationId: string;

  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

  type:
    | 'TEXT'
    | 'IMAGE'
    | 'AUDIO'
    | 'VIDEO'
    | 'DOCUMENT'
    | 'LOCATION'
    | 'TEMPLATE'
    | 'INTERACTIVE'
    | 'SYSTEM'
    | 'NOTE';

  body?: string;

  externalMessageId?: string;

  mediaUrl?: string;
  mimeType?: string;

  metadata?: Record<string, unknown>;
}