import { notFound } from "next/navigation";
import { RecapView } from "@/components/recap/recap-view";
import { isLanguageCode } from "@/lib/languages";
import { getRecapView } from "@/lib/server/recaps";

export async function generateMetadata(props: PageProps<"/r/[recapId]">) {
  const view = await getRecapView((await props.params).recapId, "en");
  return { title: view ? `What you missed: ${view.lesson.title ?? "lesson recap"}` : "Recap not found" };
}

export default async function RecapPage(props: PageProps<"/r/[recapId]">) {
  const { recapId } = await props.params;
  const q = (await props.searchParams).lang;
  const requested = typeof q === "string" ? q : undefined;
  const lang = requested && (requested === "en" || isLanguageCode(requested)) ? requested : "en";
  const view = await getRecapView(recapId, lang);
  if (!view) notFound();
  return <RecapView initial={view} explicitLang={Boolean(requested)} />;
}
