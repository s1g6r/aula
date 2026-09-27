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
The brief suggested 2 calls in flight per lesson, and a "split" mode could send one call per language in parallel. Both lose. Our measurements show Featherless processes one account's parallel requests one after another: four glossary calls started together finished at 11, 24, 37 and 48 seconds. So each lesson runs one call, and sentences that arrive meanwhile are merged into the next call (up to 4). The setting stays configurable (`LESSON_CONCURRENCY`). *(Changed after tester feedback: see "Latency pass" at the end.)*

**5. Freshness over completeness.**
If translation falls more than 20 seconds behind the teacher, the oldest waiting lines are skipped. Students see those in English, and captions jump back to what the teacher is saying now. A caption that's a minute late is worse than an English one.

**Timeouts: "stalled for 8 seconds", not "took 8 seconds".**
The brief's 8-second timeout would cut off the last language of a healthy streaming reply. Instead, a call is abandoned if no new text arrives for 8 seconds, with a 30-second hard cap. Whatever already arrived is kept, and the rest falls back to English.

**One scheduler for every AI call, with priorities.**
Live captions go first, then glossaries and catch-up translations, then recaps and warm-up calls. *(Changed after tester feedback: see "Latency pass" at the end.)* It also never exceeds our plan's concurrency units, so we don't trigger 429 errors in the first place. We retry once on a 429 anyway, but only if nothing has reached students yet (otherwise the retry would duplicate lines).

**Warm the model up when a lesson starts.**
The first request to a model nobody has used recently took 7 to 14 seconds. Creating a lesson now sends a tiny request in the background, so the teacher's first sentence doesn't pay that cost.

**Catch-up for a newly joined language.**
If a student arrives reading a language nobody else is using, the last 3 lines are translated for them at low priority, so they don't start from nothing.

**Repeated sentences come from a cache.**
"Any questions?" translated once is reused, keyed by the normalized sentence, language and model (in memory, 2,000 entries).

**End-to-end tests use a mock AI server, not test code inside the app.**
`e2e/mock-ai.mjs` speaks the OpenAI streaming API and returns predictable "translations". It fails on `[fail]` and hangs on `[hang]`. The app runs unchanged against it, and the tests prove that a failure or a hang still leaves students with English, and that the next sentence recovers.

**Model routing: Qwen for speed, Gemma for lower-resource languages.** (Chosen together after the benchmark.)
Live captions use `Qwen3-30B-A3B` (2.3s to the first language). If a student reading Somali, Haitian Creole or Dari is in the room, that lesson's calls go to `gemma-4-26B-A4B`, because Qwen's Somali wasn't usable. Glossaries and recaps always use Gemma. *(Changed after tester feedback: see "Latency pass" at the end.)* The rule lives in `src/lib/pipeline/routing.ts` and reads the `beta` flag from the language list, so there's one source of truth.
Rejected: Gemma everywhere (the 4th language in a room waited about 10.6s) and Qwen everywhere (fails the students who most need it).

**One AI call in flight at a time, and captions preempt background work.**
A real two-phone lesson found this. With two calls allowed at once, a caption call went to Featherless alongside a glossary call, sat in their queue with no output, hit our 8-second stall timeout, and was dropped. Our own priority queue can't reach requests already waiting on Featherless's side. So the scheduler now allows one call in flight (`AI_MAX_INFLIGHT=1`). If a caption is waiting while a background job (glossary, catch-up, warm-up) holds the slot, the background job is cancelled and retried later, and captions never are. Glossaries now run in chunks of 3 terms, so there's little to redo. *(Changed after tester feedback: see "Latency pass" at the end.)* After the fix: Spanish 2.3s and Arabic 3.3s median in a real lesson, with no dropped lines.

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
Recap calls run at the lowest priority and are pre-empted by any live caption in any classroom. A pre-empted recap simply tries again. *(Changed after tester feedback: see "Latency pass" at the end.)*

**Normalize, don't reject, a good recap with the wrong shape.**
In testing, Gemma returned a correct four-sentence summary as a single string, and strict validation threw the whole recap away. The prompt now shows the exact shape, and the validator splits a single multi-sentence summary into sentences. A one-sentence summary is still rejected.

**A public link, private everything else.**
`/r/<id>` needs no login, so an absent student can open it from a text message. The id is an unguessable cuid2. The page shows the recap and the transcript, never nicknames, questions or signals. Those stay on the teacher's review page.

