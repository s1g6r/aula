import type { NextRequest } from "next/server";
import { currentTeacher } from "@/auth";
import { languageJoined } from "@/lib/pipeline";
import { bus, type StoredEvent, type Subscriber } from "@/lib/realtime/bus";
import { encodeEvent } from "@/lib/realtime/sse";
import { jsonError } from "@/lib/server/http";
import { getLesson } from "@/lib/server/lessons";
import { currentParticipant } from "@/lib/server/participants";
import { publishRoom, studentSnapshot, teacherSnapshot } from "@/lib/server/room";

// GET /api/lessons/:id/stream?role=teacher|student
//
// One long-lived Server-Sent Events connection per screen. Order of work:
//   1. subscribe to the lesson's bus first (new events wait in `pending`),
//   2. catch up: replay missed events (Last-Event-ID) or send a snapshot,
//   3. flush `pending`, then stream live.
// Doing it in this order means nothing published during the catch-up is lost.

export async function GET(request: NextRequest, ctx: RouteContext<"/api/lessons/[id]/stream">) {
  const { id } = await ctx.params;
  const lesson = await getLesson(id);
  if (!lesson) return jsonError(404, "Lesson not found");

  let who: Omit<Subscriber, "send">;
  if (request.nextUrl.searchParams.get("role") === "teacher") {
    const teacher = await currentTeacher();
    if (!teacher || teacher.id !== lesson.teacherId) return jsonError(403, "Not your lesson");
    who = { role: "teacher" };
  } else {
    const p = await currentParticipant(id);
    if (!p) return jsonError(401, "Join the lesson first");
    who = { role: "student", lang: p.lang, participantId: p.id };
  }

  const lastEventId = request.headers.get("last-event-id") || request.nextUrl.searchParams.get("lastEventId");
  const encoder = new TextEncoder();
  let close = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      let ready = false;
      const pending: StoredEvent[] = [];
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const send = (e: StoredEvent) => (ready ? write(encodeEvent(e)) : pending.push(e));

      const { unsubscribe, atN } = bus.subscribe(id, { ...who, send });
      // A ping every 15s keeps proxies from closing an idle connection, and
      // lets the phone notice a dead connection (it expects one regularly).
      // It's a real event, not an SSE comment, because browsers hide comments.
      const heartbeat = setInterval(() => write("event: ping\ndata: {}\n\n"), 15_000);
      close = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        if (who.role === "student") void publishRoom(id);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => close());

      // Browsers reconnect automatically; ask them to wait 2s between tries.
      write("retry: 2000\n\n");
      const replay = lastEventId ? bus.replaySince(id, lastEventId, who, atN) : null;
      if (replay) {
        for (const e of replay) write(encodeEvent(e));
      } else {
        const data = who.role === "teacher" ? await teacherSnapshot(id) : await studentSnapshot(id, who.lang!);
        write(encodeEvent({ id: `${bus.epoch}-${atN}`, type: "snapshot", data }));
      }
      ready = true;
      for (const e of pending) write(encodeEvent(e));
      if (who.role === "student") {
        void publishRoom(id);
        void languageJoined(id, who.lang!);
      }
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression middleware from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
