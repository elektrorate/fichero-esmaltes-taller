import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export default function Chip({ children, active = false, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-2xl px-4 text-sm font-medium transition',
        active ? 'bg-[#111111] text-white' : 'bg-white text-[#111111]'
      )}
    >
      {children}
    </button>
  );
}
