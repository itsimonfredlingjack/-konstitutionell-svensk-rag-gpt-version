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

  return (
    <Panel className="sticky bottom-0 p-4 flex gap-2">
      <Textarea ref={inputRef} placeholder="Ask about Swedish law..." />
      <Button onClick={handleSubmit}>Send</Button>
    </Panel>
  );
}
