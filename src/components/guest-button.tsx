"use client";

import { useActionState } from "react";
import { guestAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GuestButton({ className, children = "Try it live" }: { className?: string; children?: React.ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(guestAction, undefined);
  return (
    <form action={action} className="contents">
      <Button type="submit" disabled={pending} className={cn("h-12 px-6 text-base", className)}>
        {pending ? "Setting up..." : children}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-coral">
          {state.error}
        </p>
      )}
    </form>
  );
}
