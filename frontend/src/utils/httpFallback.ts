import axios from 'axios';
import { Message } from '../types';

/**
 * HTTP fallback for chat operations when Socket.IO is not available
 */
export const httpFallback = {
  /**
   * Send a chat message via HTTP
   */
  async sendMessage(
    userId: string,
    message: string,
    userMessage: Message
  ): Promise<Response> {
    return fetch('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        message: userMessage.content,
      }),
    });
  },

  /**
   * Load chat history via HTTP
   */
  async loadChatHistory(userId: string): Promise<Message[]> {
    try {
      const response = await axios.get(`/chat/${userId}/history`);
      if (response.data.messages && response.data.messages.length > 0) {
        return response.data.messages;
      }
      return [];
    } catch (error) {
      console.error('Error loading chat history:', error);
      return [];
    }
  },

  /**
   * Clear chat history via HTTP
   */
  async clearChatHistory(userId: string): Promise<boolean> {
    try {
      await axios.delete(`/chat/${userId}`);
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  },
};
