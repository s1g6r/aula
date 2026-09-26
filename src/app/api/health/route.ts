// GET /api/health: used by Render's health check and the keep-awake ping.
// Deliberately doesn't touch the database, so a slow DB never looks like a
// dead server.
export function GET() {
  return Response.json({ ok: true, uptime: Math.round(process.uptime()) });
}
