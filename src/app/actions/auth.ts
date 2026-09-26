"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/teach",
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: "That email and password don't match. Try again." };
    throw err; // redirects are thrown too
  }
}

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("That doesn't look like an email address").max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, email, password } = parsed.data;
  if (await db.teacher.findUnique({ where: { email } })) return { error: "There's already an account with that email. Sign in instead." };
  await db.teacher.create({ data: { name, email, passwordHash: await hash(password, 12) } });
  try {
    await signIn("credentials", { email, password, redirectTo: "/teach" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Account created, but signing in failed. Try signing in." };
    throw err;
  }
}

// "Try it live": a throwaway guest teacher, straight into a new lesson.
export async function guestAction(): Promise<FormState> {
  try {
    await signIn("guest", { redirectTo: "/teach?guest=1" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Too many guest lessons from this network. Try again in a little while." };
    throw err;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
