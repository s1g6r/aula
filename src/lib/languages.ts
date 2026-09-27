// The 13 student languages (the brief's 12, plus Hindi). `code` is a BCP 47
// tag used for the `lang` attribute on every translated line, so browsers
// pick the right fonts and screen readers the right voice. `promptName` is
// what we tell the model, chosen for the variant most US newcomer students
// actually speak.

export type LanguageCode =
  | "es"
  | "ar"
  | "zh-Hans"
  | "vi"
  | "pt"
  | "hi"
  | "ht"
  | "uk"
  | "ru"
  | "fa-AF"
  | "so"
  | "fil"
  | "fr";

export type Language = {
  code: LanguageCode;
  name: string;
  native: string;
  promptName: string;
  dir: "ltr" | "rtl";
  // Lower-resource languages where model quality is noticeably weaker.
  // Shown with a "beta" badge; students can flag bad lines.
  beta: boolean;
  // Translated by the stronger model even though quality is fine: the fast
  // model's tokenizer needs about 3 times the tokens for Hindi's script, which
  // made it slower than the strong model (and less fluent). Beta languages
  // always use the stronger model too.
  strongModel?: boolean;
};

export const LANGUAGES: readonly Language[] = [
  { code: "es", name: "Spanish", native: "Español", promptName: "Latin American Spanish", dir: "ltr", beta: false },
  { code: "ar", name: "Arabic", native: "العربية", promptName: "Modern Standard Arabic", dir: "rtl", beta: false },
  { code: "zh-Hans", name: "Chinese (Simplified)", native: "简体中文", promptName: "Simplified Chinese (Mandarin)", dir: "ltr", beta: false },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", promptName: "Vietnamese", dir: "ltr", beta: false },
  { code: "pt", name: "Portuguese", native: "Português", promptName: "Brazilian Portuguese", dir: "ltr", beta: false },
  { code: "hi", name: "Hindi", native: "हिन्दी", promptName: "Hindi (everyday Hindi in Devanagari script)", dir: "ltr", beta: false, strongModel: true },
  { code: "ht", name: "Haitian Creole", native: "Kreyòl ayisyen", promptName: "Haitian Creole (Kreyòl ayisyen)", dir: "ltr", beta: true },
  { code: "uk", name: "Ukrainian", native: "Українська", promptName: "Ukrainian", dir: "ltr", beta: false },
  { code: "ru", name: "Russian", native: "Русский", promptName: "Russian", dir: "ltr", beta: false },
  { code: "fa-AF", name: "Dari", native: "دری", promptName: "Dari (Afghan Persian, not Iranian Farsi)", dir: "rtl", beta: true },
  { code: "so", name: "Somali", native: "Soomaali", promptName: "Somali", dir: "ltr", beta: true },
  { code: "fil", name: "Tagalog", native: "Tagalog", promptName: "Tagalog (Filipino)", dir: "ltr", beta: false },
  { code: "fr", name: "French", native: "Français", promptName: "French", dir: "ltr", beta: false },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

const byCode = new Map<string, Language>(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): Language | undefined {
  return byCode.get(code);
}

export function isLanguageCode(code: string): code is LanguageCode {
  return byCode.has(code);
}
