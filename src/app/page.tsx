import { BookOpen } from "lucide-react";

// מסך זמני עד שיוקמו ההתחברות והמסכים (ראו docs/ROADMAP.md)
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <BookOpen className="h-12 w-12 text-blue-600" aria-hidden />
      <h1 className="text-3xl font-bold">מכירת ספרי לימוד</h1>
      <p className="text-gray-500">המערכת בהקמה</p>
    </main>
  );
}
