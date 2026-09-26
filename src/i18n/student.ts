// Interface text on the student's phone. A newcomer may not read English,
// so these are shown in the student's language (translations are added in
// P8 and marked as machine-translated). English is the fallback.

export const STUDENT_STRINGS_EN = {
  waiting: "Waiting for your teacher to start talking...",
  live: "Live",
  reconnecting: "Reconnecting...",
  offline: "No connection. Trying again...",
  ended: "The lesson has ended.",
  translating: "Translating...",
  translationUnavailable: "Translation not available for this line.",
  changeLanguage: "Change language",
  chooseLanguage: "Choose your language",
  newLines: "New lines",
  teacherSpeaking: "Your teacher is saying:",
  english: "English",
};

export type StudentStrings = typeof STUDENT_STRINGS_EN;

const STRINGS: Record<string, Partial<StudentStrings>> = {};

export function studentStrings(lang: string): StudentStrings {
  return { ...STUDENT_STRINGS_EN, ...STRINGS[lang] };
}
