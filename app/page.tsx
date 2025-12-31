"use client";

import { AppShell, LeftRail, ContextPanel } from '@/components/layout';
import { MessageList, Composer, EmptyState } from '@/components/chat';
import { useChat } from '@/lib/hooks';

export default function Home() {
  const { messages, loading, sendMessage } = useChat();

  return (
    <AppShell
      leftRail={<LeftRail />}
      contextPanel={<ContextPanel />}
      chatPanel={
        <div className="flex flex-col h-full relative">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              <MessageList messages={messages} loading={loading} />
            )}
          </div>
          <Composer onSend={sendMessage} />
        </div>
      }
    />
  );
}
