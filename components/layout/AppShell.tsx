'use client';

import React, { useState } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/Drawer';
import { Sheet, SheetContent } from '@/components/ui/Sheet';
import { MobileHeader } from './MobileHeader';
import { cn } from '@/lib/utils';

interface AppShellProps {
  leftRail: React.ReactNode;
  chatPanel: React.ReactNode;
  contextPanel: React.ReactNode;
}

export const AppShell = ({ leftRail, chatPanel, contextPanel }: AppShellProps) => {
  const [isLeftNavOpen, setIsLeftNavOpen] = useState(false);
  const [isRightNavOpen, setIsRightNavOpen] = useState(false);

  return (
    <>
      <MobileHeader 
        onLeftNavOpen={() => setIsLeftNavOpen(true)}
        onRightNavOpen={() => setIsRightNavOpen(true)}
      />
      <div className="flex h-screen w-full bg-surface-primary text-text-primary">
        {/* Left Rail (Desktop) */}
        <aside className="hidden lg:block w-[280px] flex-shrink-0 p-4">
          {leftRail}
        </aside>

        {/* Center Chat Panel */}
        <main className={cn(
          "flex-1 flex flex-col h-full transition-all duration-300 ease-in-out",
          "lg:px-0 pt-16 lg:pt-0" // Add padding top for mobile header
        )}>
          {chatPanel}
        </main>

        {/* Right Panel (Desktop) */}
        <aside className="hidden lg:block w-[320px] flex-shrink-0 p-4">
          {contextPanel}
        </aside>

        {/* Mobile Navigation */}
        <Drawer open={isLeftNavOpen} onOpenChange={setIsLeftNavOpen}>
          <DrawerContent side="left" className="p-4 pt-8">
            {leftRail}
          </DrawerContent>
        </Drawer>

        <Sheet open={isRightNavOpen} onOpenChange={setIsRightNavOpen}>
          <SheetContent className="p-4">
            {contextPanel}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
