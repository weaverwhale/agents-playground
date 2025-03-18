import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import ChatMessage from './components/ChatMessage';
import io, { Socket } from 'socket.io-client';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isPartial?: boolean;
}

function App(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [streamInProgress, setStreamInProgress] = useState<boolean>(false);

  // Get or create a user ID and initialize socket
  useEffect(() => {
    const storedUserId = localStorage.getItem('chatAgentUserId');
    const newUserId = storedUserId || uuidv4();

    if (!storedUserId) {
      localStorage.setItem('chatAgentUserId', newUserId);
    }

    setUserId(newUserId);

    // Initialize Socket.IO connection
    const socket = io(window.location.origin);
    socketRef.current = socket;

    // Socket.IO event listeners
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    socket.on('stream_update', (data) => {
      // Handle streaming updates from the server
      if (data.type === 'loading') {
        // Update with loading message
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.isPartial) {
            // Update existing loading message
            return prevMessages.map((msg, index) =>
              index === prevMessages.length - 1
                ? { ...msg, content: data.content, isPartial: true }
                : msg
            );
          } else {
            // Add new loading message
            return [
              ...prevMessages,
              {
                id: uuidv4(),
                role: 'assistant',
                content: data.content,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                isPartial: true,
              },
            ];
          }
        });

        setStreamInProgress(true);
      } else if (data.type === 'partial') {
        // Update with partial content
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.isPartial) {
            // Update existing message with partial content
            return prevMessages.map((msg, index) =>
              index === prevMessages.length - 1
                ? { ...msg, content: data.content, isPartial: true }
                : msg
            );
          }
          return prevMessages;
        });

        setStreamInProgress(true);
      } else if (data.type === 'content' || data.type === 'error') {
        // Final content
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.isPartial) {
            // Update the last message with the final content
            return prevMessages.map((msg, index) =>
              index === prevMessages.length - 1
                ? { ...msg, content: data.content, isPartial: false }
                : msg
            );
          }
          return prevMessages;
        });

        setIsLoading(false);
        setStreamInProgress(false);
      }
    });

    socket.on('stream_cancelled', () => {
      console.log('Stream was cancelled');
      setIsLoading(false);
      setStreamInProgress(false);
    });

    socket.on('chat_history', (data) => {
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
    });

    socket.on('history_cleared', () => {
      setMessages([]);
    });

    socket.on('error', (error) => {
      console.error('Socket.IO error:', error);
      setIsLoading(false);
      setStreamInProgress(false);
    });

    // Load chat history
    if (newUserId) {
      socket.emit('get_chat_history', { user_id: newUserId });
    }

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadChatHistory = async (userId: string): Promise<void> => {
    if (socketRef.current) {
      socketRef.current.emit('get_chat_history', { user_id: userId });
    } else {
      try {
        const response = await axios.get(`/chat/${userId}/history`);
        if (response.data.messages && response.data.messages.length > 0) {
          setMessages(response.data.messages);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message to UI immediately
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamInProgress(true);

    // Use Socket.IO for streaming
    if (socketRef.current) {
      socketRef.current.emit('chat_request', {
        user_id: userId,
        message: input,
      });
    } else {
      // Fallback to HTTP streaming if Socket.IO not available
      try {
        // Use streaming endpoint
        const response = await fetch('/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            message: userMessage.content,
          }),
        });

        if (!response.body) {
          throw new Error('ReadableStream not supported in this browser.');
        }

        // Add a placeholder message for the assistant's response
        const placeholderId = uuidv4();
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: placeholderId,
            role: 'assistant',
            content: 'Thinking...',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            isPartial: true,
          },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let responseText = '';

        const processStream = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              const chunk = decoder.decode(value, { stream: true });

              // Parse SSE format: data: [content]\n\n
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const content = line.slice(6); // Remove 'data: ' prefix
                    const parsedData = JSON.parse(content);

                    // Handle different message types
                    if (parsedData.type === 'loading') {
                      // Update placeholder with loading message
                      setMessages((prevMessages) =>
                        prevMessages.map((msg) =>
                          msg.id === placeholderId
                            ? {
                                ...msg,
                                content: parsedData.content,
                                isPartial: true,
                              }
                            : msg
                        )
                      );
                    } else if (parsedData.type === 'partial') {
                      // Update with partial response while still streaming
                      setMessages((prevMessages) =>
                        prevMessages.map((msg) =>
                          msg.id === placeholderId
                            ? {
                                ...msg,
                                content: parsedData.content,
                                isPartial: true,
                              }
                            : msg
                        )
                      );
                    } else if (
                      parsedData.type === 'content' ||
                      parsedData.type === 'error'
                    ) {
                      // Replace loading message with actual content
                      setMessages((prevMessages) =>
                        prevMessages.map((msg) =>
                          msg.id === placeholderId
                            ? {
                                ...msg,
                                content: parsedData.content,
                                isPartial: false,
                              }
                            : msg
                        )
                      );
                    }
                  } catch (error) {
                    // Fallback for non-JSON messages (backward compatibility)
                    const content = line.slice(6);
                    responseText += content;

                    // Update the placeholder message
                    setMessages((prevMessages) =>
                      prevMessages.map((msg) =>
                        msg.id === placeholderId
                          ? { ...msg, content: responseText, isPartial: false }
                          : msg
                      )
                    );
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error processing stream:', error);
          } finally {
            setIsLoading(false);
            setStreamInProgress(false);
          }
        };

        processStream();
      } catch (error) {
        console.error('Error sending message:', error);
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            role: 'assistant',
            content:
              'Sorry, there was an error processing your request. Please try again.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
        setIsLoading(false);
        setStreamInProgress(false);
      }
    }
  };

  const clearChatHistory = async (): Promise<void> => {
    if (socketRef.current) {
      socketRef.current.emit('clear_chat_history', { user_id: userId });
    } else {
      try {
        await axios.delete(`/chat/${userId}`);
        setMessages([]);
      } catch (error) {
        console.error('Error clearing chat history:', error);
      }
    }
  };

  const cancelStream = (): void => {
    if (socketRef.current && streamInProgress) {
      socketRef.current.emit('cancel_stream', { user_id: userId });
    }
  };

  return (
    <div className="flex h-full">
      <div className="chat-container flex-1">
        <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">🐳 Agent Chat</h1>
          <div>
            <button
              onClick={clearChatHistory}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Clear Chat
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="chat-messages flex flex-col flex-1">
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="chat-input-container">
          <div className="flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
              className="chat-input flex-1 mr-2"
              disabled={isLoading}
            />
            {streamInProgress ? (
              <button
                type="button"
                onClick={cancelStream}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mr-2"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
