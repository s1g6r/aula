"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Wraps Chrome's speech recognition for the teacher's laptop.
//
// Chrome stops listening after a pause or about a minute, so while the
// teacher wants the mic on we restart it every time it ends. Interim results
// (words still changing) go to onInterim; each finished sentence goes to
// onFinal with the time the teacher started saying it.
//
// If Chrome can recognize speech on this device (Chrome 139+ with the
// English language pack), we use that, so audio never leaves the laptop.
// Otherwise Chrome sends audio to Google's speech service. `mode` says which.

export type SpeechStatus = "unsupported" | "idle" | "starting" | "listening" | "paused" | "blocked" | "no-mic" | "error";

export function useSpeechRecognition(opts: {
  onInterim: (text: string) => void;
  onFinal: (text: string, startedAt: Date) => void;
  lang?: string;
}) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [mode, setMode] = useState<"on-device" | "cloud" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognition | null>(null);
  const wantOn = useRef(false);
  const startedAt = useRef<Date | null>(null);
  const restarts = useRef<number[]>([]);
  const handlers = useRef(opts);
  useEffect(() => {
    handlers.current = opts;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && !(window.SpeechRecognition ?? window.webkitSpeechRecognition)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability check after mount
      setStatus("unsupported");
    }
    return () => {
      wantOn.current = false;
      recRef.current?.abort();
    };
  }, []);

  const create = useCallback(async (): Promise<SpeechRecognition | null> => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let local = false;
    try {
      if (Ctor.available) {
        const availability = await Promise.race([
          Ctor.available({ langs: [rec.lang], processLocally: true }),
          new Promise<"unavailable">((r) => setTimeout(() => r("unavailable"), 1500)),
        ]);
        local = availability === "available";
      }
    } catch {
      local = false;
    }
    if (local) rec.processLocally = true;
    setMode(local ? "on-device" : "cloud");

    rec.onstart = () => {
      setStatus("listening");
      setError(null);
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (!startedAt.current && text.trim()) startedAt.current = new Date();
        if (result.isFinal) {
          const final = text.trim();
          if (final) handlers.current.onFinal(final, startedAt.current ?? new Date());
          startedAt.current = null;
        } else {
          interim += text;
        }
      }
      handlers.current.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // normal; onend restarts
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantOn.current = false;
        setStatus("blocked");
        setError("Chrome isn't allowed to use the microphone. Click the mic icon in the address bar to allow it, or type below.");
      } else if (e.error === "audio-capture") {
        wantOn.current = false;
        setStatus("no-mic");
        setError("No microphone found. Plug one in, or type below.");
      } else if (e.error === "network") {
        setError("Speech recognition lost its connection. Retrying...");
      } else {
        setError(`Speech recognition error: ${e.error}`);
      }
    };
    rec.onend = () => {
      if (!wantOn.current) {
        setStatus((s) => (s === "blocked" || s === "no-mic" ? s : "paused"));
        return;
      }
      // Restart, but give up if Chrome keeps ending immediately.
      const now = Date.now();
      restarts.current = [...restarts.current.filter((t) => now - t < 10_000), now];
      if (restarts.current.length > 6) {
        wantOn.current = false;
        setStatus("error");
        setError("The microphone keeps stopping. Check your mic, then press Start again, or type below.");
        return;
      }
      setTimeout(() => {
        if (!wantOn.current) return;
        try {
          rec.start();
        } catch {
          // already started
        }
      }, 250);
    };
    return rec;
  }, [opts.lang]);

  const start = useCallback(async () => {
    wantOn.current = true;
    restarts.current = [];
    setStatus("starting");
    if (!recRef.current) recRef.current = await create();
    if (!recRef.current) {
      setStatus("unsupported");
      return;
    }
    try {
      recRef.current.start();
    } catch {
      // start() throws if it's already running; that's fine.
    }
  }, [create]);

  const stop = useCallback(() => {
    wantOn.current = false;
    recRef.current?.stop();
    handlers.current.onInterim("");
    setStatus("paused");
  }, []);

  return { status, mode, error, start, stop };
}
