import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const surfaceVariants = cva('', {
  variants: {
    padding: {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
  },
  defaultVariants: {
    padding: 'md',
  },
});

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(surfaceVariants({ padding }), className)}
        {...props}
      />
    );
  }
);

Surface.displayName = 'Surface';

export { Surface };
