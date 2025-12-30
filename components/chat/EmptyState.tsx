// EmptyState.tsx
import { Panel } from '@/components/ui/Panel';
import { Sparkles } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <div className="bg-surface-secondary rounded-full p-3 mb-4">
        <Sparkles size={24} className="text-text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Start a new conversation</h2>
      <p className="text-text-secondary">Ask me anything about Swedish law, and I'll do my best to help.</p>
    </div>
  );
}
