import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './components/ChatMessage';
import { useUserId } from './hooks/useUserId';
import { useChat } from './hooks/useChat';
import { useSocket } from './hooks/useSocket';
import { httpFallback } from './utils/httpFallback';

function App(): React.ReactElement {
  const hasLoadedHistoryRef = useRef(false);
  const [input, setInput] = useState<string>('');
  const [connectionError, setConnectionError] = useState<boolean>(false);
  const userId = useUserId();

  // Reset the hasLoadedHistoryRef when the component mounts
  // This ensures we always try to load history on a fresh mount/page refresh
  useEffect(() => {
    hasLoadedHistoryRef.current = false;
  }, []);

  const {
    messages,
    isLoading,
    streamInProgress,
    messagesEndRef,
    handleStreamUpdate,
    handleStreamCancelled,
    handleChatHistory,
    handleHistoryCleared,
    handleError,
    addUserMessage,
    processHttpStream,
    clearChatHistoryHttp,
    setIsLoading,
    setStreamInProgress,
  } = useChat({ userId });

  // Direct state monitor in App component
  useEffect(() => {
    // Check for stale states - if the last message is not partial but states are still true
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage.role === 'assistant' &&
        !lastMessage.isPartial &&
        (isLoading || streamInProgress)
      ) {
        // Reset states if we detect a completed message but states are still active
        setIsLoading(false);
        setStreamInProgress(false);
      }
    }
  }, [
    messages,
    isLoading,
    streamInProgress,
    setIsLoading,
    setStreamInProgress,
  ]);

  const {
    sendChatRequest,
    cancelStream,
    clearChatHistory,
    isConnected,
    getChatHistory,
  } = useSocket({
    userId,
    onStreamUpdate: handleStreamUpdate,
    onStreamCancelled: handleStreamCancelled,
    onChatHistory: handleChatHistory,
    onHistoryCleared: handleHistoryCleared,
    onError: (error) => {
      handleError(error);
      setConnectionError(true);
    },
  });

  // Reset connection error when socket connects
  useEffect(() => {
    if (isConnected) {
      setConnectionError(false);
    }
  }, [isConnected]);

  // Load chat history with HTTP fallback if socket connection fails
  useEffect(() => {
    // Don't attempt if we don't have a userId yet
    if (!userId) return;

    // If we already have messages, don't reload
    if (messages.length > 0) {
      hasLoadedHistoryRef.current = true;
      return;
    }

    // Check if we need to load history
    if (!hasLoadedHistoryRef.current) {
      // Mark as loaded to prevent further attempts
      hasLoadedHistoryRef.current = true;

      // If connected via socket, explicitly request history
      if (isConnected && !connectionError) {
        // Force a request for history
        getChatHistory();
        return;
      }

      // If there's a connection issue, try the HTTP fallback
      if (connectionError || !isConnected) {
        httpFallback
          .loadChatHistory(userId)
          .then((historyMessages) => {
            if (historyMessages.length > 0) {
              handleChatHistory({ messages: historyMessages });
            }
          })
          .catch((err) => console.error('HTTP fallback failed:', err));
      }
    }
  }, [
    userId,
    connectionError,
    isConnected,
    handleChatHistory,
    messages.length,
    getChatHistory,
  ]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim() || isLoading || streamInProgress) {
      return;
    }

    // Add user message to UI immediately
    const userMessage = addUserMessage(input);

    // Clear input field
    setInput('');

    // Try socket.io first
    if (isConnected && !connectionError) {
      sendChatRequest(input);
    } else {
      // Fallback to HTTP
      console.log('Using HTTP fallback for message submission');
      try {
        const response = await httpFallback.sendMessage(
          userId,
          input,
          userMessage
        );
        await processHttpStream(response, userMessage);
      } catch (error) {
        console.error('Error with HTTP fallback:', error);
        handleError(error);
      }
    }
  };

  const handleClearChat = () => {
    // If there's an active stream, cancel it first
    if (streamInProgress) {
      if (isConnected && !connectionError) {
        cancelStream();
      } else {
        // Just update the UI state since HTTP fallback doesn't support cancellation
        handleStreamCancelled();
      }
    }

    // Try socket first, only fall back to HTTP if needed
    if (isConnected) {
      // Clear messages in the UI and then clear on the server
      clearChatHistory();
    }

    clearChatHistoryHttp();
  };

  const handleCancelStream = () => {
    if (isConnected && !connectionError) {
      cancelStream();
    } else {
      // Just update the UI state since HTTP fallback doesn't support cancellation
      handleStreamCancelled();
    }
  };

  // Function to get the last user message from the messages array
  const getLastUserMessage = (): string => {
    // Reverse the messages array to find the most recent user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return ''; // Return empty string if no user messages found
  };

  // Handle key press in the input field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check if the up arrow key was pressed
    if (e.key === 'ArrowUp') {
      // Only load the last message if the input field is empty or the cursor is at the beginning
      const inputElement = e.currentTarget;
      if (input === '' || inputElement.selectionStart === 0) {
        const lastMessage = getLastUserMessage();
        if (lastMessage) {
          setInput(lastMessage);
          // Prevent default behavior of moving cursor to the beginning of input
          e.preventDefault();

          // Set cursor position at the end of the input after state update
          setTimeout(() => {
            inputElement.selectionStart = lastMessage.length;
            inputElement.selectionEnd = lastMessage.length;
          }, 0);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 flex flex-col mx-auto w-full shadow-2xl bg-white">
        {/* Header Bar with subtle gradient and modern styling */}
        <header className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white p-4 shadow-md">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center space-x-3">
              <div className="bg-white/10 p-2 rounded-full w-12 h-12 flex items-center justify-center">
                <span className="text-2xl">🐳</span>
              </div>
              <h1 className="text-xl font-bold">Agent Chat</h1>
            </div>
            <div className="flex items-center">
              {!isConnected && (
                <span className="text-xs bg-yellow-500 text-white px-2 py-1 rounded-full">
                  Offline Mode
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Chat Messages Container with improved spacing */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-5 text-gray-500">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl">💬</span>
                </div>
                <h3 className="text-xl font-medium text-gray-700 mb-2">
                  Welcome to Agent Chat
                </h3>
                <p className="max-w-md text-gray-500">
                  Start a conversation with the AI assistant to get help with
                  your questions.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage key={index} message={message} userId={userId} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Container with modern styling */}
        <div className="border-t border-gray-200 bg-white">
          {messages.length > 0 && (
            <div className="px-4 py-2 flex justify-end">
              <button
                onClick={handleClearChat}
                className="text-gray-500 hover:text-red-500 text-sm font-medium flex items-center transition-colors duration-200 cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Clear conversation
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="p-4">
            <div className="flex space-x-2 items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message here..."
                  className="w-full py-3 px-4 rounded-full border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 outline-none text-gray-800"
                  disabled={isLoading || streamInProgress}
                />
              </div>

              {streamInProgress || isLoading ? (
                <button
                  type="button"
                  onClick={handleCancelStream}
                  className="bg-red-500 hover:bg-red-600 text-white font-medium py-3 px-6 rounded-full transition-colors duration-200 flex items-center shadow-md"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancel
                </button>
              ) : (
                <button
                  type="submit"
                  className="bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white font-medium py-3 px-6 rounded-full transition-all duration-200 flex items-center shadow-md"
                  disabled={isLoading || streamInProgress || !input.trim()}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  Send
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
