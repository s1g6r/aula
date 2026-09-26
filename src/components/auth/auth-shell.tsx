import { Wordmark } from "@/components/wordmark";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Wordmark className="mb-8 text-3xl" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-[0_1px_0_rgba(27,30,43,0.04),0_12px_32px_-16px_rgba(27,30,43,0.18)] sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-ink-2">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
