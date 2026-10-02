# Questions a judge might ask

Short answers in plain language. The details behind each one are in `ARCHITECTURE.md`, `DECISIONS.md` and `MODEL_BENCHMARK.md`.

---

**1. How is this different from Google Translate?**
Google Translate translates one person at a time, and you have to hold your phone up to the teacher. Aula is built for a whole classroom: the teacher talks normally, and every student reads the lesson live on their own phone in their own language, at the same time, with no app to install. It also does things a translator doesn't: it highlights the lesson's key English words and explains them, it lets a lost student tell the teacher silently, and it turns the lesson into a recap for anyone who was absent.

**2. What happens if a translation is wrong?**
Three safety nets. First, the English line is always shown underneath, so the student can compare. Second, every line has a small flag button; the teacher's review page lists flagged lines. Third, Aula is honest about quality: Somali, Haitian Creole and Dari carry a "beta" badge because AI is weaker in those languages, and the recap says it was written by AI. For key terms, every line uses the same textbook word from the lesson's glossary, so a term never gets translated three different ways.

**3. Doesn't translation stop students from learning English?**
It's designed as a bridge, not a crutch. The translation is big and the English is right underneath it. The teacher's key terms are highlighted in both; tapping one shows a simple definition in the student's language and plays the English pronunciation, and saves the word to "My words." The recap keeps each key term in English next to its translation. A student can turn the English off, but it's on by default.

**4. How fast is it?**
In our tests with real AI, a translated line reaches the phone about 1.5 to 4 seconds after the teacher finishes a sentence (faster with one or two languages, slower with several). The English appears instantly, word by word, while the teacher is talking. If the teacher talks for a long time without pausing, Aula sends what it has heard every dozen words or so instead of waiting. The recap summary reaches each student in their language about 15 to 25 seconds after the lesson ends. We measured all of this with a script that plays a real lesson through the real app (numbers in `DECISIONS.md`).

**5. What about privacy?**
Aula never records or stores audio; the server only receives text. Students don't make accounts and don't give real names; their nickname is shown only to the teacher. The AI never sees names, only the lesson text, subject and key terms. Questions are visible only to the teacher. Lessons delete themselves after 30 days, and the teacher can delete one at any time. One honest caveat: speech recognition is done by the browser. Chrome does it on the laptop when it can; otherwise it uses Google's service (Safari uses Apple's), as it would for any website that listens.

**6. What if the Wi-Fi drops?**
Each phone keeps a live connection to the server, and every message has a number. When the phone reconnects, it tells the server the last number it saw and gets exactly what it missed. We test this: a phone goes offline for 10 seconds in the middle of a lesson, and when it comes back no lines are missing. If the AI itself fails, students see the English line instead of a blank or an error.

**7. Why not just use Google Meet or Zoom captions?**
Those are for video calls, not a teacher standing in a classroom. They show one language to everyone, need every student logged into a meeting, and don't help a student learn the vocabulary, say they're lost, or catch up after being absent. Aula is one join code on a phone, a different language for each student, and it's free.

**8. How would a school adopt this?**
A teacher can use it today with no setup: open aulaapp.xyz, start a lesson, and students scan the QR code. No installs, no student accounts, no district contract. For a school, the path is: a teacher tries it in one class, the ESL coordinator shares it, and IT allows the domain on the school network. Because nothing is installed and no student data is kept beyond 30 days, the privacy review is simple.

**9. What did AI do, and what did you do?**
We decided the problem, the features and their priority, the design direction, and every trade-off (which models, which languages, what to cut). We worked with Claude Code, Anthropic's coding assistant, as a pair programmer: it wrote most of the code and the tests, ran the benchmarks, and explained its choices; we reviewed them and changed direction when something didn't fit. Inside the app, open AI models on Featherless translate, write definitions and write the recap. The full disclosure is in `AI_USE.md`.

**10. Which AI models, and why those?**
We benchmarked four models on 20 real classroom sentences in four languages, measuring speed, valid output and quality. Qwen3 30B was the fastest with correct output, so it does live captions. Gemma 4 26B was clearly better in Somali, Haitian Creole and Dari, and uses a third of the tokens for Hindi, so those languages go to Gemma. Both are open models, run on Featherless.

**11. What if the room has five different languages?**
It works, and each language arrives the moment it's ready rather than waiting for the others. It does get slower: our AI account processes one request at a time, so five languages including Somali, with a teacher who never pauses, lag about 10 to 15 seconds. Real lessons have pauses, and a faster AI provider would remove that limit with a settings change.

**12. How does "I'm lost" stay anonymous?**
The tap only records which sentence the student was reading. The teacher sees a count ("3 students lost at: 'Then the Calvin cycle uses that ATP...'"), never names. Classmates see nothing. Each student can tap once every 20 seconds, so it can't be spammed.

**13. How do judges try it without a classroom?**
The "Watch a live demo" button plays a real lesson that went through Aula's live pipeline: the teacher's screen and a student's phone side by side, with narration. You can switch the phone between Spanish, Arabic, Vietnamese and Chinese, jump to the moment students got lost, and tap words. It needs no microphone, login or second device. "Try it live" starts a real lesson with a QR code if you have a phone nearby.

**14. How did you test it?**
167 unit tests cover things like line ordering, merging, caching, the "I'm lost" counting, and checking every AI reply. 12 end-to-end tests run the real app in a browser: live captions, a Wi-Fi drop, translations, questions, the recap, the demo, accessibility (an automated WCAG audit of every screen) and the security headers. Extra tests run a real lesson with the real AI, and feed a synthetic voice into real Chrome as its microphone. We also ran everything against the live site and got a Lighthouse accessibility score of 100 on every main screen.

**15. What's next?**
A faster AI provider option so big multilingual classrooms stay under 3 seconds; emailing the recap to families (an n8n workflow); letting a student keep their vocabulary across lessons; more languages; and running on several servers (the live event bus would move to Redis). Most important: testing with real ESL teachers and newcomer students.
