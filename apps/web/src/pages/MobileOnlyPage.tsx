import { Smartphone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui';

export default function MobileOnlyPage() {
  const { profile } = useAuth();
  const apk = import.meta.env.VITE_APK_URL as string | undefined;
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Smartphone className="size-10 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Use the Smart Waste mobile app</h1>
          <p className="text-muted-fg">
            {profile?.role === 'crew'
              ? 'Crew members follow their route and scan household QR codes in the mobile app. It works offline.'
              : 'Residents report full bins, pay bills, track the truck and use the AI sorting assistant in the mobile app. Basic phones can use the USSD menu.'}
          </p>
          {apk ? <a className="inline-flex min-h-10 items-center rounded-lg bg-primary-strong px-4 font-medium text-white" href={apk}>Download the Android app</a>
            : <p className="text-sm text-muted-fg">Ask the project team for the Android app link.</p>}
        </div>
      </Card>
    </div>
  );
}
