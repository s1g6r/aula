import { redirect } from "next/navigation";
import { currentTeacher } from "@/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentTeacher()) redirect("/teach");
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to start a lesson.">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
