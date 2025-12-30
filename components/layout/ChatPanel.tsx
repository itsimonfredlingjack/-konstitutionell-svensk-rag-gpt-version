'use client';

import React from 'react';
import { Panel } from '@/components/ui/Panel';
import { Surface } from '@/components/ui/Surface';

interface ChatPanelProps {
  children: React.ReactNode;
  composer: React.ReactNode;
}

export const ChatPanel = ({ children, composer }: ChatPanelProps) => {
  return (
    <Panel variant="overlay" className="h-full flex flex-col relative overflow-hidden">
      <div className="flex-1 p-4 overflow-y-auto">
        {children}
      </div>
      <Surface className="p-4 border-t border-border-default">
        {composer}
      </Surface>
    </Panel>
  );
};
