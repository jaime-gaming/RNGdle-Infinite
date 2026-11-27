// Stable receipts and exclusive UTC windows: rotations are never repeatable farms.
const day = (n) => Date.UTC(2026, 11, n);
export const WINTER_EXTRA_GATHERINGS = [
  {
    id: "tree-lighting",
    name: "Light the village tree",
    description: "Find six different final digits to light six branches.",
    metric: "digits",
    goal: 6,
    start: day(1),
    end: Date.UTC(2026, 11, 4, 18),
    coins: 10,
    boost: "boost-spark",
    charges: 1,
    motif: "tree",
  },
  {
    id: "sleigh-post",
    name: "Sleigh post",
    description:
      "Deliver 24 odd-numbered main rolls along the northbound route.",
    metric: "odd",
    goal: 24,
    start: day(7),
    end: Date.UTC(2026, 11, 11, 18),
    coins: 12,
    boost: "boost-spark",
    charges: 1,
    motif: "parcel",
  },
  {
    id: "winter-bakery",
    name: "Gingerbread kitchen",
    description:
      "Collect sugar, spice, cocoa and ginger. Each main roll brings an ingredient, selected by its final digit modulo four.",
    metric: "ingredients",
    goal: 4,
    start: day(14),
    end: Date.UTC(2026, 11, 18, 18),
    coins: 10,
    boost: "boost-surge",
    charges: 1,
    motif: "cookie",
  },
  {
    id: "ribbon-workshop",
    name: "Ribbon workshop",
    description:
      "Find 16 main rolls with adjacent matching digits, such as 122540. No leading zeroes are added.",
    metric: "pairs",
    goal: 16,
    start: day(21),
    end: day(24),
    coins: 12,
    boost: "boost-spark",
    charges: 1,
    motif: "parcel",
  },
  {
    id: "christmas-feast",
    name: "Christmas feast",
    description:
      "Set the table with 30 main online rolls. Every number counts.",
    metric: "rolls",
    goal: 30,
    start: day(24),
    end: day(27),
    coins: 16,
    boost: "boost-surge",
    charges: 1,
    motif: "cookie",
  },
  {
    id: "snow-lanterns",
    name: "Lantern walk",
    description:
      "Light 18 lanterns with main numbers containing a zero. No leading zeroes are added.",
    metric: "zero",
    goal: 18,
    start: day(27),
    end: Date.UTC(2026, 11, 31, 18),
    coins: 12,
    boost: "boost-spark",
    charges: 1,
    motif: "lantern",
  },
  {
    id: "first-sunrise",
    name: "First sunrise",
    description:
      "Welcome the new year with 20 main online rolls. Every number counts.",
    metric: "rolls",
    goal: 20,
    start: Date.UTC(2027, 0, 1, 2),
    end: day(33),
    coins: 8,
    boost: "boost-spark",
    charges: 1,
    motif: "tree",
  },
].map((item) => ({ ...item, reward: null, group: "gathering" }));

const COMMISSIONS = [
  [
    "pine-route",
    "Pine route",
    "Settle 24 main online rolls.",
    "rolls",
    24,
    "tree",
  ],
  [
    "even-parcels",
    "Even parcels",
    "Deliver 16 even-numbered main rolls.",
    "even",
    16,
    "parcel",
  ],
  [
    "bell-trios",
    "Bell trios",
    "Find 12 main numbers divisible by three.",
    "thirds",
    12,
    "bell",
  ],
  [
    "pantry-list",
    "Pantry list",
    "Collect the four kitchen ingredients from final digits modulo four.",
    "ingredients",
    4,
    "cookie",
  ],
  [
    "odd-postcodes",
    "Odd postcodes",
    "Deliver 16 odd-numbered main rolls.",
    "odd",
    16,
    "parcel",
  ],
  [
    "matching-ribbons",
    "Matching ribbons",
    "Find 12 main numbers with adjacent matching digits.",
    "pairs",
    12,
    "parcel",
  ],
  [
    "snowy-route",
    "Snowy route",
    "Find 12 main numbers containing a zero.",
    "zero",
    12,
    "lantern",
  ],
  [
    "last-lights",
    "Last lights",
    "Collect seven different final digits.",
    "digits",
    7,
    "bell",
  ],
];
export const WINTER_ROTATIONS = COMMISSIONS.map(
  ([id, name, description, metric, goal, motif], i) => ({
    id: `commission-${id}`,
    name,
    description,
    metric,
    goal,
    motif,
    group: "rotation",
    start: day(1 + i * 4),
    end: day(5 + i * 4),
    reward: null,
    coins: 6,
    boost: "boost-spark",
    charges: 1,
  }),
);
export const WINTER_INGREDIENTS = ["Sugar", "Spice", "Cocoa", "Ginger"];
export function winterRollMatches(metric, number) {
  switch (metric) {
    case "rolls":
      return true;
    case "even":
      return number % 2 === 0;
    case "odd":
      return number % 2 !== 0;
    case "high":
      return number >= 500000;
    case "thirds":
      return number % 3 === 0;
    case "zero":
      return String(number).includes("0");
    case "pairs":
      return /(\d)\1/.test(String(number));
    default:
      return false;
  }
}
export function winterSchedule(events, now) {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  return {
    active: sorted.filter((event) => now >= event.start && now < event.end),
    upcoming: sorted.filter((event) => now < event.start),
    ended: sorted.filter((event) => now >= event.end),
  };
}
