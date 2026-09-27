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

---

## P2: Live English captions (Sep 26)

**The server numbers the sentences, not the teacher's browser.**
Each finished sentence gets the next `seq` from the server. If the teacher reloads the page mid-lesson, numbering just continues, and two sentences can never share a number.
Rejected: letting the browser number sentences, as the brief sketched. A reload would restart at 1.

**Connect in a fixed order: subscribe, catch up, then go live.**
A phone connecting to the stream is subscribed first, then gets either a replay of what it missed or a full snapshot from the database, and only then the events that arrived meanwhile. Nothing published during the catch-up can slip through the gap.

**Event ids include a server "epoch".**
Ids look like `k3f9-57`. If the server restarts, the epoch changes, so a phone reconnecting with an old id gets a fresh snapshot instead of a wrong replay.

**Interim words are never stored or replayed.**
The half-finished sentence the teacher is saying right now is sent live and then forgotten. Only finished sentences are saved.

**A dropped student's language stays "in the room" for 60 seconds.**
If a phone's Wi-Fi blinks, their language keeps being translated, so when it reconnects the replay already includes those translations.

**Phones detect dead connections themselves.**
We found this with a test. The first version of the 10-second Wi-Fi-drop test passed, but the server log showed it never actually disconnected: Chrome's offline mode doesn't cut an open stream, and a real Wi-Fi drop often doesn't either. It just goes silent. Now the server sends a `ping` event every 15 seconds (a real event, because browsers hide SSE comments from JavaScript), the phone reconnects if it hears nothing for 40 seconds, and it closes and reopens immediately when the phone reports going offline and online. The test now proves no lines arrive while offline and all of them arrive, in order, afterwards.

**Students are identified by an httpOnly cookie per lesson.**
The token never appears in a URL (where it could end up in logs), and page scripts can't read it. `localStorage` only remembers the nickname and language on that phone for next time.

**Speech runs on the laptop when Chrome allows it.**
If Chrome 139+ reports on-device English recognition is available, audio never leaves the laptop. Otherwise Chrome uses Google's speech service, and the teacher's screen says which. If the mic keeps stopping (more than 6 restarts in 10 seconds), we stop retrying and point to the type-instead box.

**"English (captions only)" is a student language option.**
It's for deaf or hard-of-hearing students, and for English learners who want to read the English. They still get key-term highlights and simple-English definitions.

**No `server-only` imports.**
Our scripts (benchmark, replay generator) import the same modules outside Next.js, and that package crashes them.

---

## P3: Translation pipeline (Sep 26)

The benchmark changed this design in five ways. Each one is backed by measurements in `MODEL_BENCHMARK.md`.

**1. Stream the reply and deliver each language the moment it's complete.**
A single reply for 4 languages took about 15 seconds with our first prompt, because the model writes one language after another. Now we read the reply as it streams, and a small parser (`scanTranslationStream`) spots when a language's part is finished, validates it, and sends it to those students. The first language arrives in about 2 seconds.

**2. Definitions left the live path.**
Asking for a definition with every term doubled the reply size. Now each language gets a glossary once, when its first student joins, generated in the background and stored. Live replies only carry the translation and where each term appears. That roughly halved the tokens, and so the waiting.

**3. We decide which terms to highlight, not the model.**
Given the whole key-term list, the model "found" terms that weren't in the sentence, like chlorophyll in a sentence that never mentions it. Now we match the teacher's terms in the English ourselves and tell the model exactly which ones to mark. Then we keep a term only if its translation really appears in the translated line.

**4. One call at a time per lesson, plus merging.**
The brief suggested 2 calls in flight per lesson, and a "split" mode could send one call per language in parallel. Both lose. Our measurements show Featherless processes one account's parallel requests one after another: four glossary calls started together finished at 11, 24, 37 and 48 seconds. So each lesson runs one call, and sentences that arrive meanwhile are merged into the next call (up to 4). The setting stays configurable (`LESSON_CONCURRENCY`).

**5. Freshness over completeness.**
If translation falls more than 20 seconds behind the teacher, the oldest waiting lines are skipped. Students see those in English, and captions jump back to what the teacher is saying now. A caption that's a minute late is worse than an English one.

**Timeouts: "stalled for 8 seconds", not "took 8 seconds".**
The brief's 8-second timeout would cut off the last language of a healthy streaming reply. Instead, a call is abandoned if no new text arrives for 8 seconds, with a 30-second hard cap. Whatever already arrived is kept, and the rest falls back to English.

