"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      {mode === "signup" && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name (what students see)</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Ms. Rivera" required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-coral-soft px-3 py-2 text-sm text-ink">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "One moment..." : mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-ink-2">
        {mode === "login" ? (
          <>
            New to Aula?{" "}
            <Link className="font-medium text-coral underline underline-offset-4" href="/signup">
              Create a teacher account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link className="font-medium text-coral underline underline-offset-4" href="/login">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
