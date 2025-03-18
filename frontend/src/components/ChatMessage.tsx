import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MessageProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    isPartial?: boolean;
  };
}

const ChatMessage: React.FC<MessageProps> = ({ message }) => {
  const { role, content, timestamp, isPartial } = message;

  return (
    <div className={`message ${role} flex`}>
      <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
        <img
          src={
            role === 'user'
              ? `https://api.dicebear.com/7.x/avataaars/svg?seed=user`
              : `https://api.dicebear.com/7.x/bottts/svg?seed=assistant`
          }
          alt={role}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1">
        <div className="message-content markdown-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {timestamp && (
          <div className="text-xs text-gray-500 mt-1">{timestamp}</div>
        )}
        {isPartial && (
          <div className="text-xs text-blue-500 animate-pulse mt-1">
            typing...
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
