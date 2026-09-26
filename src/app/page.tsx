import Link from "next/link";
import { GuestButton } from "@/components/guest-button";
import { Wordmark } from "@/components/wordmark";

// Placeholder landing page. The full one (hook, 3 steps, Demo Replay,
// screenshots, privacy promise) is built in P8.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/login" className="text-sm font-medium text-ink-2 underline-offset-4 hover:underline">
          Teacher sign in
        </Link>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-4 text-sm font-medium tracking-wide text-coral uppercase">Live classroom captions</p>
        <h1 className="text-4xl leading-tight font-semibold sm:text-6xl">Every lesson, understood. In any language.</h1>
        <p className="mt-6 max-w-xl text-lg text-ink-2">
          The teacher talks. Each student follows on their own phone, in their own language, and can quietly say &ldquo;I&rsquo;m lost&rdquo;.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <GuestButton />
          <Link
            href="/join"
            className="inline-flex h-12 items-center rounded-lg border border-ink/15 bg-card px-6 text-base font-medium hover:bg-secondary"
          >
            I&rsquo;m a student
          </Link>
        </div>
      </section>
    </main>
  );
}
