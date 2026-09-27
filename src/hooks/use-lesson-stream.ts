"use client";

import { useEffect, useRef, useState } from "react";

// Subscribes to a lesson's Server-Sent Events stream.
//
// The browser's EventSource reconnects on its own after an error and sends
// the id of the last event it received, so the server can replay what was
// missed. That isn't enough on real phones:
//   - a Wi-Fi drop can leave the connection hanging silently instead of
//     erroring, so we expect a server ping every 15s and reconnect ourselves
//     if nothing arrives for 40s;
//   - when the phone reports it's offline we close right away, and reopen the
//     moment it's back online;
//   - iOS Safari may close the connection for good in a background tab, so
//     we reopen when the tab becomes visible.
// Every manual reopen passes the last event id, so nothing is lost.

export type StreamStatus = "connecting" | "live" | "reconnecting" | "offline";

const EVENT_TYPES = [
  "snapshot",
  "segment",
  "translation",
  "translation-failed",
  "fix",
  "interim",
  "lesson-ended",
  "room",
  "signal-summary",
  "question",
  "question-status",
  "question-removed",
  "glossary",
  "recap",
] as const;

export type StreamEvent = { type: (typeof EVENT_TYPES)[number]; data: unknown };

export function useLessonStream(url: string | null, onEvent: (event: StreamEvent) => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!url) return;
    let es: EventSource | null = null;
    let lastId = "";
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const feedWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        setStatus("reconnecting");
        reopen();
      }, 40_000);
    };

    const open = () => {
      if (disposed) return;
      const full = lastId ? `${url}${url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(lastId)}` : url;
      es = new EventSource(full);
      feedWatchdog();
      es.onopen = () => {
        setStatus("live");
        feedWatchdog();
      };
      es.addEventListener("ping", feedWatchdog);
      es.onerror = () => {
        if (!es) return;
        if (es.readyState === EventSource.CLOSED) {
          // The browser gave up (e.g. the server answered with an error).
          // Try again ourselves with a gentle backoff.
          setStatus("offline");
          es.close();
          retryTimer = setTimeout(open, 3000);
        } else {
          setStatus("reconnecting");
        }
      };
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (ev) => {
          feedWatchdog();
          const msg = ev as MessageEvent<string>;
          if (msg.lastEventId) lastId = msg.lastEventId;
          try {
            handler.current({ type, data: JSON.parse(msg.data) });
          } catch {
            // ignore malformed events
          }
        });
      }
    };

    const reopen = () => {
      es?.close();
      es = null;
      clearTimeout(retryTimer);
      open();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!es || es.readyState === EventSource.CLOSED)) reopen();
    };
    const onOffline = () => {
      es?.close();
      es = null;
      clearTimeout(watchdog);
      clearTimeout(retryTimer);
      setStatus("offline");
    };
    const onOnline = () => {
      setStatus("reconnecting");
      reopen();
    };

    open();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      es?.close();
    };
  }, [url]);

  return status;
}
