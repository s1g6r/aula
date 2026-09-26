import Link from "next/link";
import { cn } from "@/lib/utils";

// "aula" is Spanish/Portuguese/Latin for "classroom".
export function Wordmark({ className, href = "/" }: { className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("font-display text-2xl font-semibold tracking-tight text-ink", className)}>
      aula<span className="text-coral">.</span>
    </span>
  );
  return href ? (
    <Link href={href} aria-label="Aula home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral">
      {mark}
    </Link>
  ) : (
    mark
  );
}
