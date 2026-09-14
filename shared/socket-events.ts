export const SOCKET_EVENTS = {
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_ASSIGNED: 'conversation.assigned',
  CONVERSATION_RESOLVED: 'conversation.resolved',
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_READ: 'message.read',
  AGENT_PRESENCE: 'agent.presence',
  TYPING_START: 'typing.start',
  TYPING_STOP: 'typing.stop',
} as const;