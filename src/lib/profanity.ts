// A light filter for student questions. It catches common slurs and swear
// words in English and a few of our launch languages; anything it flags is
// hidden from the teacher's screen. It's deliberately small (a real school
// deployment would use a maintained list), and it matches whole words only,
// so "class" or "Scunthorpe" never trip it.

const WORDS = [
  // English
  "fuck", "fucking", "fucker", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "cunt", "slut", "whore", "nigger", "nigga", "faggot", "retard",
  // Spanish
  "puta", "puto", "mierda", "pendejo", "pendeja", "cabron", "cabrón", "coño", "joder", "maricón", "verga",
  // Portuguese
  "porra", "caralho", "merda", "buceta", "viado",
  // French
  "merde", "putain", "connard", "salope", "encule", "enculé",
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0@]/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/[4]/g, "a")
    .replace(/\$/g, "s");

const PATTERN = new RegExp(`(^|[^\\p{L}])(${[...new Set(WORDS.map(normalize))].join("|")})(?=$|[^\\p{L}])`, "u");

export function isProfane(text: string): boolean {
  return PATTERN.test(normalize(text));
}