**The review page turns signals into "what to re-teach".**
A timeline shows every sentence as a tick, with a coral bar wherever students tapped "I'm lost" (one color, since it's one series; a hover label on each bar; and a table view for screen readers). Below it, "Worth re-teaching tomorrow" lists the three sentences where the most students got lost. The page also shows the questions, the recap with a copy-link button, the median translation speed, and a two-step delete.

---

## P7: Demo Replay (Sep 26)

**Record a real lesson through the real app, then replay the recording.**
`scripts/generate-replay.mts` drives the running app with Playwright, just like real people. A guest teacher starts a 9th-grade Photosynthesis lesson and types 17 sentences at speaking pace. Four students join in Spanish, Arabic, Vietnamese and Chinese. Three tap "I'm lost" at the hardest sentence, one asks "¿Para qué necesita la planta el ATP?", and the teacher ends the lesson. Then it reads back everything the pipeline produced (translations with their measured delays, definitions, the speech-recognition repair, signals, the question and the recap in four languages) and writes `src/demo/replay.json`, which is committed.
Rejected: hand-written demo data. It would be faster to make but dishonest, and it wouldn't prove the pipeline works.

**The Demo Replay page has no dependencies.**
`/demo` imports the recording at build time. No database, no AI and no login, so it works on the slowest cold start and even after the free database expires.

**One pure function drives the replay.**
`src/demo/replay-engine.ts` answers "what did each screen show at time t?". Play, pause, 2x, "jump to the lost moment", scrubbing and switching the phone's language are all the same call with a different t or language. The screens are the product's real components (captions, term card, transcript, pulse, questions, recap), not a mock-up.

**It explains itself.**
A narration line above the screens says what's happening ("Students tap 'I'm lost'. The teacher sees how many, never who, and exactly which sentence lost them."), so a judge who clicks cold understands it in under two minutes without a voiceover.

**Honest labeling.**
The page says it's a replay of a lesson processed by Aula's live pipeline, names the models, and says the delays are as measured, the teacher's sentences were typed at speaking pace, and the recap step is sped up.

**Pacing: about 2 seconds between sentences.**
Teachers of newcomers deliberately leave "wait time", and the recording uses a 2.2-second pause after each sentence.

**What the first recording attempt found (and fixed):**
- *Two caption calls per lesson were running, not one.* The `.env` template and the code default still said `LESSON_CONCURRENCY=2`, left over from the brief. The second call just waited behind the first and missed the chance to merge sentences. The default is now 1.
- *Four languages at full speaking pace outran the model.* Each call took 8 to 15 seconds for four languages while sentences came every 5 or 6 seconds, so a backlog grew and two lines fell back to English. The fix was a leaner reply: each language is now a plain string instead of an object with a list of term positions, about a third fewer tokens. Phones find the key terms in the translation themselves, using each language's glossary (the standard textbook word). A nice side effect: highlights now appear on earlier lines as soon as the glossary arrives.
- *A glossary chunk that came back malformed was never retried,* leaving Vietnamese with 6 of 9 definitions. Each chunk now gets one retry.
- *The model repaired "sell membrane" silently.* All four translations correctly said "cell membrane", but the model didn't report the corrected English, so the English line still read "sell membrane". Relying on the model to report its own repairs failed twice in testing. Aula now also checks every sentence against the teacher's multi-word key terms, with no AI involved: if every word matches except one that's off by at most two letters ("sell"/"cell", "why"/"y", "Kelvin"/"Calvin"), it restores the key term the moment the sentence arrives, and translates the repaired sentence. Single-word terms are left alone because false alarms are too likely, and plurals don't count as mistakes. The model's own repairs are still accepted under the rules above.
- *A re-recording picked up cached translations.* Recording the same lesson twice on one server served most translations from the in-memory cache in about 1ms, which would have made the replay's "measured delays" misleading. The recorder now warns and exits with an error if any translation arrived suspiciously fast, and the committed replay was recorded on a freshly started server.

---

## P8: Polish (Sep 26 to 27)

**The server keeps itself awake.**
Rather than asking the teacher (you) to sign up for an uptime service, the server pings its own public health check every 10 minutes, which Render counts as a visit. It uses `RENDER_EXTERNAL_URL`, which Render sets automatically, so it needs no configuration and does nothing locally. We considered an n8n workflow (a sponsor perk) and a GitHub Actions schedule. n8n needs an extra account, and GitHub's scheduled runs can be late and would use up the private repo's free minutes. Neither adds anything over the self-ping for this job.

**The student interface speaks the student's language.**
Every button and message on the phone ("I'm lost", "Slower, please", "Ask", the recap headings) is shown in all 12 languages (13 once Hindi was added, see below). `scripts/translate-ui.mts` translated the 58 strings once with Gemma, giving it a note on what each button is for ("I'm lost" should be calm and first-person, not alarming). It checked every key and placeholder, and the files are committed in `src/i18n/strings`. A unit test fails if any language is missing a string. We reviewed the key buttons by hand and fixed one: the Tagalog "Slower" came back as two options, one of which meant "turn the volume down". The settings sheet says the interface was translated by AI.
Rejected: English-only buttons. A newcomer may not be able to read "I'm lost".

**Arabic and Dari get a mirrored screen,** not just right-to-left text. The header, buttons and reading order flip, and English lines keep their own direction.

**Tests use the words students see.** End-to-end tests click "Me perdí" on a Spanish phone and "لم أفهم" on an Arabic phone, looked up from the same strings file, so they prove the translations are wired in.

**Accessibility is tested, not assumed.** An axe audit (WCAG 2.1 A and AA) runs over the landing page, demo, join, sign-in, the teacher and student screens, and projector mode. It found two real problems:
- older caption lines were dimmed with transparency, which dropped small text below 4.5:1 contrast (now a softer ink color);
- scrollable panels couldn't be reached by keyboard (now focusable and labeled).

Lighthouse gives accessibility 100 on every main screen.

**Faster first paint on phones.** Lighthouse on a simulated mid-range phone (slow 4G) showed the fonts slowing the first paint: the full body font in four alphabets and a variable heading font were preloaded. Now only the Latin body font and the single heading weight are preloaded. Landing performance went from 76 to 82 (largest paint 6.0s to 4.1s), and the teacher screen from 85 to 95.

**Projector mode shows English only.** Huge high-contrast captions for the room, the join code and QR in the corner, and one key for full screen. It's the shared screen for everyone, including deaf and hard-of-hearing students. Each student reads their own language on their phone.

**"My words" stays on the phone.** Saved words live in the browser's local storage, never on our server, so there's no account and nothing to delete.

**Students can flag a wrong translation.** A small flag under each translated line. The teacher's review lists the flagged lines. For the beta languages especially, admitting the AI can be wrong is part of the design.

---

## P9: Verified in production (Sep 27)

Everything below was run against the live site, https://aulaapp.xyz, after deploying.

**End-to-end tests (Playwright), 9 of 9 passed:** live captions from teacher to phone, the 10-second Wi-Fi drop with nothing lost, the Arabic right-to-left layout, "I'm lost" and "Slower" counts anchored to the right sentence, a Spanish question reaching the teacher in English and being marked answered, the profanity filter and mute, the Demo Replay story, the accessibility audit of every screen, and two real-AI lessons.

**Real translation speed in production** (teacher's screen to phone, four sentences, median):

| Room | Model | 1st language | 2nd language |
|---|---|---|---|
| Spanish + Arabic | Qwen3 30B | 1.8s | 2.3s |
| Spanish + Somali | Gemma 4 (routed) | 2.8s | 4.8s |

**Lighthouse, simulated mid-range phone (slow 4G, 4x slower CPU):**

| Screen | Performance | Accessibility | Best practices | SEO | Largest paint |
|---|---|---|---|---|---|
| Landing | 91 | 100 | 100 | 100 | 2.3s |
| Demo Replay | 99 | 100 | 96, now fixed | 100 | 1.7s |
| Join | 100 | 100 | 100 | 100 | 1.4s |
| Student phone | 99 | 100 | 100 | 100 | 1.7s |
| Teacher screen | 100 | 100 | 100 | 100 | 1.4s |

**The one issue found: a date that depended on the time zone.** The demo's "recorded on" date was formatted in each machine's own time zone. Render's server runs on UTC and the recording finished just after midnight UTC, so the server printed September 27 while browsers in the US printed September 26. React reported a hydration mismatch, which cost the demo 4 best-practice points. All dates are now formatted in one fixed time zone (US Eastern). A test covers it, and a local run with the server on UTC and a browser in Los Angeles shows no console errors.

---

## Latency pass (Sep 27)

**What prompted it.** People testing Aula said translation took far too long (about a minute while the teacher talked) and the recap took about 2 minutes to reach their language, long enough for a student to get lost or click away.

**What we measured first.** Before changing anything we wrote `scripts/latency-check.mts`, which runs a realistic lesson through the real app and the real AI: a teacher talking non-stop at about 160 words a minute for 90 seconds (the way speech recognition returns it, with no punctuation), students joined in several languages, then the recap. It times every caption from the moment the teacher said the words. It reproduced the complaint, and a few direct tests against Featherless explained it:
- **Featherless runs one request at a time for our whole account,** at about 33 tokens a second, whatever the model. Four requests sent together finished at 5, 12, 18 and 24 seconds. Smaller models were no faster (27 to 35 tokens a second). Every lesson, language, definition and recap shares that one pipe.
- **It has slow spells.** A request that normally takes 6 seconds once took 25.
- **Cancelling a request frees the pipe at once,** so preempting background work was never the problem.

**What made captions slow.**
- *Speech recognition only finishes a sentence when the teacher pauses.* Talking non-stop produced 30 to 40 word "sentences", translated only after their last word, 15 to 20 seconds after their first.
- *One Somali, Haitian Creole or Dari reader moved the whole lesson to the slower model,* so Spanish waited for Gemma too.
- *A backlog merged four long sentences into one call,* which could hit the 15-second cap and fall back to English.

**What made recaps slow.**
- *The term definitions for each language ran on the slow model at a higher priority than the recap,* so the recap waited behind them. In the 5-language test the English recap alone took 108 seconds.
- *The English recap was written by the slower model,* then translated one language at a time, each in full, before the next language started.

**Decisions.**
1. **Non-stop speech is sent in pieces.** Once about 12 words have settled in the recognizer's interim text, they're sent as their own line, breaking before a joining word ("and", "because", "which") when there is one. When the recognizer's final result arrives, only the words not yet sent go out, even if it revised a word in between (`src/lib/chunking.ts`, tested with real Chrome speech in `e2e/speech-long.spec.ts`).
2. **Each model has its own queue.** Languages on the stronger model get a separate call, and the queues take turns, oldest line first. The slow queue merges what piled up, so it makes fewer calls.
3. **Merged calls are sized by the expected reply** (about 360 tokens, roughly 11 seconds), not by line count, and the time cap grows with the size of the call.
4. **We stop reading as soon as the reply's JSON is complete, or when it turns into whitespace.** In JSON mode the models sometimes keep writing spaces and tabs, after the JSON or in the middle of it, until they hit their token limit. That was costing up to 10 seconds per call, and in the middle of a reply it left the last languages undelivered.
5. **Whatever didn't arrive gets one more try.** If a call stalls (the provider sometimes doesn't answer for 8 seconds) or trails off before every language, the missing languages are asked for again, as long as the line is under 10 seconds old. Languages that already arrived aren't sent twice.
6. **Recaps come right after live captions,** ahead of definitions. Definitions for a lesson that has ended come last of all.
7. **The English recap is written by the fast model.** On the demo transcript both models wrote a good recap; Qwen took about 10 seconds and Gemma about 15.
8. **Every language gets its summary first.** The recap is translated in two parts: the summary for every language (a few seconds each, most-read language first), then key terms and questions. The "What you missed" page shows the summary the moment it's ready and fills in the rest.
9. **Definitions use the fast model, one term per call** (about 2 seconds), with a second pass for any term the model left out. The slower model is still used for Somali, Haitian Creole and Dari. A definition that is less than a second from done may finish before the next caption starts; otherwise captions always go first. We tried a flat 1-second grace period, but it slowed captions from 3.6 to 4.9 seconds.

**A bug found along the way.** When a caption interrupted a recap call, the recap was sometimes dropped instead of retried. The code recognized an interruption with `instanceof`, but Next.js can load the same file once per route, so an interruption raised by one copy wasn't recognized by another. It now checks the error's name. The same bug could have silently dropped definitions.

**Results** (same test, fresh server each time):

| 3 students (Spanish, Chinese, Arabic) | Before | After |
|---|---|---|
| Caption on the phone, from the moment the teacher starts saying it (median) | 13 to 15s | 6.5 to 7.3s |
| Caption, from the moment the teacher finishes saying it (median) | 2.8 to 5.2s | 3.1 to 4.0s |
| English recap after "End lesson" | 25s | 11s |
| Recap summary in each student's language | 39 to 64s (whole recap at once) | 16 to 24s |
| Whole recap in each language | 39 to 64s | 35 to 54s |
| All 8 definitions ready, while the teacher talked non-stop | 97 to 109s | 61 to 83s |

| 5 students, one reading Somali | Before | After |
|---|---|---|
| Caption, from the moment the teacher starts saying it (median) | 15 to 24s | 15 to 18s |
| Lines left in English | 0 of 40 | 0 of 115 |
| English recap after "End lesson" | 108s | 16s |
| Recap summary in each language | 124 to 163s; Somali not within 3 minutes | 21 to 44s |
| Whole recap in each language | 124s and up | 55 to 113s |

**The real-AI test lessons** (`e2e/real-ai.spec.ts`, four sentences 5 seconds apart, three runs on fresh servers, median per run): Spanish 1.3 to 1.8s and Arabic 2.3 to 2.8s; in the room with a Somali reader, Somali 2.8 to 3.3s (it was 4.8s in production before, and Spanish there no longer waits for the slower model).

**The honest limit.** Five languages including Somali, with a teacher who never pauses, is more work than one Featherless account can do: each line arrives about 13 seconds after the teacher finishes it. Real lessons have pauses, and most rooms have fewer languages. A faster provider would remove the limit (the AI client is OpenAI-compatible, so it's a configuration change), but that is a choice for after the hackathon.

---

## Hindi (Sep 27)

**Hindi is the 13th student language.** It wasn't in the original list, which came from the brief, and there was no technical reason to leave it out. Hindi speakers are a large group, so we added it.

**It is translated by the stronger model, but without a "beta" badge.** On five classroom sentences, Qwen needed 335 tokens for Hindi against 99 for Spanish, because its tokenizer splits Devanagari into many small pieces. Gemma needed 107. Even at half the speed per token, Gemma finished the Hindi in 6 seconds against Qwen's 11, and its grammar was correct where Qwen made mistakes. Quality is good, so there is no beta badge: a new `strongModel` flag on the language sends it to Gemma. In a real test lesson, Hindi captions, definitions (standard textbook terms such as केंद्रक for nucleus) and the recap all came out right.

**The cost:** Hindi readers get their own call, like Somali, so a room with Hindi uses more of the shared AI pipe. With Spanish, Arabic and Hindi and a teacher talking non-stop, lines arrived 5.5 to 7.6 seconds after the teacher finished them (all 23 lines translated), against about 3.5 seconds for Spanish, Chinese and Arabic.

**Interface and fonts.** The 58 interface strings were translated into Hindi with the same script as the other languages (everyday words students use, like "टीचर" and "क्लास"). Noto Sans Devanagari loads only on pages that show Hindi.

---

## Chrome microphone (Sep 27)

**The report:** in Chrome the microphone sometimes works once and then says it isn't responding until Chrome is fully quit. Safari always works.

**What we tested:** real Chrome with the laptop's real microphone, through seven flows: first start, pause and resume, reload while listening, a new lesson in the same tab, a new lesson after ending one, a new tab after closing a listening tab, and two tabs listening at once. The microphone opened in under 0.2 seconds every time. So Aula doesn't leave Chrome stuck; the stuck state is Chrome's own audio service, which on macOS can hang after Bluetooth headphones switch into headset mode. Quitting Chrome restarts that service, which is why it helps.

**What changed anyway:**
- The level meter no longer opens the speakers. In Chrome an AudioContext plays to the output device by default even when it only analyses the microphone. With AirPods as the output, that's one more Bluetooth switch that can go wrong. Aula now asks for no output (`sinkId: { type: "none" }`) where the browser supports it.
- When the microphone fails, a small "Details" line says which step failed, for example "Chrome 153, system default: the mic didn't open within 8s; tried the browser's default mic instead; then speech recognition error audio-capture". A teacher can pass that on instead of a screenshot of a spinner.

---

## Security headers and blocked networks (Sep 27)

**What happened:** a friend testing on a university network saw aulaapp.xyz blocked as "dangerous". Google Safe Browsing has no warning on file for the site. The domain was registered on Sep 26, and network filters commonly block domains younger than about 30 days (and often `.xyz` addresses in general). It's a reputation problem, not a vulnerability.

**What we did:**
- **Security headers on every response** (`next.config.ts`): a content security policy that only allows Aula's own scripts, styles, fonts and connections and forbids framing; HSTS; `nosniff`; `X-Frame-Options: DENY`; a referrer policy; a permissions policy that allows only the microphone, and only for Aula itself; and no `X-Powered-By`. Aula loads nothing from other sites (next/font serves the fonts, the QR code is an inline SVG), so the policy can be strict. `e2e/security.spec.ts` checks the headers and that no screen has a blocked resource.
- **`/.well-known/security.txt`** says where to report a security problem.
- **A backup address and recategorization steps** are in `docs/DEPLOY.md`. The Render address (`aula-u9nw.onrender.com`) is the same app on an established domain, and join links follow whichever address the teacher used.

**A phone problem found in the same test:** the teacher screen on an iPhone showed "Microphone blocked, click the icon in the address bar". The new details line showed the real error, `service-not-allowed`. In Safari that means speech recognition itself is switched off (it relies on Dictation, and Safari needs Speech Recognition permission), not the microphone. That error now has its own message with the exact Settings path for iPhone, iPad or Mac. The status line also names the right company for each browser: Apple for Safari, Google for Chrome, Microsoft for Edge. It used to say "Google" everywhere.
