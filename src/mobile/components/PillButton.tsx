import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PillButtonProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export default function PillButton({ children, active = false, onClick }: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full px-4 text-sm font-medium transition',
        active ? 'bg-[#111111] text-white' : 'bg-white text-[#111111] hover:bg-[#ECECE8]'
      )}
    >
      {children}
    </button>
  );
}
