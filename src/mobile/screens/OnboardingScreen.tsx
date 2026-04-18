interface OnboardingScreenProps {
  onContinue: () => void;
}

export default function OnboardingScreen({ onContinue }: OnboardingScreenProps) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#F5F5F3] px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        <div className="mb-10 flex h-56 w-56 items-center justify-center rounded-[32px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="h-32 w-32 rounded-full bg-gradient-to-br from-[#F97316] to-[#EAB308]" />
        </div>
        <h1 className="text-center text-3xl font-medium leading-tight text-[#111111]">
          Build your wealth
          <br />
          <span className="text-[#F97316]">with smart moves</span>
        </h1>
        <p className="mt-4 text-center text-sm leading-6 text-[#666666]">
          Track savings, check market trends, and move money in one mobile-first experience.
        </p>
        <button
          onClick={onContinue}
          className="mt-10 min-h-12 w-full rounded-full bg-[#111111] px-6 text-sm font-semibold text-white"
        >
          Get Started
        </button>
        <button className="mt-4 min-h-11 text-sm font-medium text-[#111111]">I already have an account</button>
      </div>
    </div>
  );
}