**One scheduler for every AI call, with priorities.**
Live captions go first, then glossaries and catch-up translations, then recaps and warm-up calls. It also never exceeds our plan's concurrency units, so we don't trigger 429 errors in the first place. We retry once on a 429 anyway, but only if nothing has reached students yet (otherwise the retry would duplicate lines).

**Warm the model up when a lesson starts.**
The first request to a model nobody has used recently took 7 to 14 seconds. Creating a lesson now sends a tiny request in the background, so the teacher's first sentence doesn't pay that cost.

**Catch-up for a newly joined language.**
If a student arrives reading a language nobody else is using, the last 3 lines are translated for them at low priority, so they don't start from nothing.

**Repeated sentences come from a cache.**
"Any questions?" translated once is reused, keyed by the normalized sentence, language and model (in memory, 2,000 entries).

**End-to-end tests use a mock AI server, not test code inside the app.**
`e2e/mock-ai.mjs` speaks the OpenAI streaming API and returns predictable "translations". It fails on `[fail]` and hangs on `[hang]`. The app runs unchanged against it, and the tests prove that a failure or a hang still leaves students with English, and that the next sentence recovers.

**Model routing: Qwen for speed, Gemma for lower-resource languages.** (Chosen together after the benchmark.)
Live captions use `Qwen3-30B-A3B` (2.3s to the first language). If a student reading Somali, Haitian Creole or Dari is in the room, that lesson's calls go to `gemma-4-26B-A4B`, because Qwen's Somali wasn't usable. Glossaries and recaps always use Gemma. The rule lives in `src/lib/pipeline/routing.ts` and reads the `beta` flag from the language list, so there's one source of truth.
Rejected: Gemma everywhere (the 4th language in a room waited about 10.6s) and Qwen everywhere (fails the students who most need it).

**One AI call in flight at a time, and captions preempt background work.**
A real two-phone lesson found this. With two calls allowed at once, a caption call went to Featherless alongside a glossary call, sat in their queue with no output, hit our 8-second stall timeout, and was dropped. Our own priority queue can't reach requests already waiting on Featherless's side. So the scheduler now allows one call in flight (`AI_MAX_INFLIGHT=1`). If a caption is waiting while a background job (glossary, catch-up, warm-up) holds the slot, the background job is cancelled and retried later, and captions never are. Glossaries now run in chunks of 3 terms, so there's little to redo. After the fix: Spanish 2.3s and Arabic 3.3s median in a real lesson, with no dropped lines.

**The teacher picks the microphone, and Aula checks it first.** (Found in the first real mic test.)
On a MacBook whose default input was Bluetooth AirPods, Chrome's speech engine reported "no microphone" (`audio-capture`) even though macOS allowed Chrome to use the mic. Now Aula opens the mic itself before listening. That gives precise messages: blocked, not found, or "that mic isn't sending sound", which is typical of AirPods connected to a phone. The teacher view also has a microphone picker (remembered per browser) and a small level meter, so a teacher can see Aula hears them before any words appear. The chosen mic's audio is passed straight to Chrome's recognizer, which Chrome 135+ supports. If on-device recognition fails, Aula quietly switches to Google's speech service. A new opt-in test plays a synthesized voice into real Chrome as the microphone and checks the words become a caption, which they did in about 3 seconds.

---

## P4: Signals and questions (Sep 26)

**"I'm lost" counts students, not taps, over the last minute.**
The teacher sees how many different students tapped in the last 60 seconds, and the sentence most of them were on ("2 students lost at: '...the Calvin cycle uses that ATP...'"). The pulse fades by itself: the server pushes an update when the oldest tap ages out. Lines where students got lost get a small "2 lost" marker in the transcript for the whole lesson, which the review timeline (P6) will build on.

**One tap of each kind per 20 seconds.**
The brief says one signal per 20 seconds per student. We apply that separately to "I'm lost" and "Slower", so a student who needs both isn't blocked. The button shows a countdown instead of silently doing nothing.

**Questions: the AI only translates.**
The prompt forbids answering, and the teacher answers out loud and taps "Mark answered", which shows up on that student's phone only. Questions use the same model routing as captions and run at caption priority, since a question is time-sensitive.

**Moderation is light and honest about it.**
A small whole-word filter (English, Spanish, Portuguese, French) hides obvious profanity. It checks the translated English too, so it covers other languages. A teacher can also mute a student, which hides that student's questions (past and future) but never their captions or their "I'm lost" button. Hidden questions are kept in the database for the teacher's review, not shown live.

