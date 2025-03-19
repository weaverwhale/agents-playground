import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import socketManager from '../utils/socketManager';

/**
 * Hook to get direct access to the socket instance
 * and track connection status changes
 */
export const useSocketInstance = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get the socket from the manager
    const socketInstance = socketManager.getSocket();
    setSocket(socketInstance);

    // Set up connection listener
    const connectionListener = (connected: boolean) => {
      setIsConnected(connected);
    };

    socketManager.addConnectionListener(connectionListener);

    // Cleanup
    return () => {
      socketManager.removeConnectionListener(connectionListener);
    };
  }, []);

  return { socket, isConnected };
};
