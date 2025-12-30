'use client';

import React from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, SlidersHorizontal } from 'lucide-react';

interface MobileHeaderProps {
  onLeftNavOpen: () => void;
  onRightNavOpen: () => void;
}

export const MobileHeader = ({ onLeftNavOpen, onRightNavOpen }: MobileHeaderProps) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-16 px-4 border-b border-border-default bg-surface-primary/80 backdrop-blur-sm lg:hidden">
      <IconButton onClick={onLeftNavOpen} aria-label="Open navigation">
        <Menu />
      </IconButton>
      <h1 className="text-lg font-semibold">Chat</h1>
      <IconButton onClick={onRightNavOpen} aria-label="Open context panel">
        <SlidersHorizontal />
      </IconButton>
    </header>
  );
};
