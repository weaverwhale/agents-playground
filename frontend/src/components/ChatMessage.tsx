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
    <div className="flex space-x-1 ml-2">
      <div
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      ></div>
    </div>
  );

  return (
    <div
      className={`flex items-start ${role === 'user' ? 'justify-end' : 'justify-start'} mb-6`}
    >
      {/* For non-user messages, show avatar first */}
      {role !== 'user' && (
        <div className="h-9 w-9 rounded-full flex-shrink-0 overflow-hidden shadow-sm mr-3">
          <img
            src={
              role === 'system'
                ? `https://api.dicebear.com/7.x/bottts/svg?seed=system`
                : `https://api.dicebear.com/7.x/bottts/svg?seed=assistant`
            }
            alt={role}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div
        className={`flex flex-col gap-2 ${role === 'user' ? 'order-1' : 'order-2'} max-w-[80%]`}
      >
        {isToolMessage ? (
          <div
            className={`rounded-lg shadow-sm overflow-hidden inline-block ${
              toolCompleted
                ? 'bg-green-50 border-l-4 border-green-400'
                : 'bg-blue-50 border-l-4 border-blue-400'
            }`}
          >
            <div className="px-4 py-2 bg-opacity-10">
              <div
                className={`text-sm font-medium ${
                  toolCompleted ? 'text-green-700' : 'text-blue-700'
                } flex items-center`}
              >
                {toolCompleted ? '✓ Tool completed' : '⚙️ Working with tool...'}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {toolName ? (
                  <span className="font-medium capitalize">
                    {formatToolName(toolName)}
                  </span>
                ) : (
                  'AI Assistant'
                )}
                {toolCompleted
                  ? ' finished processing'
                  : ' is processing your request'}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`message relative rounded-2xl shadow-sm inline-block
              ${
                role === 'user'
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-r-4 border-blue-400'
                  : role === 'system'
                    ? 'bg-amber-50 border-l-4 border-amber-400'
                    : 'bg-gray-100 border-l-4 border-gray-300'
              } 
              px-4 py-3
            `}
          >
            <div
              className={`message-content markdown-content ${role === 'user' ? 'text-white' : 'text-gray-800'} break-words`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {timestamp && !isPartial && (
          <div className="text-xs text-gray-400 mt-1 ml-2">{timestamp}</div>
        )}

        {isPartial && !isToolMessage && (
          <div
            className={`text-xs ${getToolStatusColor()} mt-1 ml-2 flex items-center`}
          >
            <span>{getToolStatusText()}</span>
            <LoadingDots />
          </div>
        )}
      </div>

      {/* For user messages, show avatar last */}
      {role === 'user' && (
        <div className="h-9 w-9 rounded-full flex-shrink-0 overflow-hidden shadow-sm ml-3 order-2">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`}
            alt={role}
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
