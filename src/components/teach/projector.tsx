"use client";

import { Maximize, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { useLessonStream, type StreamEvent } from "@/hooks/use-lesson-stream";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent } from "@/lib/captions";

// Projector mode: the classroom screen. Huge, high-contrast English captions
// (also for deaf and hard-of-hearing students), the last few lines only, and
// the join code in the corner so latecomers can still join.
export function Projector({ lesson, qrSvg, joinHost }: { lesson: { id: string; code: string; title: string | null; status: "LIVE" | "ENDED" }; qrSvg: string; joinHost: string }) {
  const [captions, dispatch] = useReducer((s: typeof emptyCaptions, e: CaptionEvent) => applyCaptionEvent(s, e, false), { ...emptyCaptions, ended: lesson.status === "ENDED" });
  const onEvent = useCallback((e: StreamEvent) => dispatch(e as CaptionEvent), []);
  const status = useLessonStream(`/api/lessons/${lesson.id}/stream?role=teacher`, onEvent);
  const root = useRef<HTMLDivElement>(null);
  const recent = captions.lines.slice(-3);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f") void root.current?.requestFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={root} className="relative flex min-h-dvh flex-col bg-[#0d0f14] text-[#f5f2ea]">
      <div className="absolute top-4 left-4 flex gap-2 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <Link href={`/teach/${lesson.id}`} className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm" aria-label="Leave projector mode">
          <X className="size-4" aria-hidden /> Exit
        </Link>
        <button onClick={() => void root.current?.requestFullscreen?.()} className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm">
          <Maximize className="size-4" aria-hidden /> Full screen <kbd className="text-xs opacity-70">F</kbd>
        </button>
      </div>

      <aside className="absolute top-4 right-4 flex items-center gap-4 rounded-2xl bg-white/5 p-3 pr-5" aria-label="How to join">
        <div className="size-28 rounded-lg bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR code to join" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div>
          <p className="text-sm text-white/70">Join at {joinHost}</p>
          <p className="font-display text-4xl font-semibold tracking-wider tabular-nums">
            {lesson.code.slice(0, 3)} {lesson.code.slice(3)}
          </p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col justify-end px-[6vw] pt-48 pb-[8vh]" aria-live="polite">
        {recent.length === 0 && !captions.interim ? (
          <p className="text-[clamp(2rem,4vw,4rem)] text-white/50">{captions.ended ? "The lesson has ended." : (lesson.title ?? "Waiting for the teacher...")}</p>
        ) : (
          <div className="space-y-[2.5vh]">
            {recent.map((l, i) => (
              <p
                key={l.seq}
                lang="en"
                className="text-[clamp(2rem,4.2vw,4.75rem)] leading-[1.2] font-medium"
                style={{ opacity: i === recent.length - 1 && !captions.interim ? 1 : 0.55 + 0.15 * i }}
              >
                {l.fix ?? l.en}
              </p>
            ))}
            {captions.interim && !captions.ended && (
              <p lang="en" className="text-[clamp(2rem,4.2vw,4.75rem)] leading-[1.2] font-medium text-[#ffd98a]">
                {captions.interim}
              </p>
            )}
          </div>
        )}
      </main>
      {status !== "live" && !captions.ended && <p className="absolute bottom-3 left-4 text-sm text-[#ff9b85]">Reconnecting...</p>}
    </div>
  );
}
