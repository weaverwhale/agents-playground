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
