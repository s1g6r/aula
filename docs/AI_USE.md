# How AI was used

The hackathon allows AI and asks us to disclose it. This log is kept phase by phase and becomes our Devpost disclosure. It covers two different things:

1. **AI used to build Aula.** I worked with Claude Code (Anthropic's coding assistant) as a pair programmer.
2. **AI inside Aula.** These are the features that call a language model while the app runs.

---

## 1. Building Aula with Claude Code

### Planning (Sep 26)
- **I decided:** the product idea, the problem, the feature list and its priority order, the tech stack, and the phase plan (all written in my project brief before any code). During planning I also chose: Homebrew Postgres over Docker, Render's free tier plus a keep-awake ping over a paid instance, 6 review checkpoints instead of 11, and translating the student interface (not just the captions).
- **Claude Code did:** read the hackathon rules and sponsor pages, checked Featherless's plans and model list and Render's free-tier limits, found sources for the Microsoft Translator retirement, asked me clarifying questions, and proposed the phase schedule and the extra design decisions listed in `DECISIONS.md` (the Participant table, a static Demo Replay, and "Try it live" without signup). I approved them.

### P0: Scaffold and benchmark (Sep 26)
- **Claude Code generated:** the project scaffold and tooling config (`npm run check`, Vitest, Playwright, env template), the language list, the translation prompt, the zod schemas that validate AI output, the JSON extraction helper, the benchmark script with its 20 test sentences, and the unit tests.
- **I decided / changed:** _(fill in: e.g. which benchmark sentences to keep, which model we picked and why)_

### P1: Database schema (Sep 26)
- **Claude Code generated:** the Prisma schema (11 tables), the first migration, the seed script, and a test that deleting a lesson deletes all of its data.
- **I decided / changed:** _(fill in)_

### P2: Live English captions (Sep 26)
- **Claude Code generated:** teacher sign-in and guest sessions, the event bus and SSE stream, the teacher live view (speech capture, typed fallback, QR), the student join flow and caption view, and the end-to-end tests. When the first Wi-Fi-drop test passed without actually disconnecting, it noticed from the server log and fixed both the test and the app.
- **I decided / changed:** _(fill in)_

### P3: Translation pipeline (Sep 26)
- **Claude Code generated:** the translation pipeline (scheduler, per-lesson queue, streaming parser, cache, glossary), term highlighting and tap-to-define, the mock AI server for tests, and reran the benchmark after each prompt change.
- **I decided / changed:** chose Featherless, and _(fill in: which model and why)_

---

## 2. AI features inside Aula

| Feature | What the model does | Model | Guardrails |
|---|---|---|---|
| Live translation | Translates each finished sentence into every language present in the room, marks key academic terms, writes short definitions, and repairs obvious speech-recognition mistakes | _chosen after the benchmark_ (Featherless.ai) | Output must pass a strict schema or the student sees the English line instead. Only lesson text is sent, never names. The model is told to translate only and never add content |
| Glossary | Once per language per lesson, writes a one-sentence definition of each key term in the student's language (or simple English) | same as live translation | Only terms the teacher listed are kept. Runs at low priority so it never slows captions |
| Speech-recognition repair | Inside the translation call, fixes obvious mishearings ("sell membrane" to "cell membrane") | same | The correction is shown next to what Chrome heard, never silently |
| Recap | _(P6)_ | | |
| Student questions | _(P4)_ | | |
