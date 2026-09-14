import metadata from "./data/badge-metadata.json";
// Catalogue labels and rarities from rng.cubityfir.st/badges.
// Catalogue odds are counted over the full-range badge membership index.
const groups = {
  "The Casino": `👯|Pair|Common;🫂|Contiguous Pair|Common;👯‍♀️|Two Pair|Common;👨‍👩‍👧‍👦|Contiguous Two Pair|Uncommon;👯‍♀️👯|Three Pair|Rare;👨‍👩‍👧‍👦👯|Contiguous Three Pair|Epic;🎰|Three of a Kind|Common;➖|Contiguous Trips|Uncommon;🍀|Four of a Kind|Uncommon;🏠|Full House|Uncommon;🏰|Contiguous Full House|Rare;📏|Straight|Epic;🎨|Flush|Uncommon;🃏|Straight Flush|Anomaly;👑|Royal Flush|Anomaly;🃏|Five of a Kind|Epic;📉|Low Ball|Uncommon;🤑|High Roller|Uncommon;🎲|Snake Eyes|Uncommon;♠️|Blackjack|Uncommon`,
  "Lucky Sevens": `🎰|Lucky Seven (Divisible)|Common;7️⃣|Lucky Seven|Common;💰|Jackpot|Rare;💰|Exact Jackpot|Mythic;💰💰|Jackpot Four|Epic;💰💰💰|Jackpot Five|Anomaly;🏦|Jackpot Six|Mythic;7️⃣|Power of Seven|Mythic`,
  "Deep Space": `🟦|2nd Power|Rare;🧊|3rd Power|Epic;📦|4th Power|Anomaly;🖐️|5th Power|Anomaly;🎲|6th Power|Anomaly;🌈|7th Power|Mythic;🎱|8th Power|Mythic;☁️|9th Power|Mythic;🔟|10th Power|Mythic;🐚|Fibonacci Number|Anomaly;💾|Power of Two|Anomaly;🔺|Power of Three|Anomaly;5️⃣|Power of Five|Mythic;7️⃣|Power of Seven|Mythic;🐍|Ouroboros|Mythic;❗|Factorial|Mythic;🤝|Harshad Number|Uncommon;🕵️|Spy Number|Anomaly;🧮|Pronic Number|Epic`,
  "Sacred Geometry": `📣|Echo|Epic;🔂|Mini Echo|Uncommon;🎶|Rhyme|Uncommon;🥪|Sandwich|Uncommon;📚|Bookends|Rare;📈|Ascension|Epic;📉|Decay|Epic;🪜|Steps|Rare;🛝|Slopes|Rare;🌊|Cascade|Anomaly;🚿|Waterfall|Anomaly;🏔️|Mountain|Uncommon;🏜️|Valley|Uncommon;🏞️|Hills|Common;🗻|Mesa|Uncommon;🌄|Canyon|Uncommon;🐫|Dunes|Common;🪞|Pocket Mirror|Uncommon;🧩|Mini Scramble|Common;🪟|Framed Quad|Epic;🐢|Turtle|Rare;⚡|Alternator|Uncommon;🤐|Zipper|Epic;🪞|Palindrome|Rare;📖|Mirror Bookends|Rare;👐|Paired Bookends|Rare;⚖️|Balanced|Uncommon;🙃|Strobogrammatic|Epic;🪲|Firefly|Rare`,
  "Meme Culture": `😏|Nice|Uncommon;😏|Exact Nice|Mythic;🥵|Very Nice|Epic;😏|Very Very Nice|Mythic;🌿|Botanist|Rare;🌿|Exact Botanist|Mythic;🌿|Hotbox|Mythic;😈|Devil|Rare;😈|Exact Devil|Mythic;💻|Leet|Epic;💻|Exact Leet|Mythic;🌌|Meaning of Life|Uncommon;🌌|Exact Meaning|Mythic;🌌|Deeper Meaning|Epic;🌌|Universal Answer|Mythic;🫠|Six-Seven|Uncommon;🫠|Exact Six-Seven|Mythic;🫠|6767|Epic;🫠|Brainrot|Mythic;👁️|Big Brother|Epic;👁️|Orwellian|Mythic;🕶️|Secret Agent|Rare;😂|Funny Numbers|Anomaly;😂|Funny Number|Mythic;🚫|Not Found|Mythic;🔱|Infernal|Mythic;🏈|17776|Mythic`,
  "Calculator Words": `🔥|Hell|Epic;👹|Exact Hell|Mythic;🍈|Exact Boob|Mythic;👋|Hello|Mythic`,
  "The Void": `🕳️|Void|Common;👻|Ghost|Common;🕳️|Deep Void|Uncommon;🌑|Deep Void (3)|Rare;🌌|Deep Void (4)|Epic;⚫|Deep Void (5)|Mythic;🧼|Clean|Uncommon;💯|Century|Rare;🗓️|Millennium|Epic;🏛️|Epoch|Anomaly;🗿|Eon|Mythic`,
  Flatliners: `➖|Contiguous Trips|Uncommon;➖➖|Contiguous Quads|Rare;➖➖➖|Contiguous Fives|Epic;➖➖➖➖|Contiguous Sixes|Mythic;🥛|Homogeneous|Anomaly`,
  "Exact Numbers": `😏|Exact Nice|Mythic;🌿|Exact Botanist|Mythic;😈|Exact Devil|Mythic;🚑|Exact Emergency|Mythic;💻|Exact Leet|Mythic;🌌|Exact Meaning|Mythic;💰|Exact Jackpot|Mythic;👹|Exact Hell|Mythic;🍈|Exact Boob|Mythic;🫠|Exact Six-Seven|Mythic;🍽️|Exact Eighty-Six|Mythic;🧭|Exact Orientation|Mythic;📅|Exact Calendar|Mythic;😏|Very Very Nice|Mythic;🌿|Hotbox|Mythic;🚑|Mayday|Mythic;🌌|Universal Answer|Mythic;🫠|Brainrot|Mythic;📅|Groundhog Day|Mythic;👁️|Orwellian|Mythic;🚫|Not Found|Mythic;🔱|Infernal|Mythic;🏈|17776|Mythic;♾️|Always|Mythic;⏳|Full Day|Mythic;😂|Funny Number|Mythic;🌀|Tau|Mythic;🐚|Golden Ratio|Mythic`,
  "Periodic Table": `💧|Hydrogen (1)|Common;🎈|Helium (2)|Common;🔋|Lithium (3)|Common;💎|Beryllium (4)|Common;🧼|Boron (5)|Common;✏️|Carbon (6)|Common;❄️|Nitrogen (7)|Common;💨|Oxygen (8)|Common;🦷|Fluorine (9)|Common`,
  "Digit Counts": `☝️|Single Digit|Mythic;✌️|Two Digits|Anomaly;🤟|Three Digits|Epic;🍀|Four Digits|Rare;🖐️|Five Digits|Uncommon;🐝|Six Digits|Common`,
  "Mathematical Constants": `🥧|Pi|Mythic;📈|Euler's Number|Mythic;🌀|Tau|Mythic;🌀|Tau Slice (4)|Epic;🌀|Tau Slice (5)|Anomaly;🐚|Golden Ratio|Mythic;🐚|Fibonacci Number|Anomaly;💎|Prime Number|Uncommon`,
  "Basic Physics": `⚖️|Even|Common;🦄|Odd|Common;🪶|Feather|Uncommon;🧱|Heavy|Rare;⚓|Grounded|Common;🚀|Liftoff|Common;🧘|Equilibrium|Uncommon;🪨|Colossal|Epic`,
  Counting: `⛓️|4 Consecutive Numbers|Mythic;🔀|4 Consecutive Numbers (Scrambled)|Anomaly;🔗|4 Consecutive Numbers (Contains)|Anomaly;⛓️|3 Consecutive Numbers|Epic;🔀|3 Consecutive Numbers (Scrambled)|Epic;🔗|3 Consecutive Numbers (Contains)|Epic;🔗|2 Consecutive Numbers|Rare;🔗|2 Consecutive Numbers (Contains)|Uncommon;🔗|2 Consecutive Numbers (Nearby)|Uncommon;🎼|Metronome|Rare;🔊|Crescendo|Epic;🟰|Equation|Uncommon`,
  "Emergency Services": `🚑|Emergency|Rare;🚑|Exact Emergency|Mythic;🚑|Mayday|Mythic;🚫|Error 404|Rare;🚫|Not Found|Mythic`,
  "On the Clock": `📅|Calendar|Rare;📅|Exact Calendar|Mythic;📅|Groundhog Day|Mythic;⏳|Full Day|Mythic;♾️|Always|Mythic`,
  "No Set": `🧹|Semi-Clean|Uncommon;🍩|Dozen|Uncommon;🕚|Eleven|Uncommon;🤖|Binary Soul|Anomaly;☯️|Duality|Rare;⚜️|Trinity|Uncommon;🎻|Quartet|Common;🥗|Heterogeneous|Common;🦘|Hopscotch|Common;🦘🦘|Double Hop|Uncommon;🖼️|Framed Pair|Epic;🖼️🖼️|Framed Triple|Epic;🖼️🖼️🖼️|Framed Double|Rare;🕚|11th Power|Mythic;💀|13th Power|Mythic;🧙|17th Power|Mythic;🌑|19th Power|Mythic;🔢|8008|Epic;🔠|58008|Anomaly;🅱️|80085|Anomaly;💎|Exact 80085|Mythic;🔢|Sequence (3)|Uncommon;🔢|Sequence (4)|Rare;🔢|Sequence (6)|Mythic;🔀|Scramble|Rare;🏘️|Neighbors|Common;↕️|Gap One|Common;0️⃣|Zero|Mythic;1️⃣|One|Mythic;2️⃣|Two|Mythic;3️⃣|Three|Mythic;4️⃣|Four|Mythic;5️⃣|Five|Mythic;6️⃣|Six|Mythic;7️⃣|Seven|Mythic;8️⃣|Eight|Mythic;9️⃣|Nine|Mythic;🎈|Double Nine|Rare;🎉|Triple Nine|Epic;🎊|Quad Nine|Anomaly;🥳|Quint Nine|Mythic;📏|Even Spacing|Epic;📐|Even Spacing (Absolute)|Rare;🔺|Divisible by Three|Rare;🥧|Pi Slice (3)|Rare;🥧|Pi Slice (4)|Epic;🥧|Pi Slice (5)|Anomaly;📈|E Slice (3)|Rare;📈|E Slice (4)|Epic;📈|E Slice (5)|Anomaly;🪙|Quarter-Century|Rare;🗓️|Semi-Century|Rare;🕰️|Three-Quarter Century|Rare;📜|Semi-Millennium|Epic;⌛|Semi-Epoch|Anomaly;🦴|Semi-Eon|Mythic;🍽️|Eighty-Six|Uncommon;🧭|Orientation|Rare;🐐|One Million|Mythic`,
};
const catalogue = new Map();
for (const [group, entries] of Object.entries(groups)) {
  for (const entry of entries.split(";")) {
    const [emoji, name, rarity] = entry.split("|");
    if (catalogue.has(name)) catalogue.get(name).groups.push(group);
    else
      catalogue.set(name, {
        emoji,
        name,
        rarity,
        groups: [group],
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/_$/, ""),
      });
  }
}
for (const record of metadata) {
  const badge = catalogue.get(record.name);
  if (badge)
    Object.assign(badge, {
      canonicalId: record.id,
      description: record.description,
      ep: record.ep,
      probability: record.probability,
      matchingNumbers: record.matchingNumbers,
      probabilityPercent: record.probabilityPercent,
      family: record.family,
    });
}
export const badges = [...catalogue.values()];
export const badgeGroups = Object.keys(groups);
export const rarities = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Anomaly",
  "Mythic",
];
export const featuredBadges = [
  "Exact Leet",
  "Leet",
  "Framed Pair",
  "Steps",
  "Four Digits",
  "Flush",
  "Feather",
].map((name) => catalogue.get(name));
