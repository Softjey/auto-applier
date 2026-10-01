// The controlled vocabulary that connects a form question to a story.
//
// Every story in stories.json is tagged with `themes` from this list, and
// stories.mjs maps a question onto the same list. A behavioural question
// ("describe a time you disagreed with a teammate") shares no words with the
// story that answers it, but both land on the theme `conflict`.
//
// `keys` hold English and Polish side by side (the forms are in both). Matching
// is diacritic-blind — forms and users often drop ą ę ł ó — so write keys with
// or without diacritics, it does not matter. A key matches from the start of a
// word: "learn" hits "learned", "konflikt" hits "konfliktowa", "train" does not
// hit "constraint". A key ending in a space is a whole word ("ai ").
//
// Add a key (or a theme) here when a real question fell through, then run
// `node scripts/test-story-themes.mjs`. stories.mjs `validate` rejects a theme
// that is not listed here. Another language is one more set of keys per theme.

/** Lower-case, strip diacritics (ł has no decomposition, so it is mapped by hand). */
export function fold(s) {
  return String(s)
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const THEMES = {
  conflict: {
    about: "disagreement or friction with a person or a team",
    keys: [
      "conflict", "disagree", "disagreement", "push back", "pushed back", "argue", "clash", "tension", "difficult colleague", "difficult teammate", "difficult coworker", "difficult person", "different opinion", "opposing",
      "konflikt", "nie zgadza", "niezgod", "roznica zdan", "roznicy zdan", "nieporozumien", "napiec", "sprzeczn", "trudny wspolpracownik", "trudnym wspolpracownikiem", "trudna osoba", "trudna osoba", "inne zdanie",
    ],
  },
  "disagree-and-commit": {
    about: "argued for one direction, was overruled, committed to the decision anyway",
    keys: [
      "disagree and commit", "overruled", "not accepted", "decision you disagreed", "decision you did not agree", "went against",
      "mimo sprzeciwu", "wbrew", "decyzja z ktora sie nie zgadzal", "zostala odrzucona", "zostal odrzucony",
    ],
  },
  failure: {
    about: "something went wrong and what was learned",
    keys: [
      "fail", "failure", "mistake", "went wrong", "regret", "lesson", "learned from", "setback", "wrong decision", "criticism", "feedback",
      "porazk", "blad", "bled", "nie udalo", "niepowodzen", "wnioski", "czego sie nauczy", "krytyk", "pomyl", "nietrafion",
    ],
  },
  ownership: {
    about: "took responsibility beyond the assignment and saw it through",
    keys: [
      "ownership", "owned", "take responsibility", "responsibility", "initiative", "proactive", "above and beyond", "beyond your role", "beyond the scope", "stepped up", "volunteer",
      "odpowiedzialnos", "inicjatyw", "wyszed", "wykroczy", "wzial na siebie", "wzielas na siebie", "dobrowoln", "proaktyw", "poza zakresem",
    ],
  },
  "hardest-problem": {
    about: "the most complex or challenging problem the person solved",
    keys: [
      "hardest", "most difficult", "most complex", "most challenging", "complex problem", "challenging problem", "technical challenge", "technical problem", "difficult problem", "toughest", "problem you solved", "problem-solving", "problem solving", "tricky",
      "najtrudniejsz", "najbardziej zlozon", "najbardziej skomplikowan", "zlozony problem", "skomplikowany problem", "wyzwanie techniczne", "problem techniczny", "trudny problem", "najwiekszy problem", "najwieksze wyzwanie", "rozwiazal", "rozwiazales", "rozwiazalas",
    ],
  },
  performance: {
    about: "making something faster, lighter or cheaper to run",
    keys: [
      "performance", "optimi", "latency", "speed up", "faster", "slow", "scalab", "efficien", "memory", "throughput", "bottleneck", "load time",
      "wydajnos", "optymaliz", "opoznien", "przyspiesz", "szybsz", "wolno", "wolny", "skalowaln", "pamiec", "pamieci", "waskie gardlo", "czas ladowania", "obciazen",
    ],
  },
  architecture: {
    about: "system or API design choices and trade-offs",
    keys: [
      "architect", "system design", "design decision", "trade-off", "tradeoff", "trade off", "technical decision", "technical design", "design choice",
      "architektur", "projektowanie system", "kompromis", "decyzj techniczn", "decyzje techniczne", "wybor technolog", "projekt techniczny",
    ],
  },
  influence: {
    about: "getting people without authority over you to adopt an idea",
    keys: [
      "influence", "convince", "persuade", "buy-in", "buy in", "stakeholder", "propose", "proposal", "rejected", "get alignment", "alignment", "advocate", "without authority",
      "przekona", "wplywac", "interesariusz", "zaproponow", "propozycj", "odrzucon", "uzgodni", "poparcie", "zdobyc poparcie", "forsowa",
    ],
  },
  mentoring: {
    about: "teaching, coaching or growing other people",
    keys: [
      "mentor", "coach", "teach", "taught", "train", "develop others", "help others", "junior", "onboard", "grow the team", "knowledge sharing", "knowledge transfer",
      "szkol", "uczyl", "wspierani", "rozwoj innych", "rozwoj zespolu", "pomagal", "pomoc innym", "juniorom", "wdrozen nowych", "dzielenie sie wiedza", "przekazywanie wiedzy", "zajecia", "wyklad", "prowadzil zajecia",
    ],
  },
  leadership: {
    about: "leading people or a piece of work, making calls for a team",
    keys: [
      "leader", "leadership", "lead a team", "led a", "manage a team", "team lead", "tech lead", "guide the team", "managing people", "people management",
      "przywodz", "lider", "prowadzenie zespolu", "prowadzil zespol", "prowadzilam zespol", "zarzadzanie zespolem", "zarzadzal zespol", "kierowa", "kierowal",
    ],
  },
  "people-management": {
    about: "dealing with an underperforming or struggling colleague, hiring, role fit",
    keys: [
      "underperform", "struggling", "low performer", "poor performer", "hiring", "hire", "fire", "role fit", "difficult conversation", "tough conversation",
      "slabe wyniki", "slabo radzil", "niskie wyniki", "problem z pracownik", "zwolni", "rekrutac", "zatrudni", "trudna rozmowa", "trudnej rozmow",
    ],
  },
  "learning-fast": {
    about: "picking up an unfamiliar technology or domain quickly",
    keys: [
      "learn", "new technology", "new stack", "new framework", "new language", "unfamiliar", "adapt", "outside your comfort", "comfort zone", "ramp up", "quickly pick", "self-taught", "curious", "curiosity",
      "nauczy", "szybko sie", "nowa technolog", "nowy framework", "nowy jezyk", "nowa technologia", "nieznan", "dostosowa", "ciekawos", "strefa komfortu", "strefy komfortu", "samouk",
    ],
  },
  deadline: {
    about: "delivering under time pressure",
    keys: [
      "deadline", "tight timeline", "tight schedule", "under pressure", "time pressure", "urgent", "ahead of schedule", "on time", "short notice", "prioriti",
      "termin", "presj", "napiety harmonogram", "pilne", "pilny", "przed terminem", "na czas", "priorytet",
    ],
  },
  improvement: {
    about: "spotting a gap and fixing it before anyone asked",
    keys: [
      "improve", "improvement", "simplif", "innovat", "invent", "better way", "streamline", "automate", "automation", "process improvement", "standardi", "root cause", "technical debt", "tech debt",
      "popraw", "ulepsz", "uproszcz", "innowac", "usprawnien", "automatyz", "standaryz", "przyczyn zrodlow", "dlug techniczny", "lepszy sposob", "lepsze rozwiazanie",
    ],
  },
  incident: {
    about: "production incidents, security issues, emergency work",
    keys: [
      "incident", "outage", "production issue", "production bug", "hotfix", "security", "vulnerab", "emergency", "on-call", "on call", "critical bug", "crisis", "weekend", "after hours",
      "incydent", "awari", "blad na produkcji", "problem na produkcji", "produkcyjn", "bezpieczenstw", "podatnos", "dyzur", "kryzys", "po godzinach", "krytyczn",
    ],
  },
  tooling: {
    about: "internal tools, shared libraries, developer experience, open source",
    keys: [
      "tooling", "internal tool", "library", "package", "developer experience", "developer productivity", "platform", "open source", "open-source", "framework you built", "you built", "you ve built", "sdk", "cli ",
      "narzedzi", "biblioteka", "bibliotek", "pakiet", "platform", "open source", "opensource", "produktywnos", "komfort pracy deweloper", "zbudowal", "stworzyl",
    ],
  },
  "customer-impact": {
    about: "work judged by what it did for users or the business",
    keys: [
      "customer", "user experience", "end user", "product thinking", "business impact", "business value", "business need", "revenue", "conversion",
      "klient", "uzytkownik", "doswiadczenie uzytkownik", "wplyw na biznes", "wartosc biznes", "potrzeby biznes", "przychod", "konwersj",
    ],
  },
  ai: {
    about: "AI tools or AI-assisted work",
    keys: [
      "ai ", "ai-", "artificial intelligence", "llm", "copilot", "chatgpt", "claude", "machine learning", "prompt", "generative", "agent",
      "sztuczna inteligencj", "sztucznej inteligencji", "uczenie maszynowe", "uczeniem maszynowym", "agentow", "agenci",
    ],
  },
  achievement: {
    about: "the work the person is proudest of",
    keys: [
      "proud", "achievement", "accomplish", "biggest success", "greatest", "best work", "impact you had", "most significant", "impressive",
      "dum", "osiagni", "sukces", "najlepsz", "najbardziej znaczac", "imponuj", "z czego jestes", "z ktorego jestes",
    ],
  },
  migration: {
    about: "rewrites, upgrades and moving a system from one stack to another",
    keys: [
      "migrat", "rewrite", "rewrote", "legacy", "refactor", "modernis", "moderniz", "upgrade", "replatform",
      "migrac", "przepis", "refaktor", "modernizac", "aktualizac", "uaktualni",
    ],
  },
  teamwork: {
    about: "working across roles or teams to get something done",
    keys: [
      "teamwork", "collaborat", "cross-functional", "cross functional", "work with others", "work in a team", "across teams", "communication", "stakeholders",
      "wspolpra", "miedzyzespol", "praca w zespole", "pracy w zespole", "komunikac", "wspolnie z",
    ],
  },
  "outside-work": {
    about: "interests and projects outside the day job",
    keys: [
      "passion", "hobby", "hobbies", "outside of work", "outside work", "free time", "interests", "side project", "side projects", "spare time",
      "pasj", "poza praca", "wolny czas", "wolnym czasie", "czasie wolnym", "zainteresowan", "projekt poboczny", "projekty poboczne",
    ],
  },
};

export const THEME_IDS = Object.keys(THEMES);

// "Tell me about yourself" style questions are answered from about[], not from a
// STAR story; find() points at them when one of these hits.
const ABOUT_KEYS = [
  "about yourself", "about you ", "introduce yourself", "your background", "your bio", "bio ", "short bio", "summary of yourself", "describe yourself", "tell us about you", "who are you", "professional summary",
  "o sobie", "przedstaw sie", "opowiedz o sobie", "bio w pigulce", "twoje bio", "kim jestes", "krotko o sobie", "opisz siebie", "twoj background",
];

const padded = (s) => ` ${fold(s).replace(/[^a-z0-9+#.\- ]/g, " ").replace(/\s+/g, " ")} `;
const hit = (text, key) => text.includes(` ${fold(key)}`);

/** Themes a question touches, with how many keys hit each (more hits = stronger). */
export function themesFor(question) {
  const text = padded(question);
  const hits = {};
  for (const [id, { keys }] of Object.entries(THEMES)) {
    let n = 0;
    for (const k of keys) if (hit(text, k)) n++;
    if (n) hits[id] = n;
  }
  return hits;
}

export function looksLikeAbout(question) {
  const text = padded(question);
  return ABOUT_KEYS.some((k) => hit(text, k));
}

/** True when `word` (a story's stack entry) is named in the question. */
export function mentions(question, word) {
  return hit(padded(question), word);
}
