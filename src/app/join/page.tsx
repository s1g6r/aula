import { CodeForm } from "@/components/join/code-form";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Join a lesson" };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-8">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="mb-2 text-3xl font-semibold">Join your class</h1>
        <p className="mb-8 text-ink-2">Type the code your teacher is showing, or scan their QR code with your camera.</p>
        <CodeForm />
      </div>
    </main>
  );
}
