"use client";

import { Check, Copy, Mic, MicOff, Send, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLessonStream, type StreamEvent } from "@/hooks/use-lesson-stream";
import { useSpeechRecognition, type MicDevice, type SpeechStatus } from "@/hooks/use-speech-recognition";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent } from "@/lib/captions";
import { getLanguage } from "@/lib/languages";
import { cn } from "@/lib/utils";

type Room = { students: number; langs: Record<string, number>; participants: { id: string; nickname: string; lang: string; muted: boolean }[] };

type Props = {
  lesson: { id: string; code: string; title: string | null; subject: string | null; status: "LIVE" | "ENDED"; startedAt: string };
  joinUrl: string;
  qrSvg: string;
};

async function post(url: string, body?: unknown, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (res.ok || res.status < 500) return res;
    } catch {
      // network blip: retry
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

export function TeacherLive({ lesson, joinUrl, qrSvg }: Props) {
  const [captions, dispatch] = useReducer((s: typeof emptyCaptions, e: CaptionEvent) => applyCaptionEvent(s, e, false), {
    ...emptyCaptions,
    ended: lesson.status === "ENDED",
  });
  const [room, setRoom] = useState<Room>({ students: 0, langs: {}, participants: [] });
  const [interim, setInterim] = useState("");
  const [sending, setSending] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const onEvent = useCallback((e: StreamEvent) => {
    if (e.type === "room") setRoom(e.data as Room);
    else if (e.type === "snapshot") {
      const data = e.data as { room?: Room };
      if (data.room) setRoom(data.room);
      dispatch(e as CaptionEvent);
    } else if (e.type === "segment") {
      const text = (e.data as { text: string }).text;
      setSending((s) => s.filter((t) => t !== text));
      dispatch(e as CaptionEvent);
    } else if (e.type !== "interim") {
      dispatch(e as CaptionEvent);
    }
  }, []);
  const streamStatus = useLessonStream(`/api/lessons/${lesson.id}/stream?role=teacher`, onEvent);

  // Interim text: at most one post every 300ms, always ending on the latest.
  const interimState = useRef({ latest: "", sent: "", timer: null as ReturnType<typeof setTimeout> | null });
  const pushInterim = useCallback(
    (text: string) => {
      const st = interimState.current;
      st.latest = text;
      if (st.timer) return;
      const flush = () => {
        st.timer = null;
        if (st.latest === st.sent) return;
        st.sent = st.latest;
        void fetch(`/api/lessons/${lesson.id}/interim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: st.sent }) });
        st.timer = setTimeout(flush, 300);
      };
      flush();
    },
    [lesson.id],
  );

  const sendSegment = useCallback(
    async (text: string, startedAt: Date) => {
      setSending((s) => [...s, text]);
      const res = await post(`/api/lessons/${lesson.id}/segments`, { text, startedAt: startedAt.toISOString() });
      if (!res?.ok) {
        setSending((s) => s.filter((t) => t !== text));
        setSendError(res?.status === 409 ? "This lesson has ended." : "Couldn't send the last sentence. Check your connection.");
      } else {
        setSendError(null);
      }
    },
    [lesson.id],
  );

  const speech = useSpeechRecognition({
    onInterim: (text) => {
      setInterim(text);
      pushInterim(text);
    },
    onFinal: (text, startedAt) => {
      setInterim("");
      pushInterim("");
      void sendSegment(text, startedAt);
    },
  });

  const [typed, setTyped] = useState("");
  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    void sendSegment(text, new Date());
  };

  // End lesson: a two-step button so it can't happen by accident.
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);
  const endLesson = async () => {
    if (!confirmEnd) return setConfirmEnd(true);
    speech.stop();
    await post(`/api/lessons/${lesson.id}/end`);
  };

  const live = !captions.ended;
  const { stop: stopMic } = speech;
  useEffect(() => {
    if (!live) stopMic();
  }, [live, stopMic]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/60 px-5 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/teach" className="font-display text-xl font-semibold">
            aula<span className="text-coral">.</span>
          </Link>
          <div className="min-w-0">
            <p className="truncate font-medium">{lesson.title || "Untitled lesson"}</p>
            <p className="text-sm text-ink-2">{lesson.subject ?? "Live lesson"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionPill status={streamStatus} ended={!live} startedAt={lesson.startedAt} />
          {live && (
            <Button variant={confirmEnd ? "default" : "outline"} onClick={endLesson} className="h-9">
              {confirmEnd ? "Click again to end" : "End lesson"}
            </Button>
          )}
        </div>
      </header>

      <main className="grid flex-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="transcript-h" className="flex min-h-[60vh] flex-col rounded-2xl border bg-card">
          <h2 id="transcript-h" className="sr-only">
            Live transcript
          </h2>
          <Transcript lines={captions.lines} sending={sending} interim={interim} ended={captions.ended} />
          {live && (
            <div className="border-t p-4">
              <MicControl
                status={speech.status}
                mode={speech.mode}
                error={speech.error}
                onStart={speech.start}
                onStop={speech.stop}
                devices={speech.devices}
                deviceId={speech.deviceId}
                onDevice={speech.setDeviceId}
                level={speech.level}
              />
              <form onSubmit={submitTyped} className="mt-3 flex gap-2">
                <label htmlFor="typed" className="sr-only">
                  Type a sentence to send to students
                </label>
                <Input
                  id="typed"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={speech.status === "unsupported" ? "Type what you're saying and press Enter" : "Or type a sentence and press Enter"}
                  maxLength={2000}
                  autoComplete="off"
                />
                <Button type="submit" variant="secondary" aria-label="Send sentence">
                  <Send aria-hidden />
                </Button>
              </form>
              {sendError && (
                <p role="alert" className="mt-2 text-sm text-coral">
                  {sendError}
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          {live ? (
            <JoinCard code={lesson.code} joinUrl={joinUrl} qrSvg={qrSvg} />
          ) : (
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-lg font-semibold">Lesson ended</h2>
              <p className="mt-1 text-sm text-ink-2">Students can no longer join. The recap and review arrive in a later update.</p>
              <Link href="/teach" className="mt-4 inline-block text-sm font-medium text-coral underline underline-offset-4">
                Back to your lessons
              </Link>
            </div>
          )}
          <RoomCard room={room} />
        </aside>
      </main>
    </div>
  );
}

function ConnectionPill({ status, ended, startedAt }: { status: string; ended: boolean; startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (ended) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [ended]);
  const elapsed = now ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  if (ended) return <span className="rounded-full bg-secondary px-3 py-1 text-sm text-ink-2">Ended</span>;
  const ok = status === "live";
  return (
    <span className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium", ok ? "bg-sage/10 text-sage" : "bg-coral-soft text-coral")}>
      <span className={cn("size-2 rounded-full", ok ? "animate-pulse-soft bg-sage" : "bg-coral")} aria-hidden />
      {ok ? "Live" : "Reconnecting"}
      {now !== null && <span className="tabular-nums">{`${mm}:${ss}`}</span>}
    </span>
  );
}

function Transcript({ lines, sending, interim, ended }: { lines: { seq: number; en: string; fix?: string }[]; sending: string[]; interim: string; ended: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, sending.length, interim]);

  const empty = lines.length === 0 && sending.length === 0 && !interim;
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="h-0 flex-1 overflow-y-auto px-6 py-5"
    >
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center text-center text-ink-2">
          <Mic className="mb-3 size-8 text-ink-3" aria-hidden />
          <p className="font-medium text-ink">{ended ? "This lesson has no transcript." : "Press Start and teach as usual."}</p>
          {!ended && <p className="mt-1 max-w-sm text-sm">Every sentence you say appears here and on your students&rsquo; phones, in their languages.</p>}
        </div>
      ) : (
        <ol className="space-y-3 text-lg leading-relaxed">
          {lines.map((l) => (
            <li key={l.seq} className="flex gap-3">
              <span className="w-7 shrink-0 pt-1 text-right text-xs text-ink-3 tabular-nums">{l.seq}</span>
              <span>
                {l.fix ?? l.en}
                {l.fix && <span className="ml-2 text-xs text-ink-3">(heard: &ldquo;{l.en}&rdquo;)</span>}
              </span>
            </li>
          ))}
          {sending.map((t, i) => (
            <li key={`s${i}`} className="flex gap-3 text-ink-2">
              <span className="w-7 shrink-0" />
              <span>{t}</span>
            </li>
          ))}
          {interim && (
            <li className="flex gap-3 text-ink-3 italic" aria-hidden>
              <span className="w-7 shrink-0" />
              <span>
                {interim}
                <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-ink-3" />
              </span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<SpeechStatus, string> = {
  unsupported: "Speech recognition needs Chrome on a laptop or desktop.",
  idle: "Microphone off",
  starting: "Starting microphone...",
  listening: "Listening",
  paused: "Paused",
  blocked: "Microphone blocked",
  "no-mic": "No microphone",
  error: "Microphone stopped",
};

type MicControlProps = {
  status: SpeechStatus;
  mode: "on-device" | "cloud" | null;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  devices: MicDevice[];
  deviceId: string;
  onDevice: (id: string) => void;
  level: number;
};

function MicControl(props: MicControlProps) {
  const { status, mode, error, devices, deviceId, level } = props;
  // "default" duplicates one of the real devices; show it as "System default".
  const choices = devices.filter((d) => d.id !== "default");
  const on = status === "listening" || status === "starting";
  if (status === "unsupported") {
    return (
      <p className="rounded-lg bg-highlight/50 px-3 py-2 text-sm">
        <strong>Use Chrome for the teacher view</strong> to caption your voice. Students can use any browser. You can type sentences below.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button onClick={on ? props.onStop : props.onStart} className={cn("h-12 rounded-full px-6 text-base", on && "bg-ink text-paper hover:bg-ink/90")}>
        {on ? <MicOff aria-hidden /> : <Mic aria-hidden />}
        {on ? "Pause" : "Start listening"}
      </Button>
      <div className="min-w-0 flex-1 text-sm" aria-live="polite">
        <p className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", status === "listening" ? "animate-pulse-soft bg-sage" : status === "starting" ? "bg-saffron" : on ? "bg-sage" : error ? "bg-coral" : "bg-ink-3")}
          />
          {STATUS_TEXT[status]}
          {status === "listening" && mode && (
            <span className="font-normal text-ink-2">· {mode === "on-device" ? "on this device" : "via Google speech service"}</span>
          )}
        </p>
        {error && <p className="mt-0.5 text-ink-2">{error}</p>}
      </div>
      {on && <LevelMeter level={level} />}
      <div className="flex w-full items-center gap-2 text-sm">
        <label htmlFor="mic-select" className="shrink-0 text-ink-2">
          Microphone
        </label>
        <select
          id="mic-select"
          value={deviceId}
          onChange={(e) => props.onDevice(e.target.value)}
          className="h-8 min-w-0 flex-1 truncate rounded-md border border-input bg-card px-2 text-sm focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none sm:max-w-xs"
        >
          <option value="">System default</option>
          {choices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Five bars that light up with the teacher's voice, so they can see Aula hears them.
function LevelMeter({ level }: { level: number }) {
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden title="Microphone level">
      {[0.08, 0.2, 0.35, 0.5, 0.7].map((threshold, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-sm transition-colors", level > threshold ? "bg-sage" : "bg-ink/15")}
          style={{ height: `${30 + i * 17}%` }}
        />
      ))}
    </div>
  );
}

function JoinCard({ code, joinUrl, qrSvg }: { code: string; joinUrl: string; qrSvg: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  return (
    <section aria-labelledby="join-h" className="rounded-2xl border bg-card p-5">
      <h2 id="join-h" className="text-sm font-medium text-ink-2">
        Students join at <span className="text-ink">{joinUrl.replace(/^https?:\/\//, "").replace(/\/join\/.*$/, "/join")}</span>
      </h2>
      <p className="mt-2 font-display text-5xl font-semibold tracking-wider tabular-nums" aria-label={`Join code ${code.split("").join(" ")}`}>
        {pretty}
      </p>
      <div className="mx-auto mt-4 aspect-square w-full max-w-[220px] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR code to join this lesson" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(joinUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Link copied" : "Copy join link"}
      </Button>
    </section>
  );
}

function RoomCard({ room }: { room: Room }) {
  const langs = useMemo(() => Object.entries(room.langs).sort((a, b) => b[1] - a[1]), [room.langs]);
  return (
    <section aria-labelledby="room-h" className="rounded-2xl border bg-card p-5">
      <h2 id="room-h" className="flex items-center gap-2 text-lg font-semibold">
        <Users className="size-5 text-ink-2" aria-hidden />
        {room.students === 1 ? "1 student" : `${room.students} students`}
      </h2>
      {langs.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">Nobody has joined yet. Share the code or QR.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {langs.map(([code, n]) => {
            const lang = getLanguage(code);
            return (
              <li key={code} className="rounded-full bg-secondary px-3 py-1 text-sm">
                <span lang={code === "en" ? "en" : code} dir={lang?.dir}>
                  {code === "en" ? "English" : lang?.native ?? code}
                </span>
                <span className="ml-1.5 font-semibold tabular-nums">{n}</span>
              </li>
            );
          })}
        </ul>
      )}
      {room.participants.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-2">Who&rsquo;s here (only you can see names)</summary>
          <ul className="mt-2 space-y-1">
            {room.participants.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate">{p.nickname}</span>
                <span className="text-ink-2">{p.lang === "en" ? "English" : getLanguage(p.lang)?.name ?? p.lang}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
