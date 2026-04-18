import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface MobileCardProps {
  children: ReactNode;
  className?: string;
}

export default function MobileCard({ children, className }: MobileCardProps) {
  return (
    <section
      className={cn(
        'rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]',
        className
      )}
    >
      {children}
    </section>
  );
}
