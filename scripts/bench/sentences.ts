// 20 sentences written the way teachers actually talk, grouped into three
// lessons so each one has realistic context from the sentences before it.
// Two contain deliberate speech-recognition mistakes ("sell membrane",
// "why intercept") to test whether the model repairs them.

export type BenchLesson = {
  subject: string;
  title: string;
  keyTerms: string[];
  sentences: { id: number; text: string; asrError?: string }[];
};

export const BENCH_LESSONS: BenchLesson[] = [
  {
    subject: "Biology",
    title: "Photosynthesis",
    keyTerms: ["photosynthesis", "chlorophyll", "chloroplast", "glucose", "carbon dioxide", "Calvin cycle", "ATP", "cell membrane"],
    sentences: [
      { id: 1, text: "Okay everyone, today we're talking about photosynthesis, which is how plants make their own food." },
      { id: 2, text: "Plants take in carbon dioxide from the air and water from the soil." },
      { id: 3, text: "Inside the leaf there are tiny structures called chloroplasts, and that's where it all happens." },
      { id: 4, text: "The green color comes from chlorophyll, which absorbs the energy in sunlight." },
      { id: 5, text: "So the light energy gets stored as chemical energy in molecules like ATP." },
      { id: 6, text: "Then the Calvin cycle uses that ATP to turn carbon dioxide into glucose." },
      { id: 7, text: "Water and nutrients have to get through the sell membrane first, so it's kind of like a gatekeeper.", asrError: "sell membrane -> cell membrane" },
      { id: 8, text: "Quick check, can someone tell me what gas plants give off as a waste product?" },
    ],
  },
  {
    subject: "Algebra 1",
    title: "Slope and linear equations",
    keyTerms: ["slope", "y-intercept", "linear equation", "rise over run", "coordinate plane"],
    sentences: [
      { id: 9, text: "Alright, let's look at this line on the coordinate plane." },
      { id: 10, text: "The slope tells us how steep the line is, and we find it with rise over run." },
      { id: 11, text: "If we go up four and over two, the slope is four divided by two, so two." },
      { id: 12, text: "The why intercept is where the line crosses the y axis, here that's at negative three.", asrError: "why intercept -> y-intercept" },
      { id: 13, text: "So the linear equation for this line is y equals two x minus three." },
      { id: 14, text: "If the slope is negative, the line goes down as you move to the right, so don't mix that up on the test." },
    ],
  },
  {
    subject: "US History",
    title: "The Bill of Rights",
    keyTerms: ["Constitution", "amendment", "Bill of Rights", "freedom of speech", "ratify", "due process"],
    sentences: [
      { id: 15, text: "When the Constitution was written, a lot of people worried it gave the government too much power." },
      { id: 16, text: "So in 1791 they added the first ten amendments, which we call the Bill of Rights." },
      { id: 17, text: "The First Amendment protects freedom of speech, religion and the press." },
      { id: 18, text: "Before it could become law, the states had to ratify it, which means officially approve it." },
      { id: 19, text: "The Fifth Amendment includes due process, so the government can't just punish you without a fair procedure." },
      { id: 20, text: "For homework, pick one amendment and write a paragraph about why it still matters today." },
    ],
  },
];

// Subsets used for the slower checks.
export const SPOT_CHECK_IDS = [1, 4, 6, 10, 17];
export const BACKTRANSLATE_IDS = [1, 6, 7, 12, 16, 19];
