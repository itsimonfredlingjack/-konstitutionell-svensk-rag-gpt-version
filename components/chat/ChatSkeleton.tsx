// ChatSkeleton.tsx
import { Surface } from '@/components/ui/Surface';

export function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <Surface className="mr-auto w-2/3 h-16 rounded-lg" />
      <Surface className="ml-auto w-1/2 h-12 rounded-lg" />
      <Surface className="mr-auto w-3/4 h-20 rounded-lg" />
    </div>
  );
}
