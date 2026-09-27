import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentTeacher } from "@/auth";
import { Projector } from "@/components/teach/projector";
import { getLesson } from "@/lib/server/lessons";
import { joinUrl } from "@/lib/server/urls";

export const metadata = { title: "Projector" };

export default async function PresentPage(props: PageProps<"/teach/[id]/present">) {
  const { id } = await props.params;
  const teacher = await currentTeacher();
  if (!teacher) redirect("/login");
  const lesson = await getLesson(id);
  if (!lesson || lesson.teacherId !== teacher.id) notFound();
  const url = await joinUrl(lesson.code);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0d0f14ff", light: "#ffffffff" } });
  return <Projector lesson={{ id: lesson.id, code: lesson.code, title: lesson.title, status: lesson.status }} qrSvg={qrSvg} joinHost={url.replace(/^https?:\/\//, "").replace(/\/join\/.*$/, "/join")} />;
}
