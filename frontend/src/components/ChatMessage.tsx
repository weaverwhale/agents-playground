import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { MessageProps } from '../types';
import { formatToolName } from '../utils/formatters';

const ChatMessage: React.FC<MessageProps> = ({ message, userId }) => {
  const { role, content, timestamp, isPartial, isTool, tool, toolStatus } =
    message;

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

  const toolCompleted = toolStatus === 'completed';

  // Determine appropriate status text
  const getToolStatusText = () => {
    if (!isToolMessage && !isPartial) return 'AI is thinking';
    if (toolCompleted) return 'Tool completed, waiting for next step...';
    if (toolName) return `Working with ${formatToolName(toolName)}...`;
    return 'AI is thinking';
  };

  // Determine color for tool status
  const getToolStatusColor = () => {
    if (!isToolMessage) return 'text-blue-500';
    if (toolCompleted) return 'text-green-500';
    return 'text-blue-500';
  };

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
              ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
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
          <div
            className={`tool-message p-2 rounded ${
              toolStatus === 'completed' ? 'bg-green-50' : 'bg-blue-50'
            } ${toolStatus === 'completed' ? 'border-l-4 border-green-400' : isPartial ? 'border-l-4 border-blue-400' : ''}`}
          >
            <p
              className={`font-medium ${
                toolStatus === 'completed' ? 'text-green-700' : 'text-blue-700'
              }`}
            >
              {toolStatus === 'completed'
                ? '✓ Tool completed'
                : '⚙️ Working with tool...'}
            </p>
            <p className="text-sm text-gray-600">
              {toolName ? (
                <span className="font-semibold capitalize">
                  {formatToolName(toolName)}
                </span>
              ) : (
                'AI Assistant'
              )}
              {toolStatus === 'completed'
                ? ' finished processing'
                : ' is processing your request'}
            </p>
          </div>
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

        {isPartial && !isToolMessage && (
          <div
            className={`text-xs ${getToolStatusColor()} mt-1 flex items-center`}
          >
            <span className="mr-2">{getToolStatusText()}</span>
            <LoadingDots />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
