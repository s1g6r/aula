"use client";

import { useState } from "react";

export type TimelinePoint = { seq: number; offsetSec: number; lost: number; text: string };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// Where students got lost, across the lesson. Every sentence the teacher said
// is a small gray tick; sentences where students tapped "I'm lost" rise as
// coral bars (height = number of students). Hover or focus a bar to read the
// sentence. The same data is available as a table underneath.
export function Timeline({ durationSec, points }: { durationSec: number; points: TimelinePoint[] }) {
  const [active, setActive] = useState<TimelinePoint | null>(null);
  const max = Math.max(1, ...points.map((p) => p.lost));
  const peak = points.reduce<TimelinePoint | null>((a, p) => (p.lost > (a?.lost ?? 0) ? p : a), null);
  const x = (p: TimelinePoint) => `${Math.min(99, (p.offsetSec / Math.max(1, durationSec)) * 100)}%`;
  const lostPoints = points.filter((p) => p.lost > 0);

  return (
    <figure className="m-0">
      <div className="relative mt-8 h-36 border-b border-ink/20" onMouseLeave={() => setActive(null)}>
        {points
          .filter((p) => p.lost === 0)
          .map((p) => (
            <span key={p.seq} aria-hidden className="absolute bottom-0 h-1.5 w-0.5 -translate-x-1/2 rounded-t-sm bg-ink/20" style={{ left: x(p) }} />
          ))}
        {lostPoints.map((p) => (
          <button
            key={p.seq}
            type="button"
            className="group absolute bottom-0 flex h-full w-4 -translate-x-1/2 items-end justify-center focus-visible:outline-none"
            style={{ left: x(p) }}
            onMouseEnter={() => setActive(p)}
            onFocus={() => setActive(p)}
            onBlur={() => setActive(null)}
            aria-label={`${mmss(p.offsetSec)}: ${p.lost} ${p.lost === 1 ? "student" : "students"} lost at "${p.text}"`}
          >
            <span
              className="w-1.5 rounded-t-[4px] bg-coral transition-[width] group-hover:w-2 group-focus-visible:w-2 group-focus-visible:ring-3 group-focus-visible:ring-coral/30"
              style={{ height: `${Math.max(12, (p.lost / max) * 100)}%` }}
            />
          </button>
        ))}
        {peak && (
          <span className="pointer-events-none absolute -translate-x-1/2 text-xs font-semibold text-ink" style={{ left: x(peak), bottom: `calc(${Math.max(12, 100)}% + 4px)` }} aria-hidden>
            {peak.lost}
          </span>
        )}
        {active && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-10 mb-3 w-64 -translate-x-1/2 rounded-lg border bg-card p-3 text-sm shadow-lg"
            style={{ left: `clamp(8rem, ${x(active)}, calc(100% - 8rem))` }}
          >
            <p className="font-semibold">
              {mmss(active.offsetSec)} · {active.lost} {active.lost === 1 ? "student" : "students"} lost
            </p>
            <p className="mt-1 text-ink-2">&ldquo;{active.text}&rdquo;</p>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-2" aria-hidden>
        <span>0:00</span>
        <span>{mmss(durationSec / 2)}</span>
        <span>{mmss(durationSec)}</span>
      </div>
      <figcaption className="sr-only">Timeline of the lesson. Coral bars mark sentences where students tapped I&apos;m lost.</figcaption>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-2">Show as a table</summary>
        {lostPoints.length === 0 ? (
          <p className="mt-2 text-ink-2">Nobody tapped &ldquo;I&rsquo;m lost&rdquo; in this lesson.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-ink-2">
                <tr>
                  <th className="py-1 pr-4 font-medium">Time</th>
                  <th className="py-1 pr-4 font-medium">Students lost</th>
                  <th className="py-1 font-medium">What you were saying</th>
                </tr>
              </thead>
              <tbody>
                {lostPoints.map((p) => (
                  <tr key={p.seq} className="border-t">
                    <td className="py-1.5 pr-4 tabular-nums">{mmss(p.offsetSec)}</td>
                    <td className="py-1.5 pr-4 tabular-nums">{p.lost}</td>
                    <td className="py-1.5">{p.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </figure>
  );
}
