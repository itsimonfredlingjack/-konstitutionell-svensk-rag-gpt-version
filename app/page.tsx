"use client";

import { AppShell, LeftRail, ChatPanel, ContextPanel } from '@/components/layout';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { User, Sparkles } from 'lucide-react';

const PlaceholderMessages = () => (
  <div className="space-y-4">
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
        <User size={16} />
      </div>
      <p className="p-4 rounded-lg bg-surface-elevated">This is a user message.</p>
    </div>
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
        <Sparkles size={16} />
      </div>
      <p className="p-4 rounded-lg bg-surface-elevated">This is an assistant message.</p>
    </div>
  </div>
);

const PlaceholderComposer = () => (
  <div className="flex items-center gap-4">
    <Textarea placeholder="Type your message..." className="flex-1" />
    <Button>Send</Button>
  </div>
);

export default function Home() {
  return (
    <AppShell
      leftRail={<LeftRail />}
      contextPanel={<ContextPanel />}
      chatPanel={
        <ChatPanel
          composer={<PlaceholderComposer />}
        >
          <PlaceholderMessages />
        </ChatPanel>
      }
    />
  );
}
