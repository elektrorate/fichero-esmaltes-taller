import { ArrowLeft, Star } from 'lucide-react';
import MobileCard from '../components/MobileCard';
import PillButton from '../components/PillButton';
import StatCard from '../components/StatCard';

const cryptos = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP'];

export default function MarketScreen() {
  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center justify-between pt-4">
        <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Market</h2>
        <div className="h-11 w-11" />
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {cryptos.map((coin, index) => (
          <button
            key={coin}
            className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold ${
              index === 0 ? 'bg-[#111111] text-white' : 'bg-white text-[#111111]'
            }`}
          >
            {coin}
          </button>
        ))}
      </div>

      <MobileCard className="p-5">
        <p className="text-sm text-[#6E6E6E]">Bitcoin Price</p>
        <h3 className="mt-2 text-[34px] font-semibold">$67,920</h3>
        <p className="mt-2 text-sm font-medium text-[#22C55E]">+5.21%</p>

        <div className="mt-4 flex gap-2 overflow-x-auto">
          <PillButton active>24h</PillButton>
          <PillButton>7d</PillButton>
          <PillButton>30d</PillButton>
          <PillButton>1y</PillButton>
        </div>

        <div className="mt-4 h-36 rounded-2xl bg-gradient-to-t from-[#22c55e33] to-transparent p-2">
          <svg viewBox="0 0 300 120" className="h-full w-full">
            <path
              d="M0,95 C30,75 50,80 80,60 C105,45 130,50 155,40 C180,30 205,20 235,25 C260,30 280,15 300,5"
              fill="none"
              stroke="#22C55E"
              strokeWidth="3"
            />
          </svg>
        </div>
      </MobileCard>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total Spent" value="$9,840" />
        <StatCard label="Budget" value="$12,000" />
        <StatCard label="Profit" value="+$2,160" accent={<span className="text-[#22C55E]">+18%</span>} />
      </div>

      <MobileCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#6E6E6E]">Trader</p>
            <h4 className="text-base font-semibold">Erick R.</h4>
          </div>
          <p className="flex items-center gap-1 text-sm font-semibold">
            <Star size={16} className="text-[#EAB308]" /> 4.9
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="min-h-11 rounded-full bg-[#111111] px-4 text-sm font-medium text-white">Buy</button>
          <button className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-[#111111]">Sell</button>
          <button className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-[#111111]">Swap</button>
        </div>
      </MobileCard>
    </div>
  );
}
