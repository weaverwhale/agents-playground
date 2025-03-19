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
  isTool?: boolean;
  tool?: string;
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
      // Only log important events and errors
      if (data.type === 'error') {
        console.error('Stream error:', data.content);
      }

      if (data.type === 'tool') {
        // Replace any existing loading messages with our tool message
        setMessages((prevMessages) => {
          // Keep all messages except loading messages
          const nonLoadingMessages = prevMessages.filter(
            (msg) => !(msg.isPartial && msg.role === 'assistant' && !msg.isTool)
          );

          // Find if we already have this exact tool message
          const existingToolMessage = nonLoadingMessages.find(
            (msg) => msg.isTool && msg.tool === data.tool && msg.isPartial
          );

          // If we already have this tool message, don't add a duplicate
          if (existingToolMessage) {
            return nonLoadingMessages;
          }

          // Add the new tool message
          return [
            ...nonLoadingMessages,
            {
              id: uuidv4(),
              role: 'assistant',
              content: data.content,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isPartial: true,
              isTool: true,
              tool: data.tool,
            },
          ];
        });

        setStreamInProgress(true);
        return; // Exit early after handling tool notification
      }

      // Enhanced debugging for tool updates with more thorough checks
      const isTool =
        data.type === 'tool' || // Explicit tool type
        (data.type === 'loading' &&
          typeof data.content === 'string' &&
          data.content.toLowerCase().startsWith('using tool:'));

      // Check if this is a tool usage notification
      if (
        data.type === 'loading' &&
        typeof data.content === 'string' &&
        data.content.toLowerCase().startsWith('using tool:')
      ) {
        // Extract tool name from content
        const toolRegex = /using tool:?\s*([^.:\n]+?)(?:\.{3}|[.:]|\s*$)/i;
        const match = data.content.match(toolRegex);
        const extractedTool = match && match[1] ? match[1].trim() : undefined;

        // Replace any existing loading messages with our tool message
        setMessages((prevMessages) => {
          // Keep all messages except loading messages
          const nonLoadingMessages = prevMessages.filter(
            (msg) => !(msg.isPartial && msg.role === 'assistant' && !msg.isTool)
          );

          // Find if we already have this exact tool message
          const existingToolMessage = nonLoadingMessages.find(
            (msg) => msg.isTool && msg.tool === extractedTool && msg.isPartial
          );

          // If we already have this tool message, don't add a duplicate
          if (existingToolMessage) {
            return nonLoadingMessages;
          }

          // Add the new tool message
          return [
            ...nonLoadingMessages,
            {
              id: uuidv4(),
              role: 'assistant',
              content: data.content,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isPartial: true,
              isTool: true,
              tool: extractedTool,
            },
          ];
        });

        setStreamInProgress(true);
        return; // Exit early after handling tool notification
      }

      // Handle other loading messages
      else if (data.type === 'loading') {
        // Skip "Generating response..." if we have active tool messages
        if (data.content === 'Generating response...') {
          const hasActiveToolMessages = messages.some(
            (msg) => msg.isTool && msg.isPartial
          );
          if (hasActiveToolMessages) {
            return; // Skip this generic loading message if tools are active
          }
        }

        // For loading messages, replace any existing loading message
        setMessages((prevMessages) => {
          // Filter out any partial messages (loading messages)
          const messagesWithoutPartials = prevMessages.filter(
            (msg) => !(msg.isPartial && msg.role === 'assistant' && !msg.isTool)
          );

          // Keep tool messages that are still processing
          const toolMessages = prevMessages.filter(
            (msg) => msg.isPartial && msg.isTool
          );

          // If we have tool messages, don't add a new loading message
          if (toolMessages.length > 0) {
            return prevMessages;
          }

          // Add new loading message
          return [
            ...messagesWithoutPartials,
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
        });

        setStreamInProgress(true);
      }

      // Handle partial content updates
      else if (data.type === 'partial') {
        // When we get partial content, it means tools are done and we should show results
        setMessages((prevMessages) => {
          // Keep all complete messages
          const completeMessages = prevMessages.filter((msg) => !msg.isPartial);

          // Remove all tool messages now that we're getting actual content
          // This ensures tool messages are removed as soon as the response starts flowing

          // Create our new partial message with the updated content
          const newPartialMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            isPartial: true,
          };

          // Return only complete messages and the new partial message
          // Tool messages are intentionally not kept
          return [...completeMessages, newPartialMessage];
        });

        setStreamInProgress(true);
      }

      // Handle final content
      else if (data.type === 'content' || data.type === 'error') {
        // Final content replaces all partial messages including tool messages
        setMessages((prevMessages) => {
          // Keep only complete messages - remove all partial messages including tools
          const completeMessages = prevMessages.filter((msg) => !msg.isPartial);

          // Add the final message
          return [
            ...completeMessages,
            {
              id: uuidv4(),
              role: 'assistant',
              content: data.content,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isPartial: false,
            },
          ];
        });

        setIsLoading(false);
        setStreamInProgress(false);
      }
    });

    socket.on('stream_cancelled', () => {
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
            />
            {streamInProgress ? (
              <button
                type="button"
                onClick={cancelStream}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mr-2"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
