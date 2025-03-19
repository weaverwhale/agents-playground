import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MessageProps {
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    isPartial?: boolean;
    isTool?: boolean;
    tool?: string; // Add tool name if available directly
  };
}

const ChatMessage: React.FC<MessageProps> = ({ message }) => {
  const { role, content, timestamp, isPartial, isTool, tool } = message;

  // Extract tool name from content if present with more robust detection
  // Make the regex more permissive to catch different tool name formats
  const toolRegex = /using tool:?\s*([^.:\n]+?)(?:\.{3}|[.:]|\s*$)/i;
  const matchResult = content.match(toolRegex);

  // First try to use the tool property, if not available extract from content
  let toolName = tool || '';
  if (!toolName && matchResult && matchResult[1]) {
    toolName = matchResult[1].trim();
  }

  // Determine if this is a tool message (either by flag or content)
  const isToolMessage = isTool || !!matchResult;

  // Loading dots animation component
  const LoadingDots = () => (
    <div className="flex space-x-2 mt-2">
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      ></div>
    </div>
  );

  return (
    <div className={`message ${role} flex`}>
      <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
        <img
          src={
            role === 'user'
              ? `https://api.dicebear.com/7.x/avataaars/svg?seed=user`
              : role === 'system'
                ? `https://api.dicebear.com/7.x/bottts/svg?seed=system`
                : `https://api.dicebear.com/7.x/bottts/svg?seed=assistant`
          }
          alt={role}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1">
        {isToolMessage ? (
          <p>Working with tools...</p>
        ) : (
          <div className="message-content markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {timestamp && !isPartial && (
          <div className="text-xs text-gray-500 mt-1">{timestamp}</div>
        )}

        {isPartial && (
          <div className="text-xs text-blue-500 mt-1 flex items-center">
            <span className="mr-2">
              {isToolMessage ? `Asking ${toolName}` : 'AI is thinking'}
            </span>
            <LoadingDots />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
