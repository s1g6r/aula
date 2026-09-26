# Decision log

A running record of the choices behind Aula, why we made them, and what we turned down. Newest phase at the bottom.

---

## Planning (Sep 26)

**Keep the landing page and the demo working without the database or the AI.**
Judges will click our link cold. The free Render database is deleted 30 days after it's created, and any AI provider can be slow or down. The Demo Replay is a static file generated once by the real pipeline, so the most important page can't break during judging.
Rejected: loading the replay from the database (it breaks if the DB is asleep or expired).

**Host everything on Render's free tier, plus a keep-awake ping.**
Render's free web service sleeps after 15 idle minutes, and waking it takes about a minute. A free uptime monitor hits `/api/health` every 5 minutes so a judge never sees that. One service running all month (about 744 hours) fits inside Render's 750 free hours.
Rejected: a paid instance ($7/mo), which we'd reconsider if the ping turns out to be unreliable. We also rejected accepting cold starts, since a one-minute wait on the first click would undercut the demo.

**Show the student UI in the student's own language, not only the captions.**
A true newcomer can't read "I'm lost" in English. About 25 short interface strings are translated once, reviewed, committed as files and marked as machine-translated.

**Add a Participant table to the schema.**
The brief's model list had no row for "a student in this lesson". We need one to know which languages are in the room, to mute a student, to rate-limit signals, and to show nicknames only to the teacher. It holds a random id, nickname, language and muted flag. It has no email and no account.

**Make "Try it live" skip signup.**
One click creates a guest teacher session and a lesson with a QR code. Guest lessons delete themselves after 24 hours. A judge who has to make an account first often won't bother.

---

## P0: Scaffold and model benchmark (Sep 26)

**Next.js 16.3 (App Router) running as a long-lived Node server.**
Server-Sent Events need a process that stays up and holds connections open. Serverless hosts cut those connections off. Next 16 uses Turbopack by default and requires async `params`, `cookies()` and `headers()`, and we write code that way from the start.

**Prisma 7.10.0, pinned exactly.**
npm's `latest` tag currently points at a Prisma 8 release candidate, and we don't want pre-release software under a deadline. Prisma 7 talks to Postgres through a "driver adapter" (`@prisma/adapter-pg` + `pg`) and no longer loads `.env` files itself, so `prisma.config.ts` reads `.env.local` with Node's built-in `process.loadEnvFile`. That saved adding `dotenv`.
Known issue: `npm audit` reports 4 advisories inside the Prisma CLI's own dependencies (`mysql2`, `deepmerge-ts`). The CLI is dev-only, we don't use MySQL, and none of that code ships in the running app. The suggested "fix" is downgrading to Prisma 6, which we rejected.

**Postgres from Homebrew, not Docker.**
Docker isn't installed on the dev machine, and Docker Desktop is a large admin install. `postgresql@17` from Homebrew is the same database Render runs.

**Auth.js v5 (beta) for teacher login.**
v5 is the version designed for the App Router (a single `auth()` helper) and it lists Next 16 as supported. v4 is stable but built around the older Pages Router. If v5 causes trouble, we fall back to v4.24.

**bcryptjs instead of native bcrypt.**
It's the same algorithm in pure JavaScript, so there's nothing native to compile on Render's build machines.

**shadcn/ui on the Radix base, with RTL enabled.**
Radix handles keyboard and screen-reader behavior for dialogs, sheets and menus. RTL mode makes components use logical CSS properties, which Arabic and Dari need. shadcn now ships its own `cn` helper package in place of `clsx` + `tailwind-merge`, so we use that.

**npm install scripts need explicit approval (npm 11).**
We approved exactly four: `prisma`, `@prisma/engines` (downloads the migration engine), `esbuild` (used by `tsx`) and `unrs-resolver` (used by ESLint). They're pinned by version in `package.json` under `allowScripts`.

**One AI call returns every language, wrapped in a `segments` array.**
The brief's per-segment shape (`{ "es": { text, terms } }`) sits inside `{ "segments": [{ seq, tr: {...} }] }`. When the queue merges a backlog of sentences into one call, each translation still maps back to its own caption line by `seq`.
Rejected: merging sentences into one block of text. The translated lines would no longer line up with the English lines.

**Terms carry three fields: `en`, `tr` and `gloss`.**
`tr` is the term as it appears in the translated line, and that's what lets us highlight "fotosíntesis" inside the Spanish sentence. `gloss` is left out once a term has been defined earlier in the lesson, so we reuse the cached definition and keep replies short, which also makes them faster.

**The model can repair speech-recognition mistakes, visibly.**
If Chrome hears "sell membrane", the prompt lets the model return a corrected English line in `fix` ("cell membrane"). We show the correction instead of silently changing the teacher's words.

**The prompt names language variants.**
We say "Latin American Spanish", "Brazilian Portuguese" and "Dari (Afghan Persian, not Iranian Farsi)" instead of bare codes, because those are the variants most US newcomer students actually speak.

**The benchmark uses the production prompt and schema.**
`scripts/bench-models.ts` imports the same `buildTranslationMessages` and zod schema the live pipeline will use, so the numbers describe what we ship. It measures latency (p50/p95), JSON validity, term recall, whether each term can be highlighted, and whether the ASR mistakes get repaired. To judge meaning in languages we don't read, a larger model translates each output back into English (a round-trip check).

---

## P1: Database schema (Sep 26)

**Everything hangs off Lesson, with cascading deletes.**
Deleting a lesson (by the teacher, or by the 30-day auto-delete) removes every transcript line, translation, glossary entry, signal, question, flag and recap in one database operation. A test proves it, so "the teacher can delete everything" is a checked fact, not just a promise.

**Students are anonymous Participants with a secret token.**
When a student joins, their browser gets a random token and the database stores only its SHA-256 hash. That's enough to recognize "the same student" for rate limits, mute and flags, without accounts or emails. Nicknames are shown only to the teacher and never sent to the AI.

**Public recap links use unguessable ids.**
`/r/<id>` is shareable without a login, so recap ids are cuid2 values (24 random-looking characters), not counting numbers someone could step through.

**Signals store the caption line (`seq`) the student was on.**
That's what lets the teacher's screen say "3 students lost at: '...the Calvin cycle uses ATP...'" and lets the review timeline mark the exact moment. `seq` can be empty if a student taps before the teacher has said anything.

**Glossary cache as a table (`Term`), translation cache in memory.**
A term's definition must stay the same every time it appears in a lesson, and it has to survive a server restart mid-lesson, so it lives in the database. Whole-sentence translations depend on context, so the cache for them (P3) is a small in-memory store for repeated phrases like "any questions?".
Rejected: a database table for sentence translations. Hits would be rare because the same sentence in different context can translate differently.

**Recap progress lives on the lesson (`recapStatus`).**
NONE, then GENERATING, then READY or FAILED. Every screen can show the right state ("building your recap...", "recap ready", "couldn't build the recap, try again") without guessing.

**Tests use their own database.**
DB tests run against `aula_test`, never the dev database. The test setup refuses any URL without "test" in the database name, and applies migrations before the tests run.
