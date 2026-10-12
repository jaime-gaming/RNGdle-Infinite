// CLEANUP Nov 4, 2026: retire the expedition and its temporary prediction stats.
// Discoveries come from saved, secure world numbers. No extra RNG, EP or odds
// modifier is involved, and nothing here unlocks Hexbound without actual 6666.
export const WORLD_PLACES = [
  {
    id: "pumpkin-patch",
    name: "Pumpkin Patch",
    short: "The patch",
    icon: "pumpkin",
    color: "#fb923c",
    line: "The pumpkins whisper your number. One insists it is actually a very small dragon.",
  },
  {
    id: "whispering-woods",
    name: "Whispering Woods",
    short: "The woods",
    icon: "leaf",
    color: "#5eead4",
    line: "A fox made of mist steals your shadow, then returns it. Apparently it did not fit.",
  },
  {
    id: "crooked-library",
    name: "Crooked Library",
    short: "The library",
    icon: "book",
    color: "#c4b5fd",
    line: "A book opens itself. Every page says BOO, except the last: please return by midnight.",
  },
  {
    id: "moonlit-crypt",
    name: "Moonlit Crypt",
    short: "The crypt",
    icon: "moon",
    color: "#fda4af",
    line: "The skeleton band welcomes you with a terrible solo. They have excellent rhythm and no lungs.",
  },
  {
    id: "witchfire-bog",
    name: "Witchfire Bog",
    short: "The bog",
    icon: "flame",
    color: "#a3e635",
    line: "A witch offers a potion of incredible luck. It is soup. The numbers remain perfectly honest.",
  },
  {
    id: "clockwork-spire",
    name: "Clockwork Spire",
    short: "The spire",
    icon: "clock",
    color: "#facc15",
    line: "The clock strikes thirteen. A bat in a waistcoat apologises: daylight saving is complicated.",
  },
];
export const WORLD_CURIOS = [
  {
    id: "lantern-wick",
    name: "Everlasting Wick",
    icon: "flame",
    color: "#fb923c",
    line: "A tiny flame that refuses to go out. It is afraid of the dark.",
  },
  {
    id: "grinning-skull",
    name: "Grinning Skull",
    icon: "skull",
    color: "#e2e8f0",
    line: "A pocket-sized skull. Its last joke was in 1342 and it is still waiting for you to laugh.",
  },
  {
    id: "witch-feather",
    name: "Witch's Feather",
    icon: "feather",
    color: "#a3e635",
    line: "It writes its own shopping list. Mostly mushrooms. An alarming number of mushrooms.",
  },
  {
    id: "moon-shard",
    name: "Moon Shard",
    icon: "moon",
    color: "#c4b5fd",
    line: "A little piece of moonlight, cool to the touch. Please do not lick the moon.",
  },
  {
    id: "crooked-key",
    name: "Crooked Key",
    icon: "key",
    color: "#facc15",
    line: "It opens exactly one door. Unfortunately, that door has not been invented yet.",
  },
  {
    id: "ghost-bell",
    name: "Ghost Bell",
    icon: "bell",
    color: "#5eead4",
    line: "You cannot hear it ring. The ghosts can, and they would like you to stop.",
  },
  {
    id: "mossy-coin",
    name: "Mossy Coin",
    icon: "coin",
    color: "#86efac",
    line: "A coin from a forgotten kingdom. A keepsake, not a Pumpkoin; no vending machine accepts it.",
  },
  {
    id: "pocket-bat",
    name: "Pocket Bat",
    icon: "bat",
    color: "#fda4af",
    line: "A bat the size of a button. It has moved in and would like a tiny cape.",
  },
];
export const WORLD_GUESSES = [
  { id: "odd", label: "Odd", hint: "Ends in 1, 3, 5, 7 or 9" },
  { id: "even", label: "Even", hint: "Ends in 0, 2, 4, 6 or 8" },
  { id: "low", label: "Low", hint: "1–4999" },
  { id: "high", label: "High", hint: "5000–9999" },
];
export const worldGuessMatches = (guess, number) =>
  guess === "odd"
    ? number % 2 === 1
    : guess === "even"
      ? number % 2 === 0
      : guess === "low"
        ? number < 5000
        : guess === "high"
          ? number >= 5000
          : false;
