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
  hearIt: "Hear it",
  definitionComing: "The definition is on its way...",
  savedToWords: "Saved to My words",
  settings: "Settings",
  showEnglish: "Show the English under each line",
  showEnglishHelp: "Reading both helps you learn the English words.",
  lost: "I'm lost",
  slower: "Slower, please",
  ask: "Ask",
  sentLost: "Sent. Your teacher sees how many students are lost, never who.",
  sentSlower: "Sent. Your teacher will see that someone needs it slower.",
  waitSeconds: "Wait {s}s",
  askTitle: "Ask your teacher",
  askHelp: "Write in any language. Only your teacher sees it.",
  askPlaceholder: "Type your question...",
  send: "Send",
  sending: "Sending...",
  yourQuestions: "Your questions",
  questionSent: "Sent",
  questionAnswered: "Your teacher answered",
  tryAgainSoon: "Wait a moment before sending again.",
  sendFailed: "Couldn't send. Check your connection.",
};

export type StudentStrings = typeof STUDENT_STRINGS_EN;

const STRINGS: Record<string, Partial<StudentStrings>> = {};

export function studentStrings(lang: string): StudentStrings {
  return { ...STUDENT_STRINGS_EN, ...STRINGS[lang] };
}
