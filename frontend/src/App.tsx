import React, { useState, useEffect } from 'react';
import ChatMessage from './components/ChatMessage';
import { useUserId } from './hooks/useUserId';
import { useChat } from './hooks/useChat';
import { useSocket } from './hooks/useSocket';
import { httpFallback } from './utils/httpFallback';

function App(): React.ReactElement {
  const [input, setInput] = useState<string>('');
  const [connectionError, setConnectionError] = useState<boolean>(false);
  const userId = useUserId();

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
  } = useChat({ userId });

  const { sendChatRequest, cancelStream, clearChatHistory, isConnected } =
    useSocket({
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
    // If no userId or connection is working, do nothing
    if (!userId || (isConnected && !connectionError)) return;

    // If there's a connection issue, try the HTTP fallback
    if (connectionError) {
      console.log('Using HTTP fallback for chat history');
      httpFallback
        .loadChatHistory(userId)
        .then((messages) => {
          if (messages.length > 0) {
            handleChatHistory({ messages });
          }
        })
        .catch((err) => console.error('HTTP fallback failed:', err));
    }
  }, [userId, connectionError, isConnected, handleChatHistory]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

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

  return (
    <div className="flex h-full">
      <div className="chat-container flex-1">
        <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">🐳 Agent Chat</h1>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="chat-messages flex flex-col flex-1">
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="chat-input-container relative">
          {messages.length > 0 && (
            <p
              onClick={handleClearChat}
              className="text-red-500 font-bold absolute -top-8 cursor-pointer"
            >
              {!isConnected ? 'Clear Chat (Offline Mode)' : 'Clear Chat'}
            </p>
          )}
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
                onClick={handleCancelStream}
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
