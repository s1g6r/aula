"use client";

import { useActionState, useEffect, useState } from "react";
import { joinLessonAction, type JoinState } from "@/app/actions/join";
import { Button } from "@/components/ui/button";
import { LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";

const OPTIONS = [{ code: "en", native: "English", name: "English (captions only)", dir: "ltr" as const, beta: false }, ...LANGUAGES];
const PREFS_KEY = "aula:student";

export function JoinForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinLessonAction, undefined);
  const [nickname, setNickname] = useState("");
  const [lang, setLang] = useState("");

  // Remember the last nickname and language on this phone (never sent anywhere else).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { nickname?: string; lang?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring saved prefs after hydration
      if (saved.nickname) setNickname(saved.nickname);
      if (saved.lang) setLang(saved.lang);
    } catch {
      // ignore
    }
  }, []);

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify({ nickname: nickname.trim(), lang }));
        } catch {
          // storage may be disabled
        }
      }}
      className="space-y-6"
    >
      <input type="hidden" name="code" value={code} />
      <div className="space-y-1.5">
        <label htmlFor="nickname" className="block text-sm font-medium">
          Your name or a nickname
        </label>
        <input
          id="nickname"
          name="nickname"
          required
          maxLength={24}
          autoComplete="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="h-12 w-full rounded-xl border border-input bg-card px-4 text-lg focus-visible:border-coral focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none"
        />
        <p className="text-sm text-ink-2">Only your teacher sees this.</p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Your language</legend>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.code}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-xl border bg-card px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-coral/40",
                lang === o.code ? "border-coral bg-coral-soft" : "hover:bg-secondary/70",
              )}
            >
              <input type="radio" name="lang" value={o.code} checked={lang === o.code} onChange={() => setLang(o.code)} className="sr-only" required />
              <span lang={o.code} dir={o.dir} className="text-lg leading-snug font-medium">
                {o.native}
              </span>
              <span className="text-xs text-ink-2">
                {o.name}
                {o.beta && <span className="ml-1.5 rounded bg-secondary px-1 py-px text-[10px] font-semibold tracking-wide uppercase">beta</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-coral-soft px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || !lang || !nickname.trim()} className="h-12 w-full text-base">
        {pending ? "Joining..." : "Join lesson"}
      </Button>
      <p className="text-center text-xs text-ink-2">No account, no email. Nothing you do here is shown to classmates.</p>
    </form>
  );
}