export function requireWorldGuess(guess) {
  if (
    guess !== undefined &&
    guess !== null &&
    !WORLD_GUESSES.some(({ id }) => id === guess)
  )
    throw new Error("Choose Odd, Even, Low or High for your prediction.");
}
export function worldPlace(number) {
  return Number.isInteger(number) && number >= 1 && number <= 9999
    ? WORLD_PLACES[Math.min(5, Math.floor(((number - 1) * 6) / 9999))]
    : null;
}
export function worldCurio(number) {
  return worldPlace(number) ? (WORLD_CURIOS[number % 12] ?? null) : null;
}
export function worldDiscoveries(drawn = []) {
  return {
    places: [
      ...new Set(drawn.map((number) => worldPlace(number)?.id).filter(Boolean)),
    ],
    curios: [
      ...new Set(drawn.map((number) => worldCurio(number)?.id).filter(Boolean)),
    ],
  };
}
export function worldGuessChance(drawn, guess) {
  requireWorldGuess(guess);
  if (guess == null) return 0;
  const total = 9999 - drawn.length;
  const original = guess === "odd" || guess === "high" ? 5000 : 4999;
  const matches =
    original -
    drawn.filter((number) => worldGuessMatches(guess, number)).length;
  return total > 0 ? matches / total : 0;
}
export function emptyWorldAdventure() {
  return {
    predictions: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    lastGuess: null,
    lastNumber: null,
  };
}
export function parseWorldAdventure(value, drawn) {
  if (value === undefined) return { adventure: null, repaired: false };
  const fail = () => ({ adventure: emptyWorldAdventure(), repaired: true });
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const { predictions, hits, streak, bestStreak, lastGuess, lastNumber } =
    value;
  if (
    ![predictions, hits, streak, bestStreak].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    predictions > drawn.length ||
    hits > predictions ||
    streak > bestStreak ||
    bestStreak > hits ||
    (hits === 0) !== (bestStreak === 0) ||
    (lastNumber !== null && lastNumber !== drawn.at(-1)) ||
    (lastNumber === null && predictions > 0) ||
    (lastGuess !== null && !WORLD_GUESSES.some(({ id }) => id === lastGuess)) ||
    (lastGuess === null && streak !== 0) ||
    (lastGuess !== null && (lastNumber === null || predictions === 0)) ||
    (lastGuess !== null &&
      worldGuessMatches(lastGuess, lastNumber) !== streak > 0)
  )
    return fail();
  return {
    adventure: { predictions, hits, streak, bestStreak, lastGuess, lastNumber },
    repaired: false,
  };
}
export function recordWorldAdventure(limited, number, guess) {
  requireWorldGuess(guess);
  const previous = limited.adventure ?? emptyWorldAdventure();
  const hit = guess != null && worldGuessMatches(guess, number);
  const streak = hit ? previous.streak + 1 : 0;
  return {
    predictions: previous.predictions + (guess != null ? 1 : 0),
    hits: previous.hits + (hit ? 1 : 0),
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    lastGuess: guess ?? null,
    lastNumber: number,
  };
}
export function worldChapters(limited) {
  const drawn = limited?.drawn ?? [];
  const discoveries = worldDiscoveries(drawn);
  const adventure = limited?.adventure ?? emptyWorldAdventure();
  return [
    {
      id: "first-steps",
      title: "First footsteps",
      detail: "Reveal 10 world numbers",
      count: drawn.length,
      goal: 10,
    },
    {
      id: "six-paths",
      title: "Six crooked paths",
      detail: "Visit every haunted place",
      count: discoveries.places.length,
      goal: WORLD_PLACES.length,
    },
    {
      id: "curio-cabinet",
      title: "Curio cabinet",
      detail: "Find all eight keepsakes",
      count: discoveries.curios.length,
      goal: WORLD_CURIOS.length,
    },
    {
      id: "ghost-whisperer",
      title: "Ghost whisperer",
      detail: "Guess correctly three times in a row",
      count: adventure.bestStreak,
      goal: 3,
    },
  ];
}
export function worldEncounter(limited) {
  const drawn = limited?.drawn ?? [];
  const number = drawn.at(-1);
  const place = worldPlace(number);
  if (!place)
    return {
      title: "The first lantern",
      line: "Take a path into the mist. Every number is a new place to look, and every spirit has a story.",
      fresh: false,
      curio: null,
    };
  const curio = worldCurio(number);
  const previous = worldDiscoveries(drawn.slice(0, -1));
  if (number === 6666)
    return {
      title: "The vow is fulfilled",
      line: "The Reaper bows. Four sixes, six sigils, one permanent Hexbound aura. The hunt can go on, but the prize is yours.",
      fresh: true,
      curio,
      place,
    };
  if (curio)
    return {
      title: previous.curios.includes(curio.id)
        ? `${curio.name}, again!`
        : `Found: ${curio.name}`,
      line: curio.line,
      fresh: !previous.curios.includes(curio.id),
      curio,
      place,
    };
  return {
    title: previous.places.includes(place.id)
      ? `A visitor in ${place.short.toLowerCase()}`
      : `Discovered: ${place.name}`,
    line: place.line,
    fresh: !previous.places.includes(place.id),
    curio: null,
    place,
  };
}
