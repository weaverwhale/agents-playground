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
      isMounted.current = false;
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handler for tool updates from the stream
  const handleToolUpdate = useCallback((data: any) => {
    // Extract the tool status (starting or completed)
    const toolStatus = data.status || 'starting';
    const toolName = data.tool;

    setMessages((prevMessages) => {
      // First, check if this is a new tool starting after a previous tool completed
      if (toolStatus === 'starting') {
        // Find any tool messages that might be for different tools
        const existingToolMessages = prevMessages.filter(
          (msg) => msg.isTool && msg.isPartial
        );

        // If we have a different tool with 'completed' status but we're now starting a new tool,
        // we need to make sure we add a new tool message rather than trying to update an existing one
        const isDifferentToolStarting = existingToolMessages.some(
          (msg) => msg.tool !== toolName && msg.toolStatus === 'completed'
        );

        if (isDifferentToolStarting) {
          // Keep all existing messages (including other completed tool messages)
          // and add a new tool message for this new tool
          return [
            ...prevMessages,
            {
              id: uuidv4(),
              role: 'assistant',
              content: data.content,
              timestamp: formatTime(),
              isPartial: true,
              isTool: true,
              tool: toolName,
              toolStatus: 'starting',
            },
          ];
        }
      }

      // For tool completion, find and update the matching tool message
      if (toolStatus === 'completed') {
        // Find the matching tool message
        const existingToolIndex = prevMessages.findIndex(
          (msg) => msg.isTool && msg.tool === toolName && msg.isPartial
        );

        // If we found the tool message, update its status
        if (existingToolIndex !== -1) {
          const updatedMessages = [...prevMessages];
          updatedMessages[existingToolIndex] = {
            ...updatedMessages[existingToolIndex],
            content: data.content, // Update with completion message
            toolStatus: 'completed',
            // Keep isPartial true until the final response arrives
          };
          return updatedMessages;
        }
      }

      // For starting a tool (when no other tool is active or we're reusing same tool)
      // Keep all messages except loading messages
      const nonLoadingMessages = prevMessages.filter(
        (msg) => !(msg.isPartial && msg.role === 'assistant' && !msg.isTool)
      );

      // Find if we already have this exact tool message
      const existingToolMessage = nonLoadingMessages.find(
        (msg) => msg.isTool && msg.tool === toolName && msg.isPartial
      );

      // If we already have this tool message, don't add a duplicate
      if (existingToolMessage) {
        // If the status is different, update it
        if (existingToolMessage.toolStatus !== toolStatus) {
          return nonLoadingMessages.map((msg) =>
            msg.isTool && msg.tool === toolName && msg.isPartial
              ? { ...msg, toolStatus, content: data.content }
              : msg
          );
        }
        return nonLoadingMessages;
      }

      // Add the new tool message
      return [
        ...nonLoadingMessages,
        {
          id: uuidv4(),
          role: 'assistant',
          content: data.content,
          timestamp: formatTime(),
          isPartial: true,
          isTool: true,
          tool: toolName,
          toolStatus,
        },
      ];
    });

    if (isMounted.current) {
      setStreamInProgress(true);
    }
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
            timestamp: formatTime(),
            isPartial: true,
            isTool: true,
            tool: extractedTool,
            toolStatus: 'starting', // Default to starting for backwards compatibility
          },
        ];
      });

      if (isMounted.current) {
        setStreamInProgress(true);
      }
      return; // Exit early after handling tool notification
    }

    // Handle other loading messages
    else {
      // Skip "Generating response..." if we have active tool messages
      if (data.content === 'Generating response...') {
        setMessages((prevMessages) => {
          const hasActiveToolMessages = prevMessages.some(
            (msg) => msg.isTool && msg.isPartial
          );
          if (hasActiveToolMessages) {
            return prevMessages; // Skip this generic loading message if tools are active
          }

          // Filter out any partial messages (loading messages)
          const messagesWithoutPartials = prevMessages.filter(
            (msg) => !(msg.isPartial && msg.role === 'assistant' && !msg.isTool)
          );

          // Add new loading message
          return [
            ...messagesWithoutPartials,
            {
              id: uuidv4(),
              role: 'assistant',
              content: data.content,
              timestamp: formatTime(),
              isPartial: true,
            },
          ];
        });
      } else {
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
              timestamp: formatTime(),
              isPartial: true,
            },
          ];
        });
      }

      if (isMounted.current) {
        setStreamInProgress(true);
      }
    }
  }, []);

  // Handler for partial content updates
  const handlePartialUpdate = useCallback((data: any) => {
    // When we get partial content, it means tools are done and we should show results
    setMessages((prevMessages) => {
      // Keep all complete messages
      const completeMessages = prevMessages.filter((msg) => !msg.isPartial);

      // Create our new partial message with the updated content
      const newPartialMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: data.content,
        timestamp: formatTime(),
        isPartial: true,
      };

      // Return only complete messages and the new partial message
      return [...completeMessages, newPartialMessage];
    });

    if (isMounted.current) {
      setStreamInProgress(true);
    }
  }, []);

  // Handler for final content
  const handleFinalContent = useCallback((data: any) => {
    // Final content replaces all partial messages including tool messages
    setMessages((prevMessages) => {
      // Log the existing messages for debugging
      console.log('Cleaning up tool messages for final response');

      // Keep only complete messages - remove all partial messages including tools
      const completeMessages = prevMessages.filter((msg) => !msg.isPartial);

      // Add the final message
      return [
        ...completeMessages,
        {
          id: uuidv4(),
          role: 'assistant',
          content: data.content,
          timestamp: formatTime(),
          isPartial: false,
        },
      ];
    });

    if (isMounted.current) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
  }, []);

  // Handler for stream updates
  const handleStreamUpdate = useCallback(
    (data: any) => {
      if (data.type === 'error') {
        console.error('Stream error:', data.content);
        handleFinalContent(data); // Treat errors like final content
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
        handleFinalContent(data);
        return;
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
    if (isMounted.current) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
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
    if (isMounted.current) {
      setIsLoading(false);
      setStreamInProgress(false);
    }
  }, []);

  // Add a user message to the chat
  const addUserMessage = useCallback((content: string) => {
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: formatTime(),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    if (isMounted.current) {
      setIsLoading(true);
      setStreamInProgress(true);
    }

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
      try {
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
            timestamp: formatTime(),
            isPartial: true,
          },
        ]);

        const reader = response.body.getReader();
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

                      // Remove placeholder and add tool message
                      const messagesWithoutPlaceholder = prevMessages.filter(
                        (msg) => msg.id !== placeholderId
                      );

                      return [
                        ...messagesWithoutPlaceholder,
                        {
                          id: uuidv4(),
                          role: 'assistant',
                          content: parsedData.content,
                          timestamp: formatTime(),
                          isPartial: true,
                          isTool: true,
                          tool: toolName,
                          toolStatus: 'starting',
                        },
                      ];
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

                      // If we can't find the tool message, create a new completed one
                      return [
                        ...prevMessages.filter(
                          (msg) => msg.id !== placeholderId
                        ),
                        {
                          id: uuidv4(),
                          role: 'assistant',
                          content: parsedData.content,
                          timestamp: formatTime(),
                          isPartial: true,
                          isTool: true,
                          tool: toolName,
                          toolStatus: 'completed',
                        },
                      ];
                    });
                  }
                } else if (parsedData.type === 'partial') {
                  // Update with partial response while still streaming
                  // When we get partial content, remove all tool messages as they're done
                  setMessages((prevMessages) => {
                    // Keep all complete messages and non-tool partial messages
                    const filteredMessages = prevMessages.filter(
                      (msg) => !msg.isPartial || (msg.isPartial && !msg.isTool)
                    );

                    // Replace the placeholder with the partial content
                    const messagesWithoutPlaceholder = filteredMessages.filter(
                      (msg) => msg.id !== placeholderId
                    );

                    return [
                      ...messagesWithoutPlaceholder,
                      {
                        id: uuidv4(),
                        role: 'assistant',
                        content: parsedData.content,
                        timestamp: formatTime(),
                        isPartial: true,
                      },
                    ];
                  });
                } else if (
                  parsedData.type === 'content' ||
                  parsedData.type === 'error'
                ) {
                  // Final content - replace all partial messages including tools
                  setMessages((prevMessages) => {
                    // Keep only complete messages
                    const completeMessages = prevMessages.filter(
                      (msg) => !msg.isPartial
                    );

                    return [
                      ...completeMessages,
                      {
                        id: uuidv4(),
                        role: 'assistant',
                        content: parsedData.content,
                        timestamp: formatTime(),
                        isPartial: false,
                      },
                    ];
                  });
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
      } catch (error) {
        console.error('Error processing stream:', error);
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            role: 'assistant',
            content:
              'Sorry, there was an error processing your request. Please try again.',
            timestamp: formatTime(),
          },
        ]);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          setStreamInProgress(false);
        }
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
