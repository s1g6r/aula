"use client";

import Link from "next/link";

// Shown if a page crashes. Keeps the brand and offers a way back.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <p className="text-sm font-semibold tracking-wide text-coral uppercase">Something went wrong</p>
      <h1 className="mt-1 text-3xl font-semibold">That didn&rsquo;t load.</h1>
      <p className="mt-3 text-ink-2">It&rsquo;s probably a hiccup. Try again, and if it keeps happening, reload the page.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={reset} className="inline-flex h-11 items-center rounded-lg bg-coral px-5 font-semibold text-primary-foreground">
          Try again
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-medium">
          Go to Aula
        </Link>
      </div>
    </main>
  );
}
