// Server-Sent Events wire format: optional id, an event name, one data line.
// JSON never contains raw newlines, so a single data line is always valid.
export function encodeEvent(event: { id?: string | null; type: string; data: unknown }): string {
  return `${event.id ? `id: ${event.id}\n` : ""}event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
