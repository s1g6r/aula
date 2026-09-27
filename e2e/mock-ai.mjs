// A tiny OpenAI-compatible server for end-to-end tests. It streams
// predictable "translations" so tests can check the whole pipeline without
// calling (or paying for) a real model. Glossary translations equal the
// English term, so highlights can be found in the "<lang>: <English>" lines. Control words in the teacher's
// sentence change its behavior:
//   [fail]  -> HTTP 500 (the app must fall back to English)
//   [hang]  -> never answers (the app must time out and fall back)
// Otherwise each language's text is "<lang>: <English>", and every listed
// key term comes back highlighted.

import http from "node:http";

const port = Number(process.env.MOCK_AI_PORT ?? 4010);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parse(userMessage) {
  const langs = [...userMessage.matchAll(/^- ([a-zA-Z-]+): /gm)].map((m) => m[1]);
  const segMatch = userMessage.match(/Segments:\n(\[.*\])/s);
  const segments = segMatch ? JSON.parse(segMatch[1]) : [];
  const termsMatch = userMessage.match(/^Terms: (\[.*\])$/m);
  return { langs, segments, glossaryTerms: termsMatch ? JSON.parse(termsMatch[1]) : null, glossaryLang: userMessage.match(/\(([a-zA-Z-]+)\)\n/)?.[1] };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ data: [{ id: "mock", concurrency_cost: 1 }] }));
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body || "{}");
  const user = payload.messages?.find((m) => m.role === "user")?.content ?? "";

  const question = user.match(/^Message: (".*")$/m);
  const { langs, segments, glossaryTerms, glossaryLang } = parse(user);
  // Only the sentences being translated count, not earlier context.
  const said = segments.map((s) => s.en).join(" ");
  if (said.includes("[fail]")) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "mock failure" } }));
  }
  if (said.includes("[hang]")) return; // never answer
  let content;
  const transcript = user.match(/Transcript:\n([\s\S]*)$/);
  const recapToTranslate = user.match(/^Language: .*\(([a-zA-Z-]+)\)\n\nRecap:\n([\s\S]*)$/);
  if (recapToTranslate) {
    const [, lang, json] = recapToTranslate;
    const r = JSON.parse(json);
    content = JSON.stringify({
      summary: r.summary.map((s) => `[${lang}] ${s}`),
      keyTerms: r.keyTerms.map((k) => ({ term: k.term, tr: `${k.term}-${lang}`, definition: `[${lang}] ${k.definition}` })),
      checkQuestions: r.checkQuestions.map((q) => ({ q: `[${lang}] ${q.q}`, answer: `[${lang}] ${q.answer}` })),
    });
  } else if (transcript) {
    const lines = transcript[1].split("\n").map((l) => l.replace(/^\d+\. /, "")).filter(Boolean);
    const terms = (user.match(/^Teacher's key terms: (.*)$/m)?.[1] ?? "").split(", ").filter((t) => t && t !== "(none)");
    content = JSON.stringify({
      summary: [`Recap: ${lines[0]}`, `Then: ${lines.at(-1)}`, "That was the lesson."],
      keyTerms: terms.slice(0, 3).map((t) => ({ term: t, definition: `What the teacher said about ${t}.` })),
      checkQuestions: [1, 2, 3].map((n) => ({ q: `Question ${n} about the lesson?`, answer: `Answer ${n}.` })),
    });
  } else if (question) {
    content = JSON.stringify({ en: `EN: ${JSON.parse(question[1])}` });
  } else if (glossaryTerms) {
    content = JSON.stringify({ terms: glossaryTerms.map((t) => ({ en: t, tr: t, gloss: `Definition of ${t} in ${glossaryLang}.` })) });
  } else if (segments.length) {
    content = JSON.stringify({
      segments: segments.map((s) => ({
        seq: s.seq,
        tr: Object.fromEntries(langs.map((l) => [l, `${l}: ${s.en}`])),
        ...(s.en.includes("sell membrane") ? { fix: s.en.replace("sell membrane", "cell membrane") } : {}),
      })),
    });
  } else {
    content = "OK";
  }

  if (!payload.stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (let i = 0; i < content.length; i += 24) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 24) } }] })}\n\n`);
    await sleep(15);
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {} , finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: Math.ceil(content.length / 4) } })}\n\n`);
  res.end("data: [DONE]\n\n");
});

server.listen(port, () => console.log(`mock AI on :${port}`));
