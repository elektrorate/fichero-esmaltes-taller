import { useState } from 'react';
import BottomTabBar, { MobileTab } from './components/BottomTabBar';
import MobileLayout from './layouts/MobileLayout';
import HomeScreen from './screens/HomeScreen';
import MarketScreen from './screens/MarketScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import './styles/mobile.css';

export default function MobileApp() {
  const [didOnboard, setDidOnboard] = useState(false);
  const [currentTab, setCurrentTab] = useState<MobileTab>('home');

  if (!didOnboard) {
    return <OnboardingScreen onContinue={() => setDidOnboard(true)} />;
  }

  return (
    <>
      <MobileLayout title={currentTab === 'market' ? 'Market' : undefined}>
        {currentTab === 'home' && <HomeScreen />}
        {currentTab === 'market' && <MarketScreen />}
        {currentTab !== 'home' && currentTab !== 'market' && (
          <div className="flex min-h-[50vh] items-center justify-center rounded-3xl bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="text-sm text-[#666666]">
              This mobile section is ready for the next screen implementation.
            </p>
          </div>
        )}
      </MobileLayout>
      <BottomTabBar currentTab={currentTab} onTabChange={setCurrentTab} />
    </>
  );
}
