import { v4 as uuidv4 } from 'uuid';

/**
 * Format a date as a time string (HH:MM)
 */
export const formatTime = (date: Date = new Date()): string => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format a date as a full datetime string
 */
export const formatDateTime = (date: Date = new Date()): string => {
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatToolName = (toolName: string): string => {
  if (toolName === 'answer_nlq_question') {
    return 'Moby';
  }
  return toolName.replace(/_/g, ' ');
};

/**
 * Format a message for display or consistent data structure
 * This ensures all messages conform to the Message interface
 */
export const formatMessage = (message: any) => {
  return {
    id: message.id || uuidv4(), // Assign ID if missing
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || formatTime(),
    isPartial: message.isPartial || false,
    isTool: message.isTool || false,
    tool: message.tool || undefined,
    toolStatus: message.toolStatus || undefined,
    callId: message.callId || null,
  };
};
