import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/server/http";

// Teacher sign-in. Sessions are signed JWT cookies (no session table).
// Two ways in:
//   - "credentials": email + password, checked against a bcrypt hash;
//   - "guest": the "Try it live" button. Creates a throwaway teacher so a
//     judge can start a real lesson without making an account. Guest lessons
//     auto-delete after 24 hours.

const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });
const guestLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true, // Render terminates TLS in front of us
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        if (!loginLimiter.check(`login:${clientIp(request)}`).ok) return null;
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const teacher = await db.teacher.findUnique({ where: { email: parsed.data.email } });
        if (!teacher?.passwordHash || !(await compare(parsed.data.password, teacher.passwordHash))) return null;
        return { id: teacher.id, name: teacher.name, email: teacher.email, isGuest: false };
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize(_raw, request) {
        if (!guestLimiter.check(`guest:${clientIp(request)}`).ok) return null;
        const suffix = crypto.randomUUID().slice(0, 8);
        const teacher = await db.teacher.create({
          data: { email: `guest-${suffix}@guest.aulaapp.xyz`, name: "Guest teacher", isGuest: true },
        });
        return { id: teacher.id, name: teacher.name, email: teacher.email, isGuest: true };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.isGuest = Boolean((user as { isGuest?: boolean }).isGuest);
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.isGuest = Boolean(token.isGuest);
      return session;
    },
  },
});

// The signed-in teacher, or null.
export async function currentTeacher(): Promise<{ id: string; name: string; isGuest: boolean } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, name: session.user.name ?? "Teacher", isGuest: Boolean(session.user.isGuest) };
}
