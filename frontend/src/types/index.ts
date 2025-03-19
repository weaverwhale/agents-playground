export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isPartial?: boolean;
  isTool?: boolean;
  tool?: string;
}

export interface MessageProps {
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    isPartial?: boolean;
    isTool?: boolean;
    tool?: string; // Add tool name if available directly
  };
  userId?: string;
}

export interface UseSocketOptions {
  userId: string;
  onStreamUpdate: (data: any) => void;
  onStreamCancelled: () => void;
  onChatHistory: (data: any) => void;
  onHistoryCleared: () => void;
  onError: (error: any) => void;
}
