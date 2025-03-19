import { useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { UseSocketOptions } from '../types';

// Create a singleton socket instance outside of the component
// This ensures we don't create multiple connections
let socketInstance: Socket | null = null;

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

  useEffect(() => {
    // Only create a socket if it doesn't exist yet
    if (!socketInstance) {
      socketInstance = io(window.location.origin, {
        reconnectionAttempts: 5, // Limit reconnection attempts
        reconnectionDelay: 1000, // Start with a 1 second delay
        reconnectionDelayMax: 5000, // Maximum delay between reconnections
        timeout: 20000, // Connection timeout
      });
    }

    socketRef.current = socketInstance;

    const socket = socketRef.current;

    // Set up the event handlers
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    socket.on('stream_update', onStreamUpdate);
    socket.on('stream_cancelled', onStreamCancelled);
    socket.on('chat_history', onChatHistory);
    socket.on('history_cleared', onHistoryCleared);
    socket.on('error', onError);

    // Load chat history only if we have a userId, the socket is connected,
    // and we haven't already requested history
    if (userId && socket.connected && !hasRequestedHistoryRef.current) {
      hasRequestedHistoryRef.current = true;
      socket.emit('get_chat_history', { user_id: userId });
    } else if (userId && !hasRequestedHistoryRef.current) {
      // Set up a one-time listener to get chat history once connected
      const onConnect = () => {
        hasRequestedHistoryRef.current = true;
        socket.emit('get_chat_history', { user_id: userId });
        socket.off('connect', onConnect); // Remove the listener after use
      };

      socket.on('connect', onConnect);
    }

    // Cleanup function to remove event listeners on unmount
    return () => {
      socket.off('stream_update', onStreamUpdate);
      socket.off('stream_cancelled', onStreamCancelled);
      socket.off('chat_history', onChatHistory);
      socket.off('history_cleared', onHistoryCleared);
      socket.off('error', onError);

      // Note: We don't close the socket on component unmount
      // Instead, we keep it alive for the entire app lifecycle
      // This helps prevent the connect/disconnect loop
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
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('get_chat_history', { user_id: userId });
    } else {
      console.warn('Socket not connected, cannot get chat history');
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

  // Function to explicitly close the socket (for cleanup)
  const closeSocket = () => {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
  };

  return {
    socket: socketRef.current,
    sendChatRequest,
    getChatHistory,
    clearChatHistory,
    cancelStream,
    closeSocket,
    isConnected: socketRef.current?.connected || false,
  };
};
