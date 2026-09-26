import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; isGuest: boolean } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    isGuest?: boolean;
  }
}
