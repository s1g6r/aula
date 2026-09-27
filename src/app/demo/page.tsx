import type { Metadata } from "next";
import Link from "next/link";
import { DemoPlayer } from "@/components/demo/demo-player";
import { GuestButton } from "@/components/guest-button";
import { Wordmark } from "@/components/wordmark";
import type { ReplayData } from "@/demo/replay-engine";
import replay from "@/demo/replay.json";

export const metadata: Metadata = {
  title: "Demo: a lesson in four languages",
  description: "Watch a real Biology lesson processed by Aula: live captions in Spanish, Arabic, Vietnamese and Chinese, an “I'm lost” signal, a question in Spanish, and a recap.",
};

// The Demo Replay: fully static (the recording ships with the app), so it
// works without the database or the AI, and never breaks during judging.
export default function DemoPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Demo replay</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="hidden text-sm font-medium text-ink-2 underline-offset-4 hover:underline sm:inline">
            About Aula
          </Link>
          <GuestButton className="h-10 px-4 text-sm">Try it live</GuestButton>
        </div>
      </header>
      <h1 className="sr-only">Aula demo: a Biology lesson in four languages</h1>
      <DemoPlayer data={replay as unknown as ReplayData} />
    </div>
  );
}
