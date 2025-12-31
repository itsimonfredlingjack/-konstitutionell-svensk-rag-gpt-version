import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const panelVariants = cva(
  'rounded-lg border border-border-default bg-surface-primary shadow-glass backdrop-blur-md',
  {
    variants: {
      variant: {
        default: 'bg-surface-primary',
        elevated: 'bg-surface-elevated',
        overlay: 'bg-surface-overlay',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(panelVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

Panel.displayName = 'Panel';

export { Panel };