**Events addressed to one student.**
The event bus gained a "this participant only" audience, used for "your teacher answered". Nothing about one student's questions ever reaches another student's phone.

---

## P5: Deploy (Sep 26)

**A Render Blueprint (`render.yaml`) defines everything.**
One free web service and one free Postgres, with `DATABASE_URL` wired automatically. Render generates `AUTH_SECRET`, and `AI_API_KEY` is the only value typed by hand. The whole setup is reproducible, and no secret lives in the repo.

**Migrations run in the start command.**
`npm run start:prod` runs `prisma migrate deploy` and then `next start`. That works on every Render plan; pre-deploy commands may not be available on free instances.

**Privacy clean-up runs inside the server.**
`src/instrumentation.ts` starts an hourly job when the server boots. It deletes expired lessons (30 days, or 24 hours for guests) with everything under them, removes empty guest accounts, and ends lessons left "live" for more than 12 hours. No separate cron service, no cost. The deletion logic doesn't depend on in-memory caches (they're passed in), so it's tested directly against the test database.

**Virginia region.**
US East, since most judges are likely in the US. The database must be in the same region as the web service for the free internal connection.

**What production taught us (first deploy, Sep 26).**
Testing against the live Render site (behind Cloudflare) confirmed that live captions stream fine through their network, and that the Wi-Fi-drop replay works there. It also found three things local testing hadn't:
- **One slow reply can hold up every classroom.** A Featherless reply once took over 30 seconds. Because only one AI call runs at a time, that delays captions everywhere. Live caption calls are now capped at 15 seconds, and students see English after that.
- **We couldn't see why a line was slow.** Render's logs aren't available to our tests, so each AI call now records its wait, time to first words, total time and outcome. A teacher-only endpoint (`/api/lessons/:id/stats`) reports them, and it doubles as our latency measurement.
- **The model "corrected" a sentence that wasn't wrong.** It rewrote "Plants take in carbon dioxide" as "Plants absorb carbon dioxide", and the app showed that as a repair of the teacher's words. Repairs are now accepted only if they restore one of the teacher's key terms ("sell membrane" to "cell membrane") and change at most 3 words, and the prompt now says to never rephrase.

Measured in production, with a teacher and two phones, 4 sentences, real AI: Spanish 2.3s and Arabic 3.3s median (Qwen). In a room with a Somali reader (Gemma): Spanish 4.8s and Somali 8.3s median.

---

## P6: Recap, "What you missed" and review (Sep 26)

**The recap is written only from the transcript.**
When the teacher ends the lesson, Gemma writes 3 to 5 summary sentences, up to 8 key terms with definitions based on how the teacher explained them, and exactly 3 check-yourself questions with answers. The prompt forbids adding facts, topics or homework answers that weren't in the lesson. The recap is validated like every AI output: if it's malformed twice, the lesson shows "couldn't write the recap" with a "Try again" button, never a half-broken page.

**Translated for every language that was in the room, and on demand for everyone else.**
After the English recap, it's translated into each language students used during the lesson (Qwen, or Gemma for the beta languages). Anyone opening the "What you missed" link in another language gets it translated then and there, and the page checks back every 3 seconds until it's ready. Opening new languages is rate-limited, since each one costs an AI call. Key terms keep their English form next to the translation, so the recap still teaches the English words.

**Recaps are background work that yields to live captions.**
Recap calls run at the lowest priority and are pre-empted by any live caption in any classroom. A pre-empted recap simply tries again.

**Normalize, don't reject, a good recap with the wrong shape.**
In testing, Gemma returned a correct four-sentence summary as a single string, and strict validation threw the whole recap away. The prompt now shows the exact shape, and the validator splits a single multi-sentence summary into sentences. A one-sentence summary is still rejected.

**A public link, private everything else.**
`/r/<id>` needs no login, so an absent student can open it from a text message. The id is an unguessable cuid2. The page shows the recap and the transcript, never nicknames, questions or signals. Those stay on the teacher's review page.

**The review page turns signals into "what to re-teach".**
A timeline shows every sentence as a tick, with a coral bar wherever students tapped "I'm lost" (one color, since it's one series; a hover label on each bar; and a table view for screen readers). Below it, "Worth re-teaching tomorrow" lists the three sentences where the most students got lost. The page also shows the questions, the recap with a copy-link button, the median translation speed, and a two-step delete.
