// Render's free web services sleep after 15 minutes without a visitor, and
// the first visitor after that waits about a minute. So the server visits
// its own health check every 10 minutes, through its public address (Render
// sets RENDER_EXTERNAL_URL), which counts as a visit. One service running
// all month fits inside Render's 750 free hours.
//
// Limitation: a sleeping server can't wake itself; the next real visitor does.
// Every deploy starts awake, and from then on it stays awake.

export function startKeepAwake(): void {
  const base = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) return; // not on Render (local dev, tests)
  const url = `${base.replace(/\/$/, "")}/api/health`;
  const ping = () =>
    fetch(url, { headers: { "User-Agent": "aula-keep-awake" }, signal: AbortSignal.timeout(20_000) })
      .then((r) => {
        if (!r.ok) console.warn(`[keep-awake] ${url} answered ${r.status}`);
      })
      .catch((err) => console.warn("[keep-awake]", (err as Error).message));
  setInterval(ping, 10 * 60_000).unref();
  console.log(`[keep-awake] pinging ${url} every 10 minutes`);
}
