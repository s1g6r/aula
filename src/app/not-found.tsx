import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm font-semibold tracking-wide text-coral uppercase">Not found</p>
        <h1 className="mt-1 text-3xl font-semibold">This page doesn&rsquo;t exist, or it was deleted.</h1>
        <p className="mt-3 text-ink-2">Lessons and recaps delete themselves after 30 days, and teachers can delete them sooner.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex h-11 items-center rounded-lg bg-coral px-5 font-semibold text-primary-foreground">
            Go to Aula
          </Link>
          <Link href="/join" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-medium">
            Join a class
          </Link>
        </div>
      </div>
    </main>
  );
}
