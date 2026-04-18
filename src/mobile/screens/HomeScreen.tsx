import { ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react';
import AvatarGroup from '../components/AvatarGroup';
import Chip from '../components/Chip';
import MobileCard from '../components/MobileCard';
import PillButton from '../components/PillButton';
import ProgressBarSegmented from '../components/ProgressBarSegmented';

const topUpAmounts = ['$50', '$100', '$150', '$250'];

export default function HomeScreen() {
  return (
    <div className="space-y-4 pb-6">
      <div className="pt-4">
        <p className="text-sm text-[#6E6E6E]">Good morning</p>
        <h2 className="text-2xl font-semibold">Hi, Erick</h2>
      </div>

      <MobileCard className="p-5">
        <p className="text-sm text-[#6E6E6E]">Total Savings</p>
        <h3 className="mt-2 text-[36px] font-semibold leading-none">$128,450</h3>
        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#22C55E]">
          <TrendingUp size={16} /> +3.4% this month
        </p>
      </MobileCard>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <PillButton active>24h</PillButton>
        <PillButton>7d</PillButton>
        <PillButton>30d</PillButton>
      </div>

      <MobileCard>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Progress</h3>
          <span className="text-xs text-[#6E6E6E]">Goal tracking</span>
        </div>
        <div className="mt-4">
          <ProgressBarSegmented values={[45, 30, 25]} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-[#22C55E]">
            <Sparkles size={14} /> Saved
          </span>
          <span className="flex items-center gap-1 text-[#F97316]">
            <ArrowUpRight size={14} /> Expenses
          </span>
          <span className="text-[#EAB308]">Pending</span>
        </div>
      </MobileCard>

      <MobileCard>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Team Members</h3>
          <button className="text-sm font-medium text-[#111111]">See all</button>
        </div>
        <div className="mt-4">
          <AvatarGroup names={['Ana', 'Luis', 'Mia', 'Noah']} />
        </div>
      </MobileCard>

      <MobileCard>
        <h3 className="font-semibold">Top Up</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {topUpAmounts.map((amount, index) => (
            <Chip key={amount} active={index === 1}>
              {amount}
            </Chip>
          ))}
        </div>
      </MobileCard>
    </div>
  );
}
