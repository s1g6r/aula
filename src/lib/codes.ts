import { randomInt } from "node:crypto";

// Join codes are 6 characters from an alphabet without look-alikes
// (no 0/O, 1/I/L), so they're easy to read off a projector and type on a phone.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Accepts what a student might type: lowercase, spaces, a dash in the middle.
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, "");
  return CODE_RE.test(code) ? code : null;
}
