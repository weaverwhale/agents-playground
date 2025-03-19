import io, { Socket } from 'socket.io-client';

/**
 * Socket.IO Manager
 *
 * This singleton manages the socket.io connection across the application.
 * It provides methods to create, get, and close the socket connection,
 * and tracks connection status.
 */
class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private connectedUsers: Set<string> = new Set();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of SocketManager
   */
  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  /**
   * Get the socket instance, creating it if it doesn't exist
   */
  public getSocket(): Socket {
    if (!this.socket) {
      console.log('Creating new socket connection');
      this.socket = io(window.location.origin, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });

      // Set up global connection event handlers
      this.socket.on('connect', () => {
        console.log('Socket connected');
        this.notifyConnectionListeners(true);

        // Request history for all connected users on reconnection
        this.connectedUsers.forEach((userId) => {
          this.requestHistory(userId);
        });
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
        this.notifyConnectionListeners(false);
      });

      this.socket.on('reconnect', () => {
        console.log('Socket reconnected');
        this.notifyConnectionListeners(true);

        // Request history for all connected users on reconnection
        this.connectedUsers.forEach((userId) => {
          this.requestHistory(userId);
        });
      });
    }
    return this.socket;
  }

  /**
   * Register a user with the socket manager
   * This tracks users who need history maintained
   */
  public registerUser(userId: string): void {
    if (userId) {
      this.connectedUsers.add(userId);
    }
  }

  /**
   * Unregister a user from the socket manager
   */
  public unregisterUser(userId: string): void {
    if (userId) {
      this.connectedUsers.delete(userId);
    }
  }

  /**
   * Request chat history for a specific user
   */
  public requestHistory(userId: string): void {
    if (this.socket && this.socket.connected && userId) {
      console.log(`Requesting history for user ${userId}`);
      this.socket.emit('get_chat_history', { user_id: userId });
    }
  }

  /**
   * Add a connection status listener
   */
  public addConnectionListener(listener: (connected: boolean) => void): void {
    this.connectionListeners.add(listener);

    // Immediately notify the new listener of the current connection status
    if (this.socket) {
      listener(this.socket.connected);
    } else {
      listener(false);
    }
  }

  /**
   * Remove a connection status listener
   */
  public removeConnectionListener(
    listener: (connected: boolean) => void
  ): void {
    this.connectionListeners.delete(listener);
  }

  /**
   * Notify all connection listeners of a connection status change
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach((listener) => {
      listener(connected);
    });
  }

  /**
   * Close the socket connection
   */
  public closeSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectedUsers.clear();
    }
  }
}

export default SocketManager.getInstance();
