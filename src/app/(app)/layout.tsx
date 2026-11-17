import { AppShell } from '@/components/AppShell';

// כל המסכים הפנימיים (אחרי התחברות): תפריט צד + בדיקת משתמש פעיל
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
