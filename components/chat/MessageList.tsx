// MessageList.tsx
import { Panel } from '@/components/ui/Panel';

export function MessageList({ children }: { children: React.ReactNode }) {
  return (
    <Panel variant="default" className="flex-1 overflow-y-auto p-4">
      <div role="log" aria-live="polite" className="space-y-4">
        {children}
      </div>
    </Panel>
  );
}
