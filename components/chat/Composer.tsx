// Composer.tsx - CRITICAL: Use useRef to prevent re-renders
import { useRef } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';

export function Composer({ onSend }: { onSend: (message: string) => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (inputRef.current?.value.trim()) {
      onSend(inputRef.current.value);
      inputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="sticky bottom-0 p-4 bg-surface-primary/95 backdrop-blur-sm border-t border-border-default z-10">
      <div className="max-w-[var(--chatW)] mx-auto flex gap-2">
        <Textarea
          ref={inputRef}
          onKeyDown={handleKeyDown}
          placeholder="Ask about Swedish law..."
          className="bg-surface-elevated/50 focus:bg-surface-elevated border-border-default transition-colors resize-none min-h-[50px] max-h-[200px]"
        />
        <Button onClick={handleSubmit} className="h-auto">Send</Button>
      </div>
    </div>
  );
}
