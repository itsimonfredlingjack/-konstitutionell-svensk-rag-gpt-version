'use client';

import React from 'react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';

export const LeftRail = () => {
  return (
    <Panel className="h-full flex flex-col">
      <div className="p-4 border-b border-border-default">
        <h2 className="text-lg font-semibold">Sessions</h2>
      </div>
      <div className="flex-1 p-4 space-y-2 overflow-y-auto">
        {/* Placeholder for sessions list */}
        {[...Array(10)].map((_, i) => (
          <Button key={i} variant="ghost" className="w-full justify-start">
            Session {i + 1}
          </Button>
        ))}
      </div>
      <div className="p-4 border-t border-border-default">
        <Button className="w-full">New Chat</Button>
      </div>
    </Panel>
  );
};
