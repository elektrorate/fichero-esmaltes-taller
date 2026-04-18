import { Home, LineChart, ShoppingBag, Wallet, User } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MobileTab = 'home' | 'market' | 'wallet' | 'shop' | 'profile';

interface BottomTabBarProps {
  currentTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: Array<{ id: MobileTab; icon: typeof Home; label: string }> = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'market', icon: LineChart, label: 'Market' },
  { id: 'wallet', icon: Wallet, label: 'Wallet' },
  { id: 'shop', icon: ShoppingBag, label: 'Shop' },
  { id: 'profile', icon: User, label: 'Profile' }
];

export default function BottomTabBar({ currentTab, onTabChange }: BottomTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-black/5 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <ul className="mx-auto flex max-w-md items-center justify-between">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <li key={tab.id}>
              <button
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl px-2 text-[11px] font-medium',
                  isActive ? 'bg-[#111111] text-white' : 'text-[#666666]'
                )}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
