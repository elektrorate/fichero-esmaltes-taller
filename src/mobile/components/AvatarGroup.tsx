import { Plus } from 'lucide-react';

interface AvatarGroupProps {
  names: string[];
}

export default function AvatarGroup({ names }: AvatarGroupProps) {
  return (
    <div className="flex items-center">
      {names.map((name, index) => (
        <div
          key={name}
          className="-ml-2 first:ml-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#F5F5F3] bg-[#111111] text-sm font-semibold text-white"
          style={{ zIndex: names.length - index }}
        >
          {name.charAt(0)}
        </div>
      ))}
      <button className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#F5F5F3] bg-[#22C55E] text-white">
        <Plus size={18} />
      </button>
    </div>
  );
}
