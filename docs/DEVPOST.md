# Devpost draft

A starting point for every field. Rewrite it in your own words before submitting; judges can tell, and you'll need to defend every sentence.

---

## Project name
Aula

## Elevator pitch (up to 200 characters)
Aula turns a teacher's voice into live captions in each student's home language, lets lost students signal it silently, and turns every lesson into a recap no one can miss.

## Links ("Try it out")
- Live app: https://aulaapp.xyz
- Backup address (same app, for school or company networks that block brand-new domains): https://aula-u9nw.onrender.com
- Code: https://github.com/s1g6r/aula
- The quickest way in: https://aulaapp.xyz/demo (no login, no microphone, no second device)

## Inspiration
About 1 in 10 US public school students is an English learner: 5.3 million students. Picture a newcomer in 9th-grade Biology who understands a fraction of what the teacher says. Many teachers used Microsoft Translator's free multi-device conversations to caption their lessons for these students, and Microsoft retired that feature on June 30, 2026.

Translation alone was never enough anyway. Students who are lost rarely raise a hand in a language they're still learning, so teachers find out at the test. A translation can become a crutch if it doesn't teach the English words. And about 1 in 5 students is chronically absent; "what did I miss?" usually gets a shrug. We wanted one free tool that handles all of that.

## What it does
- **The teacher just talks.** They open Aula on a laptop, list the lesson's key terms, and share a join code or QR code.
- **Students join on their phones,** no app and no account, and pick one of 13 languages. Captions arrive live: the English word by word as the teacher speaks, then the translation a second or two later.
- **Key English words are highlighted.** Tapping one shows a simple definition in the student's language and plays the English pronunciation, and saves it to "My words." The English stays under every line by default.
- **"I'm lost" and "Slower, please"** are silent, anonymous taps. The teacher sees how many students got lost and at which exact sentence, never who.
- **Questions in any language:** a student types in their language, and the teacher reads it in English and answers out loud.
- **A recap when class ends:** summary, key words, and check-yourself questions in every student's language. The same link is the "What you missed" page for absent students, in any language they choose.
- **For the teacher afterward:** a timeline of where students got lost, to know what to re-teach tomorrow. Plus projector mode for big English captions on the classroom screen.
- **A one-click Demo Replay** so anyone can see a whole lesson without a classroom.

## How we built it
- **Next.js 16 and TypeScript** as one long-lived Node server on **Render**, with **Postgres** (Prisma) for lessons, transcripts, translations and recaps. Tailwind and shadcn/ui for the interface.
- **Speech recognition in the browser** (Chrome or Safari). Only text reaches the server, never audio.
- **Server-Sent Events** push every line to every phone. Each message is numbered, so a phone that loses Wi-Fi catches up on exactly what it missed.
- **Open AI models on Featherless.ai:** Qwen3 30B for live captions, and Gemma 4 26B for Somali, Haitian Creole, Dari and Hindi, where it was better or more efficient. We picked them with a benchmark of 20 classroom sentences in four languages, measuring speed, valid output and quality.
- **One AI call per sentence covers every language,** streamed back so each language goes out the moment its part is ready. Every reply is checked against a schema; if anything fails, students see the English, never a blank line.
- **A domain from Gen.xyz:** aulaapp.xyz.
- **Tested** with 167 unit tests and 12 end-to-end browser tests (including a Wi-Fi drop, AI failures, an accessibility audit of every screen and the security headers), plus tests with the real AI and with a synthetic voice fed into real Chrome.

## Challenges we ran into
- **Speed on a shared AI account.** Testers said translations took up to a minute. We measured and found our Featherless account handles one request at a time, about 33 tokens (pieces of words) a second, shared by every classroom at once. The fixes: send long speech in 12-word pieces instead of waiting for a pause, give slower-model languages their own queue, let recaps go before background work, and stop reading a reply the moment it's complete. Captions went from 13 to 15 seconds behind the start of a sentence to about 7, and each student's recap summary from about a minute to under 25 seconds.
- **Getting the model to stop "helping."** It sometimes rewrote the teacher's sentence or left an English word inside a translation. Now the model only fixes a misheard key term, and every translation uses the glossary's textbook word for each key term, which removed the stray English words in our tests.
- **Microphones.** AirPods, stuck browser audio, and iPhone settings all fail differently. The teacher screen now picks a working mic, explains exactly what's wrong, and shows a technical detail line.
- **Brand-new domain.** A university network blocked aulaapp.xyz because it was days old. We added security headers and a backup address.

## Accomplishments that we're proud of
- A judge can understand the whole product in two minutes with one click and no setup.
- A student who loses Wi-Fi for 10 seconds misses nothing, and an AI failure never leaves a blank line. Both are tested automatically.
- Lighthouse accessibility 100 on every main screen, a mirrored layout for Arabic and Dari, and the whole student interface translated into all 13 languages.
- Every design decision is written down with the measurements behind it.

## What we learned
- Measure before fixing. Our first guesses about why translation was slow were wrong; the timing script found the real causes.
- In AI apps, output length is the whole game. Asking for less text cut the wait more than any model change.
- Honest limits make a better product: "beta" labels for weaker languages, a flag button for bad lines, and English always underneath.

## What's next for Aula
- Try it with real ESL teachers and newcomer students.
- A faster AI option so big multilingual classrooms stay under 3 seconds.
- Emailing the recap to families (an n8n workflow) and keeping each student's vocabulary across lessons.
- More languages, and running on several servers.

## Built with
nextjs, react, typescript, tailwindcss, shadcn-ui, node.js, postgresql, prisma, auth.js, server-sent-events, web-speech-api, featherless-ai, qwen, gemma, zod, render, gen-xyz, vitest, playwright, axe-core

## Screenshots (in docs/media)
1. `demo.png`: the Demo Replay, teacher and phone side by side
2. `phone-spanish.png`: live captions in Spanish with highlighted key terms
3. `phone-arabic.png`: Arabic, right to left
4. `phone-key-term.png`: tap a word for its meaning and pronunciation
5. `teacher.png`: the teacher's live screen with "3 students lost" and a translated question
6. `recap-vietnamese.png`: the recap in Vietnamese
7. `review.png`: where students got lost, for tomorrow's lesson
8. `landing.png`: the landing page

## AI disclosure
We built Aula with Claude Code (Anthropic's AI coding assistant) as a pair programmer. We decided the problem, the features and their order, the design, the tech stack, which AI models and languages to use, and every trade-off; Claude Code proposed options, wrote most of the code and tests, ran the benchmarks and latency measurements, and explained its choices, which we reviewed. Inside the app, open AI models on Featherless.ai translate captions and questions, write key-term definitions, and write the lesson recap; all of it is checked against a schema, shown with the English original, and labeled as AI where it matters. The student interface text was translated once by AI and spot-checked. Full phase-by-phase details: `docs/AI_USE.md`.
