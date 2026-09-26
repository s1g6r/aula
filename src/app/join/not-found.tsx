import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function LessonNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-8">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-semibold">We couldn&rsquo;t find that lesson</h1>
        <p className="mt-2 text-ink-2">Check the code with your teacher. Codes are 6 letters and numbers.</p>
        <Link href="/join" className="mt-6 font-medium text-coral underline underline-offset-4">
          Try another code
        </Link>
      </div>
    </main>
  );
}
