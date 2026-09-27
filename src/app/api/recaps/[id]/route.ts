import type { NextRequest } from "next/server";
import { isLanguageCode } from "@/lib/languages";
import { ensureRecapTranslation, recapDraft, recapTranslationPending } from "@/lib/pipeline";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, jsonError } from "@/lib/server/http";
import { getRecapView } from "@/lib/server/recaps";

// GET /api/recaps/:id?lang=vi
// Public: the "What you missed" page. If the recap isn't in that language
// yet, translating it starts now and `translating` is true; the page checks
// back every few seconds. The summary is translated first and comes back as
// `draft` while the rest is still on the way.

const newLanguageLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });

export async function GET(request: NextRequest, ctx: RouteContext<"/api/recaps/[id]">) {
  const { id } = await ctx.params;
  const requested = request.nextUrl.searchParams.get("lang") ?? "en";
  const lang = requested === "en" || isLanguageCode(requested) ? requested : "en";
  const view = await getRecapView(id, lang);
  if (!view) return jsonError(404, "Recap not found");

  let translating = false;
  if (lang !== "en" && !view.translated) {
    translating = recapTranslationPending(id, lang);
    if (!translating && newLanguageLimiter.check(clientIp(request)).ok) {
      void ensureRecapTranslation(id, lang);
      translating = true;
    }
  }
  const draft = translating ? recapDraft(id, lang) : null;
  return Response.json({ ...view, translating, draft }, { headers: { "Cache-Control": "no-store" } });
}
