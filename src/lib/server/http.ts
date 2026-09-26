import { z } from "zod";

// Small helpers shared by the API routes.

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

// Parses and validates a JSON body. Returns the data or a 400 response.
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError(400, "Body must be JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request") };
  return { data: parsed.data };
}
