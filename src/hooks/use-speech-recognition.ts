"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Wraps Chrome's speech recognition for the teacher's laptop.
//
// Before listening, we open the microphone ourselves (getUserMedia). That
// lets the teacher pick which mic to use (built-in, AirPods, a lapel mic),
// shows a live level meter so they can see Aula hears them, and gives a clear
// message when something's wrong (blocked, missing, or a mic that isn't
// delivering sound, like AirPods connected to a phone). The chosen mic's
// audio track is handed to Chrome's recognizer (Chrome 135+).
//
// Chrome stops listening after a pause or about a minute, so while the
// teacher wants the mic on we restart it every time it ends. Interim results
// go to onInterim; each finished sentence goes to onFinal with the time the
// teacher started saying it.
//
// If Chrome can recognize English on this device, we use that, so audio never
// leaves the laptop. If that mode fails for any reason we quietly switch to
// Google's speech service, which is Chrome's default. `mode` says which.

export type SpeechStatus = "unsupported" | "idle" | "starting" | "listening" | "paused" | "blocked" | "no-mic" | "error";
export type MicDevice = { id: string; label: string };

const MIC_KEY = "aula:mic";

export function useSpeechRecognition(opts: { onInterim: (text: string) => void; onFinal: (text: string, startedAt: Date) => void; lang?: string }) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [mode, setMode] = useState<"on-device" | "cloud" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [deviceId, setDeviceIdState] = useState<string>("");
  const [level, setLevel] = useState(0);

  const recRef = useRef<SpeechRecognition | null>(null);
  // Recognizers we've replaced (mic switch). Their late "end" events are ignored.
  const retired = useRef(new WeakSet<SpeechRecognition>());
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const wantOn = useRef(false);
  const forceCloud = useRef(false);
  const startedAt = useRef<Date | null>(null);
  const restarts = useRef<number[]>([]);
  const handlers = useRef(opts);
  useEffect(() => {
    handlers.current = opts;
  });

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
      setDevices(inputs.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
      // If the teacher hasn't chosen a mic and the system default is
      // Bluetooth (often slow or silent in a browser), start with the
      // built-in one. Labels are only visible once mic permission is granted.
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(MIC_KEY);
      } catch {
        saved = null;
      }
      const def = inputs.find((d) => d.deviceId === "default");
      const builtIn = inputs.find((d) => d.deviceId !== "default" && /built-in|internal/i.test(d.label));
      if (saved === null && def && /bluetooth|airpods|headset|hands-free/i.test(def.label) && builtIn) {
        setDeviceIdState(builtIn.deviceId);
      }
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!(window.SpeechRecognition ?? window.webkitSpeechRecognition) || !navigator.mediaDevices) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability check after mount
      setStatus("unsupported");
      return;
    }
    try {
      setDeviceIdState(localStorage.getItem(MIC_KEY) ?? "");
    } catch {
      // storage may be disabled
    }
    void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
      wantOn.current = false;
      recRef.current?.abort();
      stopStream();
    };
     
  }, [refreshDevices]);

  function stopStream() {
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.raf);
      void meterRef.current.ctx.close();
      meterRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }

  // Opens the chosen mic, or explains why it can't. Never waits forever:
  // Bluetooth headphones can leave the request hanging while macOS tries to
  // switch them into headset mode.
  const openMic = useCallback(
    async (id: string): Promise<MediaStreamTrack | null> => {
      stopStream();
      let stream: MediaStream;
      try {
        const request = navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new DOMException("microphone did not respond", "TimeoutError")), 8000);
        });
        // If it answers after we gave up, release it.
        request.then((late) => wantOn.current || late.getTracks().forEach((t) => t.stop())).catch(() => {});
        stream = await Promise.race([request, timeout]).finally(() => clearTimeout(timer));
      } catch (err) {
        const name = (err as DOMException).name;
        wantOn.current = false;
        void refreshDevices();
        if (name === "TimeoutError") {
          setStatus("no-mic");
          setError(
            "The microphone isn't responding. If Chrome is showing a permission prompt, allow it. With Bluetooth headphones like AirPods, pick your computer's built-in microphone below instead.",
          );
        } else if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("blocked");
          setError("Chrome isn't allowed to use the microphone. Click the mic icon in the address bar and choose Allow, or type below.");
        } else if (name === "NotFoundError") {
          setStatus("no-mic");
          setError("No microphone found. Plug one in, or type below.");
        } else if (name === "OverconstrainedError") {
          setStatus("no-mic");
          setError("That microphone isn't connected anymore. Pick another one.");
          setDeviceIdState("");
        } else {
          setStatus("no-mic");
          setError("That microphone isn't sending sound (Bluetooth headphones may be connected to another device). Pick another microphone.");
        }
        return null;
      }
      streamRef.current = stream;
      void refreshDevices(); // labels become visible after permission
      const track = stream.getAudioTracks()[0];
      track.addEventListener("ended", () => {
        if (!wantOn.current) return;
        wantOn.current = false;
        recRef.current?.abort();
        setStatus("no-mic");
        setError("The microphone disconnected. Pick another one and press Start.");
      });

      // Live input level (0..1), updated about 10 times a second.
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          if (t - last > 100) {
            setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
            last = t;
          }
          meterRef.current!.raf = requestAnimationFrame(tick);
        };
        meterRef.current = { ctx, raf: requestAnimationFrame(tick) };
      } catch {
        // meter is optional
      }
      return track;
    },
    [refreshDevices],
  );

  const create = useCallback(async (): Promise<SpeechRecognition | null> => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let local = false;
    if (!forceCloud.current && Ctor.available) {
      try {
        const availability = await Promise.race([
          Ctor.available({ langs: [rec.lang], processLocally: true }),
          new Promise<"unavailable">((r) => setTimeout(() => r("unavailable"), 1500)),
        ]);
        local = availability === "available";
      } catch {
        local = false;
      }
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
      // On-device mode failed: switch to Google's service; onend restarts.
      if (local && !forceCloud.current) {
        forceCloud.current = true;
        return;
      }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantOn.current = false;
        setStatus("blocked");
        setError("Chrome isn't allowed to use the microphone. Click the mic icon in the address bar and choose Allow, or type below.");
      } else if (e.error === "audio-capture") {
        wantOn.current = false;
        setStatus("no-mic");
        setError("Chrome can't hear that microphone. Pick another one below, or type instead.");
      } else if (e.error === "network") {
        setError("Speech recognition lost its connection. Retrying...");
      } else {
        setError(`Speech recognition error: ${e.error}`);
      }
    };
    rec.onend = () => {
      if (retired.current.has(rec)) return;
      if (local && forceCloud.current) recRef.current = null; // next start uses the cloud
      if (!wantOn.current) {
        setStatus((s) => (s === "blocked" || s === "no-mic" || s === "error" ? s : "paused"));
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
      setTimeout(() => void begin(), 250);
    };
    return rec;
     
  }, [opts.lang]);

  // Start (or restart) recognition on the current mic track.
  const beginRef = useRef<() => Promise<void>>(async () => {});
  const begin = () => beginRef.current();
  useEffect(() => {
    beginRef.current = async () => {
      if (!wantOn.current) return;
      if (!recRef.current) recRef.current = await create();
      const rec = recRef.current;
      if (!rec) return setStatus("unsupported");
      const track = streamRef.current?.getAudioTracks()[0];
      try {
        if (track && track.readyState === "live") rec.start(track);
        else rec.start();
      } catch {
        try {
          rec.start(); // older Chrome: no track argument
        } catch {
          // already running
        }
      }
    };
  }, [create]);

  const start = useCallback(async () => {
    wantOn.current = true;
    restarts.current = [];
    setError(null);
    setStatus("starting");
    const track = await openMic(deviceId);
    if (!track) return;
    await begin();
     
  }, [deviceId, openMic]);

  const stop = useCallback(() => {
    wantOn.current = false;
    recRef.current?.stop();
    stopStream();
    handlers.current.onInterim("");
    setStatus((s) => (s === "listening" || s === "starting" ? "paused" : s));
  }, []);

  const setDeviceId = useCallback(
    (id: string) => {
      setDeviceIdState(id);
      try {
        localStorage.setItem(MIC_KEY, id);
      } catch {
        // ignore
      }
      // Switching mics while listening: restart on the new one.
      if (wantOn.current) {
        if (recRef.current) {
          retired.current.add(recRef.current);
          recRef.current.abort();
        }
        recRef.current = null;
        void openMic(id).then((track) => track && begin());
      }
    },
     
    [openMic],
  );

  return { status, mode, error, start, stop, devices, deviceId, setDeviceId, level };
}
