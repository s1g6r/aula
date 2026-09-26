import { redirect } from "next/navigation";
import { currentTeacher } from "@/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (await currentTeacher()) redirect("/teach");
  return (
    <AuthShell title="Create your teacher account" subtitle="Free. Students never need an account.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
