"use client";

import { Check, Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Recap } from "@/lib/ai/schemas";

type RecapState = { status: string; recapId: string | null; content: Recap | null };

// The recap panel on the review page. Keeps checking while the recap is
// being written, and gives the teacher the shareable "What you missed" link.
export function ReviewRecap({ lessonId, initial }: { lessonId: string; initial: RecapState }) {
  const [recap, setRecap] = useState(initial);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (recap.status !== "GENERATING") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/lessons/${lessonId}/recap`);
      if (res.ok) setRecap(await res.json());
    }, 4000);
    return () => clearInterval(id);
  }, [recap.status, lessonId]);

  if (recap.status === "GENERATING") {
    return (
      <p className="flex items-center gap-2 text-ink-2" role="status">
        <span className="size-2 animate-pulse-soft rounded-full bg-coral" aria-hidden />
        Writing the recap from your transcript...
      </p>
    );
  }
  if (recap.status !== "READY" || !recap.content || !recap.recapId) {
    return (
      <div className="text-ink-2">
        <p>{recap.status === "FAILED" ? "The recap couldn't be written." : "No recap for this lesson yet."}</p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={async () => {
            await fetch(`/api/lessons/${lessonId}/recap`, { method: "POST" });
            setRecap((r) => ({ ...r, status: "GENERATING" }));
          }}
        >
          Write the recap
        </Button>
      </div>
    );
  }
  const link = `/r/${recap.recapId}`;
  return (
    <div>
      <ul className="list-disc space-y-1.5 pl-5">
        {recap.content.summary.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-2">
        {recap.content.keyTerms.length} key words and {recap.content.checkQuestions.length} check-yourself questions. Students see it in their own language; anyone who missed class can pick theirs.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <a href={link} target="_blank" rel="noreferrer">
            Open &ldquo;What you missed&rdquo;
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}${link}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Link copied" : "Copy link for absent students"}
        </Button>
      </div>
    </div>
  );
}

export function DeleteLesson({ lessonId }: { lessonId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={confirm ? "destructive" : "outline"}
        disabled={pending}
        onClick={async () => {
          if (!confirm) return setConfirm(true);
          setPending(true);
          const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
          if (res.ok) router.push("/teach");
          else setPending(false);
        }}
      >
        <Trash2 aria-hidden />
        {pending ? "Deleting..." : confirm ? "Yes, delete everything" : "Delete this lesson"}
      </Button>
      {confirm && !pending && (
        <button className="text-sm text-ink-2 underline underline-offset-4" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      )}
    </div>
  );
}
