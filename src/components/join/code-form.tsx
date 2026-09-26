"use client";

import { useActionState } from "react";
import { goToCodeAction, type JoinState } from "@/app/actions/join";
import { Button } from "@/components/ui/button";

export function CodeForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(goToCodeAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <label htmlFor="code" className="block text-sm font-medium">
        Lesson code
      </label>
      <input
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        placeholder="K7M 2QX"
        aria-describedby={state?.error ? "code-error" : undefined}
        className="h-16 w-full rounded-xl border border-input bg-card text-center font-display text-3xl font-semibold tracking-[0.2em] uppercase placeholder:text-ink-3/60 focus-visible:border-coral focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none"
      />
      {state?.error && (
        <p id="code-error" role="alert" className="text-sm text-coral">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? "Finding lesson..." : "Next"}
      </Button>
    </form>
  );
}
