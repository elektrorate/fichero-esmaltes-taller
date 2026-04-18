interface ProgressBarSegmentedProps {
  values: [number, number, number];
}

export default function ProgressBarSegmented({ values }: ProgressBarSegmentedProps) {
  const [green, orange, yellow] = values;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#EAEAE6]">
      <div className="flex h-full w-full">
        <div className="bg-[#22C55E]" style={{ width: `${green}%` }} />
        <div className="bg-[#F97316]" style={{ width: `${orange}%` }} />
        <div className="bg-[#EAB308]" style={{ width: `${yellow}%` }} />
      </div>
    </div>
  );
}
