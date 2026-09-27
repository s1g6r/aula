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
- **I decided / changed:** chose Featherless, and picked the model setup from the benchmark: route by language (Qwen3 30B for speed, Gemma 4 for Somali, Haitian Creole and Dari, glossaries and recaps). _(add anything else you changed)_

### P4: Signals and questions (Sep 26)
- **Claude Code generated:** the signal summary (unique students per minute, anchored to a sentence), the student buttons and ask sheet, the teacher's pulse and questions panels, question translation, the profanity filter, mute, and end-to-end tests.
- **I decided / changed:** _(fill in)_

### P5: Deploy (Sep 26)
- **Claude Code generated:** `render.yaml`, the production start script, the hourly privacy clean-up, and `docs/DEPLOY.md`. I created the Render account and services, pasted the API key, and set up DNS and the uptime monitor myself.
- **I decided / changed:** _(fill in)_

### P6: Recap and review (Sep 26)
- **Claude Code generated:** the recap prompt and pipeline, the "What you missed" page, the review page with the confusion timeline, and the tests. It found, from a real run, that Gemma sometimes returns the summary as one string, and fixed the validation to handle it.
- **I decided / changed:** _(fill in)_

---

## 2. AI features inside Aula

| Feature | What the model does | Model | Guardrails |
|---|---|---|---|
| Live translation | Translates each finished sentence into every language present in the room, marks where each key term appears in the translation, and repairs obvious speech-recognition mistakes | Qwen3-30B-A3B-Instruct, or Gemma 4 26B when Somali, Haitian Creole or Dari is in the room (Featherless.ai) | Output must pass a strict schema or the student sees the English line instead. Only lesson text is sent, never names. The model is told to translate only and never add content |
| Glossary | Once per language per lesson, writes a one-sentence definition of each key term in the student's language (or simple English) | Gemma 4 26B | Only terms the teacher listed are kept. Runs at low priority so it never slows captions |
| Speech-recognition repair | Inside the translation call, fixes obvious mishearings ("sell membrane" to "cell membrane") | same | The correction is shown next to what Chrome heard, never silently |
| Student questions | Translates a student's question into English for the teacher | same routing as live translation | Told to translate only and never answer. The teacher answers. Profanity is checked on the original and the English. Only the teacher sees questions |
| Recap | When the lesson ends, writes a summary, key terms with definitions, and 3 check-yourself questions, then translates them for every student's language (and any other language on request) | Gemma 4 26B writes; Qwen3 30B or Gemma translate | Built only from the transcript. Told never to add facts or homework answers. Validated before saving. Labeled "Written by AI from what the teacher said" on the page |
| Student questions | _(P4)_ | | |
