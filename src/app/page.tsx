import { BookOpen, Captions, HelpCircle, Languages, MessageCircleQuestion, Projector, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { GuestButton } from "@/components/guest-button";
import { Wordmark } from "@/components/wordmark";
import { LANGUAGES } from "@/lib/languages";

// "Classroom" in the languages Aula speaks: the motif behind the hero.
const CLASSROOM = [
  { word: "aula", lang: "es" },
  { word: "الفصل", lang: "ar" },
  { word: "教室", lang: "zh-Hans" },
  { word: "lớp học", lang: "vi" },
  { word: "sala de aula", lang: "pt" },
  { word: "klas", lang: "ht" },
  { word: "клас", lang: "uk" },
  { word: "класс", lang: "ru" },
  { word: "صنف", lang: "fa-AF" },
  { word: "fasalka", lang: "so" },
  { word: "silid-aralan", lang: "fil" },
  { word: "salle de classe", lang: "fr" },
];

const SOURCES = {
  ells: "https://nces.ed.gov/programs/coe/indicator/cgf/english-learners",
  msft: "https://www.whistleout.com/CellPhones/Guides/is-microsoft-translator-worth-downloading",
  absent: "https://www.rand.org/pubs/research_reports/RRA956-34.html",
};

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-5 text-sm font-medium text-ink-2">
          <a href="#how" className="hidden hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#privacy" className="hidden hover:text-ink sm:inline">
            Privacy
          </a>
          <Link href="/join" className="hover:text-ink">
            Join a class
          </Link>
          <Link href="/login" className="hover:text-ink">
            Teacher sign in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          {/* Kept to the right-hand side so it never sits behind text. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-1/2 select-none lg:block">
            {CLASSROOM.map((c, i) => (
              <span
                key={c.lang}
                lang={c.lang}
                className="absolute font-display font-semibold whitespace-nowrap text-ink/[0.05]"
                style={{ fontSize: `${1.6 + (i % 4) * 0.55}rem`, left: `${(i * 29) % 70}%`, top: `${(i * 23) % 92}%` }}
              >
                {c.word}
              </span>
            ))}
          </div>

          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-sm font-medium text-ink-2 shadow-[0_1px_0_rgba(27,30,43,0.05)]">
              <span className="size-2 rounded-full bg-coral" aria-hidden />
              Free live captions for classrooms
            </p>
            <h1 className="text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl">
              Every lesson, understood.
              <span className="block text-coral">In any language.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              The teacher just talks. Each student follows on their own phone, in their own language, learns the key English words, and can quietly say
              &ldquo;I&rsquo;m lost&rdquo;. When class ends, everyone gets a recap, even the students who were absent.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="inline-flex h-12 items-center gap-2 rounded-lg bg-coral px-6 text-base font-semibold text-primary-foreground hover:bg-coral/90">
                <Sparkles className="size-5" aria-hidden /> Watch a live demo
              </Link>
              <GuestButton className="bg-ink text-paper hover:bg-ink/90" />
            </div>
            <p className="mt-4 text-sm text-ink-2">Two minutes, no sign-up. The demo replays a real lesson in Spanish, Arabic, Vietnamese and Chinese.</p>
          </div>

          <HeroVisual />
        </section>

        {/* The problem */}
        <section aria-labelledby="why" className="border-y bg-card/70">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 id="why" className="max-w-2xl text-3xl font-semibold">
              A newcomer in 9th-grade Biology understands a fraction of what the teacher says.
            </h2>
            <dl className="mt-10 grid gap-8 sm:grid-cols-3">
              <Stat value="5.3 million" source={SOURCES.ells} sourceLabel="NCES">
                US public school students are English learners, about 1 in 10. Many classrooms have several home languages at once.
              </Stat>
              <Stat value="June 30, 2026" source={SOURCES.msft} sourceLabel="WhistleOut">
                Microsoft retired Translator&rsquo;s free multi-device conversations, the tool many teachers used to caption lessons for these students.
              </Stat>
              <Stat value="About 1 in 5" source={SOURCES.absent} sourceLabel="RAND">
                students is chronically absent. &ldquo;What did I miss?&rdquo; usually gets a shrug, and missing a lesson is hardest when you&rsquo;re new to English.
              </Stat>
            </dl>
            <p className="mt-10 max-w-2xl text-ink-2">
              And translation alone isn&rsquo;t enough. Students who are lost rarely raise a hand in a language they&rsquo;re still learning, and a translation can become a
              crutch unless it teaches the English words too.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-h" className="mx-auto w-full max-w-6xl px-5 py-20">
          <h2 id="how-h" className="text-3xl font-semibold">
            How it works
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            <Step n={1} title="The teacher starts a lesson and talks">
              No install. Open Aula in Chrome or Safari, add the lesson&rsquo;s key terms, and teach as usual. Aula listens and turns speech into captions.
            </Step>
            <Step n={2} title="Students scan the QR and pick a language">
              No accounts. Each phone shows every sentence in English right away and in the student&rsquo;s language about 2 seconds later, with key words highlighted.
            </Step>
            <Step n={3} title="Lost? One tap. Then a recap for everyone">
              &ldquo;I&rsquo;m lost&rdquo; is anonymous: the teacher sees how many, and exactly where. When class ends, every student gets a recap in their language.
            </Step>
          </ol>
        </section>

        {/* Features */}
        <section aria-labelledby="features-h" className="bg-ink text-paper">
          <div className="mx-auto w-full max-w-6xl px-5 py-20">
            <h2 id="features-h" className="text-3xl font-semibold">
              Built for the students who need it most
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature icon={<Captions aria-hidden />} title="Live captions, 13 languages">
                Each sentence is translated for every language in the room, and each language appears the moment it&rsquo;s ready.
              </Feature>
              <Feature icon={<BookOpen aria-hidden />} title="Key words that teach English">
                The teacher&rsquo;s terms are highlighted. Tap one for a simple definition in your language and hear it in English. It&rsquo;s saved to My words.
              </Feature>
              <Feature icon={<HelpCircle aria-hidden />} title="“I’m lost” without raising a hand">
                The teacher sees &ldquo;3 students lost at: &lsquo;the Calvin cycle uses ATP&rsquo;&rdquo;, never who, and can re-explain right then.
              </Feature>
              <Feature icon={<MessageCircleQuestion aria-hidden />} title="Questions in any language">
                A student types in Spanish or Somali, the teacher reads it in English. The AI only translates. The teacher answers.
              </Feature>
              <Feature icon={<Languages aria-hidden />} title="A recap nobody misses">
                A summary, key words and three check-yourself questions, written from what was actually said, in every student&rsquo;s language. Absent students get a link.
              </Feature>
              <Feature icon={<Projector aria-hidden />} title="Projector mode">
                Huge high-contrast captions for the classroom screen, which also help deaf and hard-of-hearing students.
              </Feature>
            </ul>
          </div>
        </section>

        {/* Languages */}
        <section aria-labelledby="langs-h" className="mx-auto w-full max-w-6xl px-5 py-20">
          <h2 id="langs-h" className="text-3xl font-semibold">
            Twelve languages at launch
          </h2>
          <p className="mt-3 max-w-2xl text-ink-2">
            Chosen from the most common home languages of US newcomer students. Languages with less AI training data are marked beta and use a stronger model, and
            students can flag any line that looks wrong. Being honest about quality is part of the product.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <li key={l.code} className="rounded-full border bg-card px-4 py-2">
                <span lang={l.code} dir={l.dir} className="font-medium">
                  {l.native}
                </span>
                <span className="ml-2 text-sm text-ink-2">{l.name}</span>
                {l.beta && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">beta</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* Privacy */}
        <section id="privacy" aria-labelledby="privacy-h" className="border-t bg-card/70">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <ShieldCheck className="size-9 text-sage" aria-hidden />
              <h2 id="privacy-h" className="mt-3 text-3xl font-semibold">
                Privacy, in plain words
              </h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                ["No audio is stored.", "Only text reaches Aula. (Speech recognition runs in the teacher's browser; Chrome may use Google's speech service, and Safari uses Apple's.)"],
                ["Students have no accounts.", "No email, no real name required. Nicknames are shown only to the teacher."],
                ["Names never go to the AI.", "Only the lesson's words, subject and key terms are translated."],
                ["The teacher can delete everything.", "One click removes a lesson's transcript, translations, questions and recap. Everything deletes itself after 30 days."],
              ].map(([title, body]) => (
                <li key={title} className="rounded-2xl border bg-background p-5">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 text-center">
          <h2 className="text-4xl font-semibold">See a lesson in four languages</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">A real Biology lesson, processed by Aula and replayed with the delays we measured. Switch the phone&rsquo;s language anytime.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="inline-flex h-12 items-center gap-2 rounded-lg bg-coral px-6 text-base font-semibold text-primary-foreground hover:bg-coral/90">
              <Sparkles className="size-5" aria-hidden /> Watch a live demo
            </Link>
            <GuestButton className="bg-ink text-paper hover:bg-ink/90" />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-2">
          <div className="flex items-center gap-3">
            <Wordmark className="text-xl" href={null} />
            <span>Made for the CSC Back-to-School Hackathon, 2026.</span>
          </div>
          <p>
            AI by open models on{" "}
            <a className="underline underline-offset-4 hover:text-ink" href="https://featherless.ai">
              Featherless.ai
            </a>{" "}
            · hosted on{" "}
            <a className="underline underline-offset-4 hover:text-ink" href="https://render.com">
              Render
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, source, sourceLabel, children }: { value: string; source: string; sourceLabel: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-4xl font-semibold text-coral">{value}</dt>
      <dd className="mt-2 leading-relaxed text-ink-2">
        {children}{" "}
        <a href={source} className="text-sm whitespace-nowrap underline underline-offset-4 hover:text-ink">
          Source: {sourceLabel}
        </a>
      </dd>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border bg-card p-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-coral-soft font-display text-lg font-semibold text-coral">{n}</span>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 [&_svg]:size-6 [&_svg]:text-[#f08a70]">
      {icon}
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 leading-relaxed text-paper/75">{children}</p>
    </li>
  );
}

// A still of the product: a student's phone in Spanish and the teacher's
// "Understanding" card. Real text from the Demo Replay recording.
function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto mb-20 w-full max-w-md lg:max-w-none">
      <div className="relative mx-auto w-[300px] rounded-[2.4rem] border-[9px] border-ink bg-background p-4 pt-8 shadow-[0_30px_60px_-25px_rgba(27,30,43,0.5)]">
        <div className="absolute top-1.5 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <p className="text-sm font-semibold">Photosynthesis</p>
            <p className="flex items-center gap-1.5 text-xs text-sage">
              <span className="size-1.5 rounded-full bg-sage" /> En vivo
            </p>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">Español</span>
        </div>
        <div className="space-y-4 py-4">
          <div>
            <p className="text-lg leading-snug font-medium text-ink/80" lang="es">
              Los cloroplastos son verdes porque están llenos de <mark className="rounded-sm bg-highlight px-0.5 text-highlight-ink">clorofila</mark>.
            </p>
            <p className="mt-1 text-xs text-ink-2">Chloroplasts are green because they&apos;re full of chlorophyll.</p>
          </div>
          <div>
            <p className="text-lg leading-snug font-medium" lang="es">
              Luego, el <mark className="rounded-sm bg-highlight px-0.5 text-highlight-ink">ciclo de Calvin</mark> usa ese <mark className="rounded-sm bg-highlight px-0.5 text-highlight-ink">ATP</mark> para convertir el
              dióxido de carbono en <mark className="rounded-sm bg-highlight px-0.5 text-highlight-ink">glucosa</mark>.
            </p>
            <p className="mt-1 text-xs text-ink-2">Then the Calvin cycle uses that ATP to turn carbon dioxide into glucose.</p>
          </div>
        </div>
        <div className="flex gap-2 border-t pt-3">
          <span className="flex h-11 flex-[1.3] items-center justify-center gap-1.5 rounded-2xl bg-coral text-sm font-semibold text-primary-foreground ring-4 ring-coral/25">
            <HelpCircle className="size-4" /> Me perdí
          </span>
          <span className="flex h-11 flex-1 items-center justify-center rounded-2xl border text-xs font-semibold">Más lento, por favor</span>
        </div>
      </div>
      <div className="absolute -bottom-24 -left-2 w-64 rounded-2xl border border-coral/40 bg-coral-soft p-4 shadow-[0_20px_40px_-20px_rgba(27,30,43,0.35)] sm:-left-6 lg:-left-10">
        <p className="flex items-center gap-2 font-display text-base font-semibold">
          <span className="size-2 rounded-full bg-coral" /> Understanding
        </p>
        <p className="mt-2 text-sm">
          <strong>3 students lost</strong> at: <em>&ldquo;Then the Calvin cycle uses that ATP...&rdquo;</em>
        </p>
      </div>
    </div>
  );
}
