# How AI was used

The hackathon allows AI and asks us to disclose it. This log is kept phase by phase and becomes our Devpost disclosure. It covers two different things:

1. **AI used to build Aula.** We worked with Claude Code (Anthropic's coding assistant) as a pair programmer.
2. **AI inside Aula.** These are the features that call a language model while the app runs.

---

## 1. Building Aula with Claude Code

### Planning (Sep 26)
- **We decided:** the product idea, the problem, the feature list and its priority order, the tech stack, and the phase plan (all written in our project brief before any code). During planning we also chose: Homebrew Postgres over Docker, Render's free tier plus a keep-awake ping over a paid instance, 6 review checkpoints instead of 11, and translating the student interface (not just the captions).
- **Claude Code did:** read the hackathon rules and sponsor pages, checked Featherless's plans and model list and Render's free-tier limits, found sources for the Microsoft Translator retirement, asked us clarifying questions, and proposed the phase schedule and the extra design decisions listed in `DECISIONS.md` (the Participant table, a static Demo Replay, and "Try it live" without signup). We approved them.

### P0: Scaffold and benchmark (Sep 26)
- **Claude Code generated:** the project scaffold and tooling config (`npm run check`, Vitest, Playwright, env template), the language list, the translation prompt, the zod schemas that validate AI output, the JSON extraction helper, the benchmark script with its 20 test sentences, and the unit tests.
- **We decided / changed:** _(fill in: e.g. which benchmark sentences to keep, which model we picked and why)_

### P1: Database schema (Sep 26)
- **Claude Code generated:** the Prisma schema (11 tables), the first migration, the seed script, and a test that deleting a lesson deletes all of its data.
- **We decided / changed:** _(fill in)_

### P2: Live English captions (Sep 26)
- **Claude Code generated:** teacher sign-in and guest sessions, the event bus and SSE stream, the teacher live view (speech capture, typed fallback, QR), the student join flow and caption view, and the end-to-end tests. When the first Wi-Fi-drop test passed without actually disconnecting, it noticed from the server log and fixed both the test and the app.
- **We decided / changed:** _(fill in)_

### P3: Translation pipeline (Sep 26)
- **Claude Code generated:** the translation pipeline (scheduler, per-lesson queue, streaming parser, cache, glossary), term highlighting and tap-to-define, the mock AI server for tests, and reran the benchmark after each prompt change.
- **We decided / changed:** chose Featherless, and picked the model setup from the benchmark: route by language (Qwen3 30B for speed, Gemma 4 for Somali, Haitian Creole and Dari, glossaries and recaps). _(add anything else you changed)_

### P4: Signals and questions (Sep 26)
- **Claude Code generated:** the signal summary (unique students per minute, anchored to a sentence), the student buttons and ask sheet, the teacher's pulse and questions panels, question translation, the profanity filter, mute, and end-to-end tests.
- **We decided / changed:** _(fill in)_

### P5: Deploy (Sep 26)
- **Claude Code generated:** `render.yaml`, the production start script, the hourly privacy clean-up, and `docs/DEPLOY.md`. We created the Render account and services, pasted the API key, and set up DNS and the uptime monitor ourselves.
- **We decided / changed:** _(fill in)_

### P6: Recap and review (Sep 26)
- **Claude Code generated:** the recap prompt and pipeline, the "What you missed" page, the review page with the confusion timeline, and the tests. It found, from a real run, that Gemma sometimes returns the summary as one string, and fixed the validation to handle it.
- **We decided / changed:** _(fill in)_

### P7: Demo Replay (Sep 26)
- **Claude Code generated:** the scripted lesson, the recording script, the replay engine and player, and the narration. It also found, from the first recording, that four languages at speaking pace outran the model, and it redesigned the reply format to fix that.
- **We decided / changed:** _(fill in)_

### P8: Polish (Sep 26 to 27)
- **Claude Code generated:** the landing page, projector mode, text size and dark mode, My words, the translation flag, the 12-language student interface (translated once by Gemma, then spot-checked), the mirrored Arabic/Dari layout, icons and share image, the accessibility fixes found by the axe audit, and the font change that sped up first paint.
- **We decided / changed:** _(fill in)_

### P9: Verified in production (Sep 27)
- **Claude Code did:** ran the end-to-end tests and Lighthouse against the live site, and found and fixed a time-zone bug that made the server and browsers print different dates.
- **We decided / changed:** _(fill in)_

### Latency pass (Sep 27)
- **What prompted it:** people testing Aula told us translations took about a minute and the recap about 2 minutes, long enough for a student to get lost or leave.
- **Claude Code did:** wrote a script that times a realistic lesson end to end, measured how Featherless handles our requests (one at a time for the whole account, about 33 tokens a second), found the causes, and changed the pipeline: long speech is sent in pieces, slower-model languages get their own queue, recaps go before definitions and are translated summary-first, replies are cut off once their JSON is complete, and a language that doesn't arrive gets one retry. It also found and fixed a bug that could drop a recap. Before and after numbers are in `DECISIONS.md`.
- **We decided / changed:** _(fill in)_

### Hindi, the microphone and security (Sep 27)
- **What prompted it:** we asked for Hindi, a large group the original list left out; testers had trouble with the microphone in Chrome and on an iPhone; and a friend's university network blocked the site as "dangerous".
- **Claude Code did:** measured Hindi on both models and routed it to the one that used a third of the tokens; translated the interface into Hindi; tried to reproduce the Chrome microphone problem in seven scenarios with a real microphone (it couldn't), made the level meter stop using the speakers, and added a details line to microphone errors; used that line to find the iPhone problem (speech recognition switched off, not the microphone) and wrote the right message for it; checked that Google has no warning on the site, explained the new-domain block, and added security headers and a backup address. While capturing screenshots it found the fast model leaving English words inside some translations (including in the Demo Replay) and fixed it by giving the model the glossary's word for each key term.
- **We decided / changed:** _(fill in)_

### P10: Documentation and submission drafts (Sep 27)
- **Claude Code generated:** the README, ARCHITECTURE (with diagrams), EXPLAIN (15 judge questions), DEMO_SCRIPT (a captions-only video), the Devpost draft, the screenshots and the Demo Replay GIF (`scripts/capture-media.mts`).
- **We decided / changed:** _(fill in: rewrite DEVPOST.md in your own words before submitting)_

---

## 2. AI features inside Aula

| Feature | What the model does | Model | Guardrails |
|---|---|---|---|
| Live translation | Translates each finished sentence into every language present in the room, marks where each key term appears in the translation, and repairs obvious speech-recognition mistakes | Qwen3-30B-A3B-Instruct; Somali, Haitian Creole, Dari and Hindi go to Gemma 4 26B in a separate call (Featherless.ai) | Output must pass a strict schema or the student sees the English line instead. Only lesson text is sent, never names. The model is told to translate only and never add content |
| Glossary | Once per language per lesson, writes a one-sentence definition of each key term in the student's language (or simple English) | Qwen3 30B, one term per call (Gemma 4 26B for Somali, Haitian Creole and Dari) | Only terms the teacher listed are kept. Terms the model leaves out are asked for again. Runs at low priority so it never slows captions |
| Speech-recognition repair | Inside the translation call, fixes obvious mishearings ("sell membrane" to "cell membrane") | same | The correction is shown next to what Chrome heard, never silently |
| Student questions | Translates a student's question into English for the teacher | same routing as live translation | Told to translate only and never answer. The teacher answers. Profanity is checked on the original and the English. Only the teacher sees questions |
| Student interface text | Translated the 58 interface strings into the 13 languages once, before launch (not at runtime) | Gemma 4 26B | Every key and placeholder is checked by a test. Key buttons were reviewed by hand, and one bad Tagalog string was fixed. The app says the interface was translated by AI |
| Recap | When the lesson ends, writes a summary, key terms with definitions, and 3 check-yourself questions, then translates them for every student's language (and any other language on request) | Qwen3 30B writes; Qwen3 30B or Gemma translate, the summary first for every language | Built only from the transcript. Told never to add facts or homework answers. Validated before saving. Labeled "Written by AI from what the teacher said" on the page |
