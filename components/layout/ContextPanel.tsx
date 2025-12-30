'use client';

import React from 'react';
import { Panel } from '@/components/ui/Panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export const ContextPanel = () => {
  return (
    <Panel className="h-full flex flex-col">
      <Tabs defaultValue="sources" className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="flex-1 overflow-y-auto p-4">
          <p>Sources content goes here.</p>
        </TabsContent>
        <TabsContent value="docs" className="flex-1 overflow-y-auto p-4">
          <p>Documents content goes here.</p>
        </TabsContent>
        <TabsContent value="pipeline" className="flex-1 overflow-y-auto p-4">
          <p>Pipeline visualization goes here.</p>
        </TabsContent>
        <TabsContent value="settings" className="flex-1 overflow-y-auto p-4">
          <p>Settings form goes here.</p>
        </TabsContent>
      </Tabs>
    </Panel>
  );
};
