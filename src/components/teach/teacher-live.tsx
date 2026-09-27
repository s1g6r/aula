"use client";

import { Check, Copy, HelpCircle, MessageCircleQuestion, Mic, MicOff, Projector, Send, Turtle, Users, VolumeX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLessonStream, type StreamEvent } from "@/hooks/use-lesson-stream";
import { useSpeechRecognition, type MicDevice, type SpeechStatus } from "@/hooks/use-speech-recognition";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent } from "@/lib/captions";
import { getLanguage } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/dates";

export type Room = { students: number; langs: Record<string, number>; participants: { id: string; nickname: string; lang: string; muted: boolean }[] };
export type Signals = { lost: number; slower: number; anchor: { seq: number; count: number } | null; anchorText: string | null; totals: Record<number, number> };
export type Question = { id: string; nickname: string; participantId: string; lang: string; original: string; english: string | null; translating: boolean; answered: boolean; at: string };

const NO_SIGNALS: Signals = { lost: 0, slower: 0, anchor: null, anchorText: null, totals: {} };

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
  const [signals, setSignals] = useState<Signals>(NO_SIGNALS);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [recap, setRecap] = useState<{ status: string; recapId: string | null }>({ status: "NONE", recapId: null });

  const onEvent = useCallback((e: StreamEvent) => {
    if (e.type === "room") setRoom(e.data as Room);
    else if (e.type === "signal-summary") setSignals(e.data as Signals);
    else if (e.type === "recap") {
      const r = e.data as { status: string; recapId?: string };
      setRecap((prev) => ({ status: r.status, recapId: r.recapId ?? prev.recapId }));
    }
    else if (e.type === "question") {
      const q = e.data as Question;
      setQuestions((qs) => (qs.some((x) => x.id === q.id) ? qs.map((x) => (x.id === q.id ? q : x)) : [...qs, q]));
    } else if (e.type === "question-removed") {
      const { id } = e.data as { id: string };
      setQuestions((qs) => qs.filter((q) => q.id !== id));
    } else if (e.type === "snapshot") {
      const data = e.data as { room?: Room; signals?: Signals; questions?: Question[]; recap?: { status: string; recapId: string | null } };
      if (data.recap) setRecap(data.recap);
      if (data.room) setRoom(data.room);
      if (data.signals) setSignals(data.signals);
      if (data.questions) setQuestions(data.questions);
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
            <Button variant="outline" className="h-9" asChild>
              <Link href={`/teach/${lesson.id}/present`} target="_blank" rel="noreferrer">
                <Projector aria-hidden /> Projector view
              </Link>
            </Button>
          )}
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
          <Transcript lines={captions.lines} sending={sending} interim={interim} ended={captions.ended} lostTotals={signals.totals} anchorSeq={signals.anchor?.seq ?? null} />
          {live && (
            <div className="border-t p-4">
              <MicControl
                status={speech.status}
                mode={speech.mode}
                error={speech.error}
                detail={speech.detail}
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
          {live && <PulseCard signals={signals} />}
          {(live || questions.length > 0) && <QuestionsCard lessonId={lesson.id} questions={questions} />}
          {live ? (
            <JoinCard code={lesson.code} joinUrl={joinUrl} qrSvg={qrSvg} />
          ) : (
            <EndedCard lessonId={lesson.id} recap={recap} />
          )}
          <RoomCard room={room} />
        </aside>
      </main>
    </div>
  );
}

export function ConnectionPill({ status, ended, startedAt }: { status: string; ended: boolean; startedAt: string }) {
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

export function Transcript({
  lines,
  sending,
  interim,
  ended,
  lostTotals,
  anchorSeq,
}: {
  lines: { seq: number; en: string; fix?: string }[];
  sending: string[];
  interim: string;
  ended: boolean;
  lostTotals: Record<number, number>;
  anchorSeq: number | null;
}) {
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
      className="h-0 flex-1 overflow-y-auto px-6 py-5 focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none"
      tabIndex={0}
      role="region"
      aria-label="Transcript"
    >
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center text-center text-ink-2">
          <Mic className="mb-3 size-8 text-ink-3" aria-hidden />
          <p className="font-medium text-ink">{ended ? "This lesson has no transcript." : "Press Start and teach as usual."}</p>
          {!ended && <p className="mt-1 max-w-sm text-sm">Every sentence you say appears here and on your students&rsquo; phones, in their languages.</p>}
        </div>
      ) : (
        <ol className="space-y-3 text-lg leading-relaxed">
          {lines.map((l) => {
            const lost = lostTotals[l.seq] ?? 0;
            return (
              <li key={l.seq} className={cn("-mx-2 flex gap-3 rounded-lg px-2 transition-colors", l.seq === anchorSeq && "bg-coral-soft")}>
                <span className="w-7 shrink-0 pt-1 text-right text-xs text-ink-3 tabular-nums">{l.seq}</span>
                <span className="flex-1">
                  {l.fix ?? l.en}
                  {l.fix && <span className="ml-2 text-xs text-ink-3">(heard: &ldquo;{l.en}&rdquo;)</span>}
                </span>
                {lost > 0 && (
                  <span className="mt-1 h-fit shrink-0 rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-primary-foreground" title={`${lost} lost here`}>
                    {lost} lost
                  </span>
                )}
              </li>
            );
          })}
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
  unsupported: "Speech recognition needs Chrome or Safari.",
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
  detail: string | null;
  onStart: () => void;
  onStop: () => void;
  devices: MicDevice[];
  deviceId: string;
  onDevice: (id: string) => void;
  level: number;
};

function MicControl(props: MicControlProps) {
  const { status, mode, error, detail, devices, deviceId, level } = props;
  // "default" duplicates one of the real devices; show it as "System default".
  const choices = devices.filter((d) => d.id !== "default");
  const on = status === "listening" || status === "starting";
  if (status === "unsupported") {
    return (
      <p className="rounded-lg bg-highlight/50 px-3 py-2 text-sm">
        <strong>Use Chrome or Safari for the teacher view</strong> to caption your voice. Students can use any browser. You can type sentences below.
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
        {error && detail && <p className="mt-0.5 text-xs text-ink-3">Details: {detail}</p>}
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

export function RoomCard({ room }: { room: Room }) {
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

export function PulseCard({ signals }: { signals: Signals }) {
  const quiet = signals.lost === 0 && signals.slower === 0;
  const snippet = signals.anchorText && signals.anchorText.length > 90 ? `${signals.anchorText.slice(0, 87)}...` : signals.anchorText;
  return (
    <section
      aria-labelledby="pulse-h"
      aria-live="polite"
      className={cn("rounded-2xl border p-5 transition-colors", signals.lost > 0 ? "border-coral/40 bg-coral-soft" : "bg-card")}
    >
      <h2 id="pulse-h" className="flex items-center gap-2 text-lg font-semibold">
        {signals.lost > 0 && <span className="size-2.5 animate-pulse-soft rounded-full bg-coral" aria-hidden />}
        Understanding
        <span className="ml-auto text-xs font-normal text-ink-2">last minute</span>
      </h2>
      {quiet ? (
        <p className="mt-2 text-sm text-ink-2">No signals right now. Students can tap &ldquo;I&rsquo;m lost&rdquo; or &ldquo;Slower&rdquo; anytime. You&rsquo;ll see how many, never who.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {signals.lost > 0 && (
            <p className="flex gap-2">
              <HelpCircle className="mt-0.5 size-5 shrink-0 text-coral" aria-hidden />
              <span>
                <strong>{signals.lost === 1 ? "1 student" : `${signals.lost} students`} lost</strong>
                {snippet && (
                  <>
                    {" "}
                    at: <span className="italic">&ldquo;{snippet}&rdquo;</span>
                  </>
                )}
              </span>
            </p>
          )}
          {signals.slower > 0 && (
            <p className="flex gap-2">
              <Turtle className="mt-0.5 size-5 shrink-0 text-saffron" aria-hidden />
              <span>
                <strong>{signals.slower === 1 ? "1 student" : `${signals.slower} students`}</strong> asked you to slow down
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function QuestionsCard({ lessonId, questions, readOnly = false }: { lessonId: string; questions: Question[]; readOnly?: boolean }) {
  const open = questions.filter((q) => !q.answered).length;
  // Unanswered first, oldest first; answered ones sink to the bottom.
  const ordered = [...questions].sort((a, b) => Number(a.answered) - Number(b.answered) || a.at.localeCompare(b.at));
  return (
    <section aria-labelledby="questions-h" className="rounded-2xl border bg-card p-5">
      <h2 id="questions-h" className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircleQuestion className="size-5 text-ink-2" aria-hidden />
        Questions
        {open > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-primary-foreground">{open}</span>}
      </h2>
      {questions.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">Students can ask in their own language. You&rsquo;ll see it here in English.</p>
      ) : (
        <ul className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto">
          {ordered.map((q) => (
            <QuestionItem key={q.id} lessonId={lessonId} q={q} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionItem({ lessonId, q, readOnly }: { lessonId: string; q: Question; readOnly: boolean }) {
  const [confirmMute, setConfirmMute] = useState(false);
  const lang = getLanguage(q.lang);
  const time = formatTime(q.at);
  return (
    <li className={cn("rounded-xl border p-3", q.answered && "opacity-60")}>
      {q.lang === "en" ? (
        <p className="font-medium">{q.original}</p>
      ) : (
        <>
          <p className="font-medium">{q.english ?? (q.translating ? "Translating..." : q.original)}</p>
          {(q.english || !q.translating) && (
            <p lang={q.lang} dir={lang?.dir} className="mt-1 text-sm text-ink-2">
              {q.original}
            </p>
          )}
        </>
      )}
      <p className="mt-1.5 text-xs text-ink-3">
        {q.nickname} · {lang?.name ?? "English"} · {time}
      </p>
      {!readOnly && <div className="mt-2 flex flex-wrap gap-2">
        {q.answered ? (
          <span className="flex items-center gap-1 text-xs font-medium text-sage">
            <Check className="size-3.5" aria-hidden /> Answered
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void fetch(`/api/lessons/${lessonId}/questions/${q.id}/answered`, { method: "POST" })}>
            <Check aria-hidden /> Mark answered
          </Button>
        )}
        <Button
          size="sm"
          variant={confirmMute ? "default" : "ghost"}
          onClick={() => {
            if (!confirmMute) return setConfirmMute(true);
            void fetch(`/api/lessons/${lessonId}/participants/${q.participantId}/mute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ muted: true }),
            });
          }}
          onBlur={() => setConfirmMute(false)}
        >
          <VolumeX aria-hidden /> {confirmMute ? `Hide all from ${q.nickname}?` : "Mute"}
        </Button>
      </div>}
    </li>
  );
}

function EndedCard({ lessonId, recap }: { lessonId: string; recap: { status: string; recapId: string | null } }) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="ended-h" className="rounded-2xl border bg-card p-5" aria-live="polite">
      <h2 id="ended-h" className="text-lg font-semibold">
        Lesson ended
      </h2>
      {recap.status === "GENERATING" && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          <span className="size-2 animate-pulse-soft rounded-full bg-coral" aria-hidden />
          Writing the recap in every language from the room...
        </p>
      )}
      {recap.status === "FAILED" && (
        <p className="mt-2 text-sm text-ink-2">
          The recap couldn&rsquo;t be written.{" "}
          <button className="font-medium text-coral underline underline-offset-4" onClick={() => void fetch(`/api/lessons/${lessonId}/recap`, { method: "POST" })}>
            Try again
          </button>
        </p>
      )}
      {recap.status === "READY" && recap.recapId && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink-2">The recap is on every student&rsquo;s phone. Share it with anyone who was absent:</p>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/r/${recap.recapId}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Link copied" : "Copy \u201cWhat you missed\u201d link"}
          </Button>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <Button asChild>
          <Link href={`/teach/${lessonId}/review`}>Review this lesson</Link>
        </Button>
        <Link href="/teach" className="text-center text-sm font-medium text-ink-2 underline underline-offset-4">
          Back to your lessons
        </Link>
      </div>
    </section>
  );
}
