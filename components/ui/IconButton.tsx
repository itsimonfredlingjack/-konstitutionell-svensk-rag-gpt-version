import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-full w-10 h-10 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-primary disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent border border-border-default hover:bg-accent-subtle',
        accent: 'bg-accent text-text-on-accent hover:bg-accent/90',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(iconButtonVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
