import { ReactNode } from 'react';
import { Menu, UserCircle2 } from 'lucide-react';

interface MobileLayoutProps {
  title?: string;
  showHeader?: boolean;
  onMenuClick?: () => void;
  onProfileClick?: () => void;
  children: ReactNode;
}

export default function MobileLayout({
  title,
  showHeader = true,
  onMenuClick,
  onProfileClick,
  children
}: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F5F5F3] text-[#111111] pb-[calc(env(safe-area-inset-bottom)+88px)]">
      {showHeader && (
        <header className="sticky top-0 z-20 bg-[#F5F5F3]/95 px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
              onClick={onMenuClick}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            {title ? <h1 className="text-base font-semibold">{title}</h1> : <div />}
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
              onClick={onProfileClick}
              aria-label="Abrir perfil"
            >
              <UserCircle2 size={22} />
            </button>
          </div>
        </header>
      )}
      <main className="px-6 pb-8">{children}</main>
    </div>
  );
}
