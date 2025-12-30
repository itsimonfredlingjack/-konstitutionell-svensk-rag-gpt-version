// MessageActions.tsx
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip';
import { Copy, Quote, Pin, Sparkles } from 'lucide-react';

interface MessageActionsProps {
  onCopy: () => void;
  onCite: () => void;
  onPin: () => void;
  onApply?: () => void;
}

export function MessageActions({ onCopy, onCite, onPin, onApply }: MessageActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton variant="default" onClick={onCopy}><Copy size={14} /></IconButton>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton variant="default" onClick={onCite}><Quote size={14} /></IconButton>
          </TooltipTrigger>
          <TooltipContent>Cite</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton variant="default" onClick={onPin}><Pin size={14} /></IconButton>
          </TooltipTrigger>
          <TooltipContent>Pin</TooltipContent>
        </Tooltip>
        {onApply && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton variant="accent" onClick={onApply}><Sparkles size={14} /></IconButton>
            </TooltipTrigger>
            <TooltipContent>Apply</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
