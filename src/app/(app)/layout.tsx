import { AppShell } from '@/components/AppShell';
import { YearProvider } from '@/components/YearContext';

// כל המסכים הפנימיים (אחרי התחברות): תפריט צד + שנת לימודים נבחרת + בדיקת משתמש פעיל
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <YearProvider>
      <AppShell>{children}</AppShell>
    </YearProvider>
  );
}
