import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { UseSocketOptions } from '../types';
import socketManager from '../utils/socketManager';

export const useSocket = ({
  userId,
  onStreamUpdate,
  onStreamCancelled,
  onChatHistory,
  onHistoryCleared,
  onError,
}: UseSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const hasRequestedHistoryRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get the socket from the socket manager
    const socket = socketManager.getSocket();
    socketRef.current = socket;

    // Register this user with the socket manager
    if (userId) {
      socketManager.registerUser(userId);
    }

    // Set up connection listener
    const connectionListener = (connected: boolean) => {
      setIsConnected(connected);

      // If we just connected and have a userId, request history
      if (connected && userId && !hasRequestedHistoryRef.current) {
        hasRequestedHistoryRef.current = true;
        socket.emit('get_chat_history', { user_id: userId });
      }
    };

    socketManager.addConnectionListener(connectionListener);

    // Set up event handlers
    socket.on('stream_update', onStreamUpdate);
    socket.on('stream_cancelled', onStreamCancelled);
    socket.on('chat_history', onChatHistory);
    socket.on('history_cleared', onHistoryCleared);
    socket.on('error', onError);

    // Request history if needed
    if (userId && socket.connected && !hasRequestedHistoryRef.current) {
      hasRequestedHistoryRef.current = true;
      socket.emit('get_chat_history', { user_id: userId });
    }

    // Cleanup function
    return () => {
      // Remove all event listeners
      socket.off('stream_update', onStreamUpdate);
      socket.off('stream_cancelled', onStreamCancelled);
      socket.off('chat_history', onChatHistory);
      socket.off('history_cleared', onHistoryCleared);
      socket.off('error', onError);

      // Remove connection listener
      socketManager.removeConnectionListener(connectionListener);

      // Unregister user when component unmounts
      if (userId) {
        socketManager.unregisterUser(userId);
      }
    };
  }, [
    userId,
    onStreamUpdate,
    onStreamCancelled,
    onChatHistory,
    onHistoryCleared,
    onError,
  ]);

  const sendChatRequest = (message: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('chat_request', {
        user_id: userId,
        message,
      });
    } else {
      console.warn('Socket not connected, cannot send message');
    }
  };

  const getChatHistory = () => {
    // Reset the request flag to ensure we try again
    hasRequestedHistoryRef.current = false;

    if (socketRef.current && socketRef.current.connected) {
      hasRequestedHistoryRef.current = true;
      socketRef.current.emit('get_chat_history', { user_id: userId });
    } else {
      // Silent failure - let the socket manager try to handle it
      socketManager.requestHistory(userId);
    }
  };

  const clearChatHistory = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('clear_chat_history', { user_id: userId });
    } else {
      console.warn('Socket not connected, cannot clear chat history');
    }
  };

  const cancelStream = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('cancel_stream', { user_id: userId });
    } else {
      console.warn('Socket not connected, cannot cancel stream');
    }
  };

  return {
    socket: socketRef.current,
    sendChatRequest,
    getChatHistory,
    clearChatHistory,
    cancelStream,
    isConnected,
  };
};
