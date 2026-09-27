import ar from "./strings/ar.json";
import es from "./strings/es.json";
import faAF from "./strings/fa-AF.json";
import fil from "./strings/fil.json";
import fr from "./strings/fr.json";
import ht from "./strings/ht.json";
import pt from "./strings/pt.json";
import ru from "./strings/ru.json";
import so from "./strings/so.json";
import uk from "./strings/uk.json";
import vi from "./strings/vi.json";
import zhHans from "./strings/zh-Hans.json";

// Interface text on the student's phone. A newcomer may not read English,
// so everything is shown in the student's language. The translations in
// ./strings were made once with AI (scripts/translate-ui.mts) and the
// settings sheet says so. English is the fallback for anything missing.

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
  recapWriting: "Writing your lesson recap...",
  readRecap: "Read the recap",
  recapFailed: "The recap couldn't be written this time.",
  recapTitle: "What you missed",
  whatWeLearned: "What we learned",
  keyWords: "Key words",
  checkYourself: "Check yourself",
  showAnswer: "Show answer",
  fullLesson: "The whole lesson",
  aiNote: "Written by AI from what the teacher said. If something looks wrong, ask your teacher.",
  translatingRecap: "Translating the recap into your language...",
  recapNotTranslated: "The recap isn't ready in this language yet. Here it is in English.",
  language: "Language",
  myWords: "My words",
  myWordsEmpty: "Tap a highlighted word during class to save it here.",
  remove: "Remove",
  textSize: "Text size",
  colors: "Colors",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "Match my phone",
  flagTranslation: "This translation looks wrong",
  flagged: "Thanks. Your teacher will see it.",
  aiInterface: "The words on this screen were translated by AI.",
};

export type StudentStrings = typeof STUDENT_STRINGS_EN;

const STRINGS: Record<string, Partial<StudentStrings>> = { es, ar, "zh-Hans": zhHans, vi, pt, ht, uk, ru, "fa-AF": faAF, so, fil, fr };

export function studentStrings(lang: string): StudentStrings {
  return { ...STUDENT_STRINGS_EN, ...STRINGS[lang] };
}
