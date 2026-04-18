import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  accent?: ReactNode;
}

export default function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <p className="text-xs text-[#737373]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {accent && <div className="mt-2 text-sm">{accent}</div>}
    </div>
  );
}
