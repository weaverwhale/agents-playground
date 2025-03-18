import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import ChatMessage from './components/ChatMessage';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
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

  // Get or create a user ID
  useEffect(() => {
    const storedUserId = localStorage.getItem('chatAgentUserId');
    if (storedUserId) {
      setUserId(storedUserId);
    } else {
      const newUserId = uuidv4();
      localStorage.setItem('chatAgentUserId', newUserId);
      setUserId(newUserId);
    }

    // Load chat history
    if (storedUserId) {
      loadChatHistory(storedUserId);
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadChatHistory = async (userId: string): Promise<void> => {
    try {
      const response = await axios.get(`/chat/${userId}/history`);
      if (response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message to UI immediately
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Use streaming endpoint
      const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          message: userMessage.content
        })
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      // Add a placeholder message for the assistant's response
      const placeholderId = uuidv4();
      setMessages(prevMessages => [
        ...prevMessages, 
        {
          id: placeholderId,
          role: 'assistant',
          content: 'Thinking...',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isPartial: true
        }
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
            responseText += chunk;
            
            // Update the placeholder message
            setMessages(prevMessages => 
              prevMessages.map(msg => 
                msg.id === placeholderId 
                  ? { ...msg, content: responseText, isPartial: false } 
                  : msg
              )
            );
          }
        } catch (error) {
          console.error('Error processing stream:', error);
        } finally {
          setIsLoading(false);
        }
      };

      processStream();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prevMessages => [
        ...prevMessages,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your request. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsLoading(false);
    }
  };

  const clearChatHistory = async (): Promise<void> => {
    try {
      await axios.delete(`/chat/${userId}`);
      setMessages([]);
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  };

  return (
    <div className="flex h-full">
      <div className="chat-container flex-1">
        <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Chat Assistant</h1>
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