// MessageBubble.tsx
import { Surface } from '@/components/ui/Surface';
import { StreamingIndicator } from './StreamingIndicator';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  return (
    <Surface className={role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
      <p className="text-text-primary">{content}</p>
      {isStreaming && <StreamingIndicator />}
    </Surface>
  );
}
