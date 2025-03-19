import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Message } from '../types';
import { formatTime } from '../utils/formatters';

interface UseChatProps {
  userId: string;
}

export const useChat = ({ userId }: UseChatProps) => {
  const isLoadingHistoryRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [streamInProgress, setStreamInProgress] = useState<boolean>(false);

  // Set isMounted to false when component unmounts
  useEffect(() => {
    return () => {
      setIsLoading(false);
      setStreamInProgress(false);
      isMounted.current = false;
    };
  }, []);

  // State monitor to catch and fix stale states
  useEffect(() => {
    // Function to reset states if needed
    const checkAndResetStates = () => {
      const hasPartialMessages = messages.some((msg) => msg.isPartial);

      // If we have no partial messages but states are still true, force a reset
      if (!hasPartialMessages && (isLoading || streamInProgress)) {
        setIsLoading(false);
        setStreamInProgress(false);
      }
    };

    // Set up a periodic check
    const intervalId = setInterval(checkAndResetStates, 500);

    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, [messages, isLoading, streamInProgress]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Monitor messages to detect non-partial final messages and reset states
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    // If the last message is from the assistant and is not partial, it's a completed response
    if (
      lastMessage.role === 'assistant' &&
      !lastMessage.isPartial &&
      !lastMessage.isTool
    ) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
  }, [messages]);

  // Handler for tool updates from the stream
  const handleToolUpdate = useCallback((data: any) => {
    // Extract the tool status (starting or completed)
    const toolStatus = data.status || 'starting';
    const toolName = data.tool;
    const content = data.content || '';
    const callId = data.call_id || null; // Get the call_id if provided

    console.log(
      `Tool update (${toolName} - ${callId}): ${toolStatus}, stream still in progress`
    );

    setMessages((prevMessages) => {
      // For tool starting events
      if (toolStatus === 'starting') {
        // Check for a truly duplicate message by comparing both tool name and callId if available
        const isDuplicate = prevMessages.some(
          (msg) =>
            msg.isTool &&
            msg.isPartial &&
            msg.tool === toolName &&
            ((callId && msg.callId === callId) ||
              (!callId && msg.content === content))
        );

        // If we have an exact duplicate, skip it
        if (isDuplicate) {
          console.log(
            `Skipping duplicate tool message for ${toolName} (call #${callId})`
          );
          return prevMessages;
        }

        console.log(
          `Adding new tool message for ${toolName} (call #${callId})`
        );

        // Find the current loading message from the assistant (non-tool)
        const loadingMessageIndex = prevMessages.findIndex(
          (msg) => msg.role === 'assistant' && !msg.isTool && msg.isPartial
        );

        // Create a new tool message
        const newToolMessage: Message = {
          id: uuidv4(),
          role: 'assistant' as const,
          content: content,
          timestamp: formatTime(),
          isPartial: true,
          isTool: true,
          tool: toolName,
          toolStatus: 'starting',
          callId: callId, // Store the call_id to track this specific tool call
        };

        // If there is a loading message, insert the tool message before it
        if (loadingMessageIndex !== -1) {
          const result = [...prevMessages];
          result.splice(loadingMessageIndex, 0, newToolMessage);
          return result;
        }

        // If no loading message exists, add it to the end
        return [...prevMessages, newToolMessage];
      }

      // For tool completion, find and update the matching tool message
      if (toolStatus === 'completed') {
        console.log(`Tool completed: ${toolName} (call #${callId})`);

        // Try to find the corresponding tool message with matching callId first
        let existingToolIndex = -1;

        if (callId) {
          // If we have a call_id, try to find the exact tool call
          existingToolIndex = prevMessages.findIndex(
            (msg) =>
              msg.isTool &&
              msg.tool === toolName &&
              msg.callId === callId &&
              msg.isPartial
          );
        }

        // If no match with call_id, fall back to finding by tool name and starting status
        if (existingToolIndex === -1) {
          existingToolIndex = prevMessages.findIndex(
            (msg) =>
              msg.isTool &&
              msg.tool === toolName &&
              msg.isPartial &&
              msg.toolStatus === 'starting'
          );
        }

        // If we found the tool message, update its status
        if (existingToolIndex !== -1) {
          console.log(
            `Updating existing tool message for ${toolName} (call #${callId})`
          );
          const updatedMessages = [...prevMessages];
          updatedMessages[existingToolIndex] = {
            ...updatedMessages[existingToolIndex],
            content: content, // Update with completion message
            toolStatus: 'completed',
            // Keep isPartial true until the final response arrives
          };
          return updatedMessages;
        }

        console.log(
          `No matching tool message found for ${toolName} (call #${callId}), creating new completed message`
        );

        // If we didn't find the matching tool message, create a new completed tool message
        const newToolMessage: Message = {
          id: uuidv4(),
          role: 'assistant' as const,
          content: content,
          timestamp: formatTime(),
          isPartial: true,
          isTool: true,
          tool: toolName,
          toolStatus: 'completed',
          callId: callId, // Store the call_id
        };

        // Find the current loading message if any
        const loadingMessageIndex = prevMessages.findIndex(
          (msg) => msg.role === 'assistant' && !msg.isTool && msg.isPartial
        );

        // If there is a loading message, insert the tool message before it
        if (loadingMessageIndex !== -1) {
          const result = [...prevMessages];
          result.splice(loadingMessageIndex, 0, newToolMessage);
          return result;
        }

        // If no loading message exists, add it to the end
        return [...prevMessages, newToolMessage];
      }

      return prevMessages;
    });

    // No need to set state here anymore, it's handled in handleStreamUpdate
  }, []);

  // Handler for loading updates
  const handleLoadingUpdate = useCallback((data: any) => {
    // Check if this is a tool usage notification (deprecated approach, keeping for compatibility)
    if (
      typeof data.content === 'string' &&
      data.content.toLowerCase().startsWith('using tool:')
    ) {
      // Extract tool name from content
      const toolRegex = /using tool:?\s*([^.:\n]+?)(?:\.{3}|[.:]|\s*$)/i;
      const match = data.content.match(toolRegex);
      const extractedTool = match && match[1] ? match[1].trim() : undefined;

      // Replace any existing loading messages with our tool message
      setMessages((prevMessages) => {
        // Check if we already have this exact tool message
        const existingToolMessage = prevMessages.find(
          (msg) => msg.isTool && msg.tool === extractedTool && msg.isPartial
        );

        // If we already have this tool message, don't add a duplicate
        if (existingToolMessage) {
          return prevMessages;
        }

        // Find any existing partial non-tool message
        const existingPartialIndex = prevMessages.findIndex(
          (msg) => msg.isPartial && msg.role === 'assistant' && !msg.isTool
        );

        // Create the new tool message
        const newToolMessage: Message = {
          id: uuidv4(),
          role: 'assistant' as const,
          content: data.content,
          timestamp: formatTime(),
          isPartial: true,
          isTool: true,
          tool: extractedTool,
          toolStatus: 'starting', // Default to starting for backwards compatibility
        };

        // If there's a loading message, insert the tool message before it
        if (existingPartialIndex !== -1) {
          const result = [...prevMessages];
          result.splice(existingPartialIndex, 0, newToolMessage);
          return result;
        }

        // Otherwise, add the new tool message at the end
        return [...prevMessages, newToolMessage];
      });

      if (isMounted.current) {
        setStreamInProgress(true);
      }
      return; // Exit early after handling tool notification
    }

    // Handle other loading messages
    else {
      // For "Generating response..." we want to ensure it's shown for every new question
      if (data.content === 'Generating response...') {
        setMessages((prevMessages) => {
          // Find any existing partial non-tool message
          const existingPartialIndex = prevMessages.findIndex(
            (msg) => msg.isPartial && msg.role === 'assistant' && !msg.isTool
          );

          // Create new loading message
          const newLoadingMessage: Message = {
            id: uuidv4(),
            role: 'assistant' as const,
            content: data.content,
            timestamp: formatTime(),
            isPartial: true,
          };

          // If there's an existing partial message, replace it
          if (existingPartialIndex !== -1) {
            const result = [...prevMessages];
            result[existingPartialIndex] = newLoadingMessage;
            return result;
          }

          // Otherwise, add the new loading message at the end - always show for new questions
          return [...prevMessages, newLoadingMessage];
        });
      } else {
        // For other loading messages, replace any existing loading message
        setMessages((prevMessages) => {
          // Check if we have active tool messages
          const hasActiveToolMessages = prevMessages.some(
            (msg) => msg.isPartial && msg.isTool
          );

          // If we have tool messages active, only update if we already have a loading message
          if (hasActiveToolMessages) {
            const existingPartialIndex = prevMessages.findIndex(
              (msg) => msg.isPartial && msg.role === 'assistant' && !msg.isTool
            );

            // If there's an existing loading message with tools active, update it
            if (existingPartialIndex !== -1) {
              const result = [...prevMessages];
              result[existingPartialIndex] = {
                ...result[existingPartialIndex],
                content: data.content,
              };
              return result;
            }

            // Otherwise don't add a new loading message when tools are active
            return prevMessages;
          }

          // No active tools, proceed normally
          const existingPartialIndex = prevMessages.findIndex(
            (msg) => msg.isPartial && msg.role === 'assistant' && !msg.isTool
          );

          // Create new loading message
          const newLoadingMessage: Message = {
            id: uuidv4(),
            role: 'assistant' as const,
            content: data.content,
            timestamp: formatTime(),
            isPartial: true,
          };

          // If there's an existing partial message, replace it
          if (existingPartialIndex !== -1) {
            const result = [...prevMessages];
            result[existingPartialIndex] = newLoadingMessage;
            return result;
          }

          // Otherwise, add the new loading message at the end
          return [...prevMessages, newLoadingMessage];
        });
      }

      if (isMounted.current) {
        setStreamInProgress(true);
      }
    }
  }, []);

  // Handler for partial content updates
  const handlePartialUpdate = useCallback((data: any) => {
    console.log('Receiving partial update, stream still in progress');

    // When we get partial content, it means tools might still be running but we should show partial results
    setMessages((prevMessages) => {
      // Find the existing partial non-tool message if it exists
      const existingPartialIndex = prevMessages.findIndex(
        (msg) => msg.isPartial && !msg.isTool && msg.role === 'assistant'
      );

      // Create our new partial message with the updated content
      const newPartialMessage: Message = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: data.content,
        timestamp: formatTime(),
        isPartial: true,
      };

      // If there's no existing partial message, just add the new one at the end
      if (existingPartialIndex === -1) {
        return [...prevMessages, newPartialMessage];
      }

      // Replace the existing partial message with the new one while maintaining all other messages in their exact positions
      const result = [...prevMessages];
      result[existingPartialIndex] = newPartialMessage;
      return result;
    });

    // No need to set state here anymore, it's handled in handleStreamUpdate
  }, []);

  // Handler for final content
  const handleFinalContent = useCallback((data: any) => {
    // Final content replaces the non-tool partial message but keeps all other messages in their exact positions
    setMessages((prevMessages) => {
      // Find any existing partial non-tool message
      const existingPartialIndex = prevMessages.findIndex(
        (msg) => msg.isPartial && !msg.isTool && msg.role === 'assistant'
      );

      // Create the final message
      const finalMessage: Message = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: data.content,
        timestamp: formatTime(),
        isPartial: false,
      };

      // If there's no existing partial message, just add the final message at the end
      if (existingPartialIndex === -1) {
        return [...prevMessages, finalMessage];
      }

      // Replace the existing partial message with the final one while maintaining all other messages in their exact positions
      const result = [...prevMessages];
      result[existingPartialIndex] = finalMessage;
      return result;
    });

    // Ensure states are reset after message update
    if (isMounted.current) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
  }, []);

  // Handler for stream updates
  const handleStreamUpdate = useCallback(
    (data: any) => {
      // ALWAYS set streaming and loading to true for ANY update that isn't a final content or error
      if (
        data.type !== 'content' &&
        data.type !== 'error' &&
        isMounted.current
      ) {
        // For partial updates, we want to keep streamInProgress true but set isLoading to false
        // since we're no longer in the initial loading state
        if (data.type === 'partial') {
          setStreamInProgress(true);
          setIsLoading(false);
        } else {
          // For all other non-final updates, set both to true
          setStreamInProgress(true);
          setIsLoading(true);
        }
      }

      try {
        if (data.type === 'error') {
          console.error('Stream error:', data.content);
          handleFinalContent(data); // Treat errors like final content

          // Set streaming to false after handling the error
          if (isMounted.current) {
            setIsLoading(false);
            setStreamInProgress(false);
          }
          return;
        }

        if (data.type === 'tool') {
          handleToolUpdate(data);
          return;
        }

        if (data.type === 'loading') {
          handleLoadingUpdate(data);
          return;
        }

        if (data.type === 'partial') {
          handlePartialUpdate(data);
          return;
        }

        if (data.type === 'content') {
          // For final content, update messages then reset states
          handleFinalContent(data);

          // Explicitly set states to false after handling the content
          if (isMounted.current) {
            setIsLoading(false);
            setStreamInProgress(false);
          }
          return;
        }

        console.warn(`Unknown update type: ${data.type}`);
      } catch (error) {
        console.error('Error handling stream update:', error);
        // Ensure we reset states on error
        if (isMounted.current) {
          setIsLoading(false);
          setStreamInProgress(false);
        }
      }
    },
    [
      handleToolUpdate,
      handleLoadingUpdate,
      handlePartialUpdate,
      handleFinalContent,
    ]
  );

  // Handler for stream cancellation
  const handleStreamCancelled = useCallback(() => {
    // Force reset both states
    setIsLoading(false);
    setStreamInProgress(false);
  }, []);

  // Handler for chat history
  const handleChatHistory = useCallback((data: any) => {
    if (data.messages && data.messages.length > 0 && isMounted.current) {
      setMessages(data.messages);
    }
  }, []);

  // Handler for history cleared
  const handleHistoryCleared = useCallback(() => {
    if (isMounted.current) {
      setMessages([]);
    }
  }, []);

  // Handler for errors
  const handleError = useCallback((error: any) => {
    console.error('Socket.IO error:', error);

    // Update messages to show an error message while preserving any tool calls
    setMessages((prevMessages) => {
      // Find any loading message to replace with the error
      const loadingIndex = prevMessages.findIndex(
        (msg) => msg.isPartial && !msg.isTool && msg.role === 'assistant'
      );

      // Create error message
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: `Sorry, there was an error: ${error?.message || 'Unknown error'}`,
        timestamp: formatTime(),
        isPartial: false,
      };

      // If we found a loading message, replace it with the error
      if (loadingIndex !== -1) {
        const result = [...prevMessages];
        result[loadingIndex] = errorMessage;
        return result;
      }

      // Otherwise, add the error message at the end
      return [...prevMessages, errorMessage];
    });

    if (isMounted.current) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
  }, []);

  // Add a user message to the chat
  const addUserMessage = useCallback((content: string) => {
    const userMessage: Message = {
      role: 'user' as const,
      content,
      timestamp: formatTime(),
    };

    // Add both the user message and an initial loading message
    setMessages((prevMessages) => {
      // First add the user message
      const withUserMessage = [...prevMessages, userMessage];

      // Find and remove any existing loading message (cleanup)
      const existingLoadingIndex = withUserMessage.findIndex(
        (msg) => msg.isPartial && !msg.isTool && msg.role === 'assistant'
      );

      if (existingLoadingIndex !== -1) {
        // Remove the existing loading message if found
        const cleaned = [
          ...withUserMessage.slice(0, existingLoadingIndex),
          ...withUserMessage.slice(existingLoadingIndex + 1),
        ];

        // Add new loading message at the end
        return [
          ...cleaned,
          {
            id: uuidv4(),
            role: 'assistant' as const,
            content: 'Thinking...',
            timestamp: formatTime(),
            isPartial: true,
          },
        ];
      }

      // If no existing loading, just add a new one at the end
      return [
        ...withUserMessage,
        {
          id: uuidv4(),
          role: 'assistant' as const,
          content: 'Thinking...',
          timestamp: formatTime(),
          isPartial: true,
        },
      ];
    });

    // Ensure both loading and stream states are set to true
    setIsLoading(true);
    setStreamInProgress(true);

    return userMessage;
  }, []);

  // Load chat history using HTTP fallback
  const loadChatHistoryHttp = useCallback(async () => {
    // Prevent multiple simultaneous loading requests
    if (isLoadingHistoryRef.current) return;

    try {
      isLoadingHistoryRef.current = true;
      const response = await axios.get(`/chat/${userId}/history`);
      if (
        response.data.messages &&
        response.data.messages.length > 0 &&
        isMounted.current
      ) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      isLoadingHistoryRef.current = false;
    }
  }, [userId]);

  // Process HTTP stream fallback
  const processHttpStream = useCallback(
    async (response: Response, userMessage: Message) => {
      let isStreamCompleted = false;

      // Ensure loading and stream states are properly set at the start
      if (isMounted.current) {
        setIsLoading(true);
        setStreamInProgress(true);
      }

      try {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        // Create a placeholder for the response
        const placeholderId = uuidv4(); // Generate an ID for the placeholder

        // Add a placeholder message if it doesn't exist already
        let placeholderExists = false;
        setMessages((prevMessages) => {
          // Check if we already have a loading message
          const existingLoadingIndex = prevMessages.findIndex(
            (msg) => msg.isPartial && !msg.isTool && msg.role === 'assistant'
          );

          // If we already have a loading message, don't add a new one
          if (existingLoadingIndex !== -1) {
            placeholderExists = true;
            return prevMessages;
          }

          // Add a new placeholder message
          return [
            ...prevMessages,
            {
              id: placeholderId,
              role: 'assistant',
              content: 'Thinking...',
              timestamp: formatTime(),
              isPartial: true,
            },
          ];
        });

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // If component is unmounted during the stream, stop processing
          if (!isMounted.current) {
            reader.cancel();
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
                } else if (parsedData.type === 'tool') {
                  // Handle tool messages in HTTP fallback mode
                  // Extract the tool status
                  const toolStatus = parsedData.status || 'starting';
                  const toolName = parsedData.tool;

                  if (toolStatus === 'starting') {
                    // Add a new tool message
                    setMessages((prevMessages) => {
                      // Check if we already have this tool message
                      const existingToolMessage = prevMessages.find(
                        (msg) =>
                          msg.isTool && msg.tool === toolName && msg.isPartial
                      );

                      if (existingToolMessage) {
                        // Update existing tool message
                        return prevMessages.map((msg) =>
                          msg.isTool && msg.tool === toolName && msg.isPartial
                            ? {
                                ...msg,
                                toolStatus: 'starting',
                                content: parsedData.content,
                              }
                            : msg
                        );
                      }

                      // Find the placeholder or any loading message from the assistant
                      const loadingMessageIndex = prevMessages.findIndex(
                        (msg) =>
                          msg.id === placeholderId ||
                          (msg.role === 'assistant' &&
                            !msg.isTool &&
                            msg.isPartial)
                      );

                      // Create new tool message
                      const newToolMessage: Message = {
                        id: uuidv4(),
                        role: 'assistant' as const,
                        content: parsedData.content,
                        timestamp: formatTime(),
                        isPartial: true,
                        isTool: true,
                        tool: toolName,
                        toolStatus: 'starting',
                      };

                      // If there's a loading message, insert the tool message before it
                      if (loadingMessageIndex !== -1) {
                        const result = [...prevMessages];
                        result.splice(loadingMessageIndex, 0, newToolMessage);
                        return result;
                      }

                      // If no loading message exists, add to the end
                      return [...prevMessages, newToolMessage];
                    });
                  } else if (toolStatus === 'completed') {
                    // Update existing tool message to completed
                    setMessages((prevMessages) => {
                      const existingToolIndex = prevMessages.findIndex(
                        (msg) =>
                          msg.isTool && msg.tool === toolName && msg.isPartial
                      );

                      if (existingToolIndex !== -1) {
                        // Update the existing tool message
                        const updatedMessages = [...prevMessages];
                        updatedMessages[existingToolIndex] = {
                          ...updatedMessages[existingToolIndex],
                          content: parsedData.content,
                          toolStatus: 'completed',
                        };
                        return updatedMessages;
                      }

                      // Find the placeholder or any loading message from the assistant
                      const loadingMessageIndex = prevMessages.findIndex(
                        (msg) =>
                          msg.id === placeholderId ||
                          (msg.role === 'assistant' &&
                            !msg.isTool &&
                            msg.isPartial)
                      );

                      // Create a new completed tool message
                      const completedToolMessage: Message = {
                        id: uuidv4(),
                        role: 'assistant' as const,
                        content: parsedData.content,
                        timestamp: formatTime(),
                        isPartial: true,
                        isTool: true,
                        tool: toolName,
                        toolStatus: 'completed',
                      };

                      // If there's a loading message, insert the completed tool message before it
                      if (loadingMessageIndex !== -1) {
                        const result = [...prevMessages];
                        result.splice(
                          loadingMessageIndex,
                          0,
                          completedToolMessage
                        );
                        return result;
                      }

                      // If no loading message exists, add to the end
                      return [...prevMessages, completedToolMessage];
                    });
                  }
                } else if (parsedData.type === 'partial') {
                  // Update with partial response while still streaming
                  // Keep tool messages but replace the placeholder/partial message
                  setMessages((prevMessages) => {
                    // Find the placeholder or existing partial message
                    const partialIndex = prevMessages.findIndex(
                      (msg) =>
                        msg.id === placeholderId ||
                        (msg.isPartial &&
                          !msg.isTool &&
                          msg.role === 'assistant')
                    );

                    // Create new partial message
                    const newPartialMessage: Message = {
                      id: uuidv4(),
                      role: 'assistant' as const,
                      content: parsedData.content,
                      timestamp: formatTime(),
                      isPartial: true,
                    };

                    // If there's no placeholder/partial message, just add the new one at the end
                    if (partialIndex === -1) {
                      return [...prevMessages, newPartialMessage];
                    }

                    // Replace the placeholder/partial message with the new one while maintaining all other messages in their exact positions
                    const result = [...prevMessages];
                    result[partialIndex] = newPartialMessage;
                    return result;
                  });
                } else if (
                  parsedData.type === 'content' ||
                  parsedData.type === 'error'
                ) {
                  // Final content - replace placeholder/loading message but keep all other messages in their exact positions
                  setMessages((prevMessages) => {
                    // Find the placeholder or existing partial message
                    const partialIndex = prevMessages.findIndex(
                      (msg) =>
                        msg.id === placeholderId ||
                        (msg.isPartial &&
                          !msg.isTool &&
                          msg.role === 'assistant')
                    );

                    // Create the final message
                    const finalMessage: Message = {
                      id: uuidv4(),
                      role: 'assistant' as const,
                      content: parsedData.content,
                      timestamp: formatTime(),
                      isPartial: false,
                    };

                    // If there's no placeholder/partial message, just add the final message at the end
                    if (partialIndex === -1) {
                      return [...prevMessages, finalMessage];
                    }

                    // Replace the placeholder/partial message with the final one
                    const result = [...prevMessages];
                    result[partialIndex] = finalMessage;
                    return result;
                  });

                  // Mark that we successfully completed the stream
                  isStreamCompleted = true;

                  // Reset states when we get final content
                  if (isMounted.current) {
                    setIsLoading(false);
                    setStreamInProgress(false);
                  }
                }
              } catch (error) {
                // Fallback for non-JSON messages (backward compatibility)
                const content = line.slice(6);

                // Update the placeholder message
                setMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.id === placeholderId
                      ? { ...msg, content, isPartial: false }
                      : msg
                  )
                );
              }
            }
          }
        }

        // At the end of the function, handle stream completion or errors
        if (!isStreamCompleted && isMounted.current) {
          setIsLoading(false);
          setStreamInProgress(false);

          // Update the placeholder message to indicate the stream failed
          setMessages((prevMessages) => {
            const placeholderIndex = prevMessages.findIndex(
              (msg) =>
                msg.id === placeholderId || (msg.isPartial && !msg.isTool)
            );

            if (placeholderIndex !== -1) {
              const result = [...prevMessages];
              result[placeholderIndex] = {
                id: uuidv4(),
                role: 'assistant',
                content: 'Sorry, there was an error processing your request.',
                timestamp: formatTime(),
                isPartial: false,
              };
              return result;
            }

            return prevMessages;
          });
        }
      } catch (error) {
        console.error('Error processing HTTP stream:', error);

        // Ensure loading and streaming states are reset on error
        if (isMounted.current) {
          setIsLoading(false);
          setStreamInProgress(false);
        }

        // Add an error message
        setMessages((prevMessages) => {
          return [
            ...prevMessages,
            {
              id: uuidv4(),
              role: 'assistant',
              content: `Sorry, there was an error: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
              timestamp: formatTime(),
              isPartial: false,
            },
          ];
        });
      }
    },
    []
  );

  // Clear chat history using HTTP fallback
  const clearChatHistoryHttp = useCallback(async () => {
    try {
      await axios.delete(`/chat/${userId}`);
      setMessages([]);
      setIsLoading(false);
      setStreamInProgress(false);
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  }, [userId]);

  return {
    messages,
    isLoading,
    streamInProgress,
    messagesEndRef,
    setMessages,
    setIsLoading,
    setStreamInProgress,
    handleStreamUpdate,
    handleStreamCancelled,
    handleChatHistory,
    handleHistoryCleared,
    handleError,
    addUserMessage,
    loadChatHistoryHttp,
    processHttpStream,
    clearChatHistoryHttp,
  };
};
