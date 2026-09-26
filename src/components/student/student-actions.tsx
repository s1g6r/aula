"use client";

import { Check, HelpCircle, MessageCircleQuestion, Turtle } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StudentStrings } from "@/i18n/student";
import { cn } from "@/lib/utils";

export type MyQuestion = { id: string; text: string; answered: boolean };

// The student's three buttons, at the bottom of the screen where a thumb
// reaches: "I'm lost", "Slower, please", and "Ask". Taps are anonymous to
// classmates; the teacher only sees counts.
export function StudentActions({
  lessonId,
  latestSeq,
  t,
  questions,
  onAsked,
}: {
  lessonId: string;
  latestSeq: number | null;
  t: StudentStrings;
  questions: MyQuestion[];
  onAsked: (q: MyQuestion) => void;
}) {
  const [cooldown, setCooldown] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);

  // Tick once a second while a cooldown is running.
  const active = Object.values(cooldown).some((until) => until > now);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const signal = async (type: "lost" | "slower") => {
    setNow(Date.now());
    try {
      const res = await fetch(`/api/lessons/${lessonId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, seq: latestSeq }),
      });
      const body = (await res.json().catch(() => ({}))) as { cooldownMs?: number; retryAfterMs?: number };
      if (res.ok) {
        setNotice(type === "lost" ? t.sentLost : t.sentSlower);
        setCooldown((c) => ({ ...c, [type]: Date.now() + (body.cooldownMs ?? 20_000) }));
      } else if (res.status === 429) {
        setNotice(t.tryAgainSoon);
        setCooldown((c) => ({ ...c, [type]: Date.now() + (body.retryAfterMs ?? 5000) }));
      } else {
        setNotice(t.sendFailed);
      }
    } catch {
      setNotice(t.sendFailed);
    }
  };

  const remaining = (type: string) => Math.max(0, Math.ceil(((cooldown[type] ?? 0) - now) / 1000));

  return (
    <div className="border-t bg-card/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <p role="status" aria-live="polite" className={cn("mx-auto mb-2 max-w-2xl text-center text-sm text-ink-2", !notice && "sr-only")}>
        {notice}
      </p>
      <div className="mx-auto flex max-w-2xl gap-2">
        <ActionButton
          onClick={() => signal("lost")}
          waiting={remaining("lost")}
          t={t}
          className="flex-[1.3] bg-coral text-primary-foreground hover:bg-coral/90"
          icon={<HelpCircle className="size-5" aria-hidden />}
          label={t.lost}
        />
        <ActionButton
          onClick={() => signal("slower")}
          waiting={remaining("slower")}
          t={t}
          className="flex-1 border bg-card text-ink hover:bg-secondary"
          icon={<Turtle className="size-5" aria-hidden />}
          label={t.slower}
        />
        <button
          onClick={() => setAsking(true)}
          className="flex h-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border bg-card px-4 text-xs font-medium focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none"
        >
          <MessageCircleQuestion className="size-5" aria-hidden />
          {t.ask}
        </button>
      </div>
      <AskSheet open={asking} onOpenChange={setAsking} lessonId={lessonId} t={t} questions={questions} onAsked={onAsked} />
    </div>
  );
}

function ActionButton({ onClick, waiting, t, className, icon, label }: { onClick: () => void; waiting: number; t: StudentStrings; className: string; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={waiting > 0}
      className={cn(
        "flex h-14 items-center justify-center gap-2 rounded-2xl px-3 text-base font-semibold transition-opacity focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none disabled:opacity-55",
        className,
      )}
    >
      {icon}
      <span>{waiting > 0 ? t.waitSeconds.replace("{s}", String(waiting)) : label}</span>
    </button>
  );
}

function AskSheet({
  open,
  onOpenChange,
  lessonId,
  t,
  questions,
  onAsked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lessonId: string;
  t: StudentStrings;
  questions: MyQuestion[];
  onAsked: (q: MyQuestion) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        onAsked({ id, text: value, answered: false });
        setText("");
      } else {
        setError(res.status === 429 ? t.tryAgainSoon : t.sendFailed);
      }
    } catch {
      setError(t.sendFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t.askTitle}</SheetTitle>
          <SheetDescription>{t.askHelp}</SheetDescription>
        </SheetHeader>
        <form onSubmit={send} className="space-y-3 px-4">
          <label htmlFor="question" className="sr-only">
            {t.askTitle}
          </label>
          <textarea
            id="question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder={t.askPlaceholder}
            dir="auto"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-lg focus-visible:border-coral focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none"
          />
          {error && (
            <p role="alert" className="text-sm text-coral">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="h-12 w-full rounded-xl bg-coral text-base font-semibold text-primary-foreground disabled:opacity-55"
          >
            {pending ? t.sending : t.send}
          </button>
        </form>
        {questions.length > 0 && (
          <div className="px-4 pt-2 pb-8">
            <h3 className="mb-2 text-sm font-medium text-ink-2">{t.yourQuestions}</h3>
            <ul className="space-y-2">
              {[...questions].reverse().map((q) => (
                <li key={q.id} className="rounded-xl bg-secondary px-3 py-2">
                  <p dir="auto">{q.text}</p>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs", q.answered ? "text-sage" : "text-ink-2")}>
                    <Check className="size-3.5" aria-hidden />
                    {q.answered ? t.questionAnswered : t.questionSent}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
