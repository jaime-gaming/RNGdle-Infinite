import hints from "./data/diagram-hints.json" with { type: "json" };

// Presentation helpers only: badges are awarded by the full-range membership
// index. These locate concrete digits supporting a badge; they never affect EP.
const indices = (values) => ({ type: "indices", indices: values });
const range = (start, end) => ({ type: "range", start, end });
const groups = (values) => ({ type: "groups", groups: values });
const positions = (start, end) =>
  Array.from({ length: end - start }, (_, i) => start + i);
const ALL = new Set([
  "HEAVY",
  "FEATHER",
  "VOID",
  "TURTLE",
  "HILLS",
  "DUNES",
  "BINARY_SOUL",
  "DUALITY",
  "TRINITY",
  "QUARTET",
  "HETEROGENEOUS",
  "HOMOGENEOUS",
  "ALTERNATOR",
  "ZIPPER",
  "SPY",
  "BLACKJACK",
]);
const ENDS = new Set([
  "GROUNDED",
  "LIFTOFF",
  "EQUILIBRIUM",
  "SANDWICH",
  "GAP_ONE",
]);

function partitions(text, start = 0, end = text.length) {
  const out = [];
  function walk(at, parts) {
    if (at === end) {
      out.push(parts);
      return;
    }
    for (let next = at + 1; next <= end; next++) {
      const raw = text.slice(at, next);
      if (raw.length > 1 && raw[0] === "0") break;
      walk(next, [
        ...parts,
        { value: Number(raw), positions: positions(at, next) },
      ]);
    }
  }
  walk(start, []);
  return out;
}
export function findEquation(number) {
  for (const parts of partitions(String(number)).filter(
    (p) => p.length === 3,
  )) {
    const [a, b, c] = parts.map((p) => p.value);
    const op =
      a + b === c
        ? "+"
        : a - b === c
          ? "-"
          : a * b === c
            ? "*"
            : b !== 0 && a / b === c
              ? "/"
              : null;
    if (op)
      return {
        numbers: [a, b, c],
        op,
        positions: parts.map((p) => p.positions),
      };
  }
  return null;
}
export function getContributors(badge, number, equation = null) {
  const s = String(number),
    n = s.length,
    digits = [...s].map(Number),
    all = positions(0, n),
    id = badge.id;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    if (!counts.has(s[i])) counts.set(s[i], []);
    counts.get(s[i]).push(i);
  }
  const match = (pattern) => {
    const start = s.indexOf(pattern);
    return start < 0 ? null : range(start, start + pattern.length);
  };
  if (hints[id] === "whole") return { type: "whole" };
  if (ALL.has(id)) return indices(all);
  if (ENDS.has(id)) return indices([...new Set([0, n - 1])]);
  if (["EVEN", "ODD", "CLEAN", "SEMI_CLEAN"].includes(id))
    return indices([n - 1]);
  if (["BOOKENDS", "MIRROR_BOOKENDS", "PAIRED_BOOKENDS"].includes(id))
    return indices(
      [...new Set([0, 1, n - 2, n - 1])].filter((i) => i >= 0 && i < n),
    );
  if (["MOUNTAIN", "VALLEY", "MESA", "CANYON"].includes(id)) {
    const extreme = ["MOUNTAIN", "MESA"].includes(id)
      ? Math.max(...digits)
      : Math.min(...digits);
    return indices(all.filter((i) => digits[i] === extreme));
  }
  if (id === "FIREFLY")
    return indices(all.filter((i) => counts.get(s[i]).length === 1));
  if (id === "EQUATION") return equation ? groups(equation.positions) : null;
  if (id.startsWith("FRAMED_")) return range(1, n - 1);
  if (id === "ULTIMEME")
    return groups(
      ["69", "420"].map((p) =>
        positions(s.indexOf(p), s.indexOf(p) + p.length),
      ),
    );
  const exactlyOne = badge.description.match(/Contains exactly one "(\d)"/);
  if (exactlyOne) return indices(all.filter((i) => s[i] === exactlyOne[1]));
  if (id === "LUCKY_7") return indices(all.filter((i) => s[i] === "7"));
  const literal = badge.description.match(
    /^Contains (?:the number )?"?(\d+)(?:"|\.| \()/,
  );
  if (literal) return match(literal[1]);
  const suffix = badge.description.match(/^Ends in "?(\d+)/);
  if (suffix) return range(n - suffix[1].length, n);
  const zeros = { CENTURY: 2, MILLENNIUM: 3, EPOCH: 4, EON: 5 };
  if (zeros[id]) return range(n - zeros[id], n);
  const sevens = {
    LUCKY_7: 1,
    JACKPOT: 3,
    JACKPOT_FOUR: 4,
    JACKPOT_FIVE: 5,
    JACKPOT_SIX: 6,
  };
  if (sevens[id]) return match("7".repeat(sevens[id]));
  const runLength = {
    CONTIGUOUS_TRIPS: 3,
    CONTIGUOUS_QUADS: 4,
    CONTIGUOUS_FIVES: 5,
    CONTIGUOUS_SIXES: 6,
    CONTIGUOUS_PAIR: 2,
  }[id];
  if (runLength) {
    for (let i = 0; i <= n - runLength; i++)
      if ([...s.slice(i, i + runLength)].every((c) => c === s[i]))
        return range(i, i + runLength);
  }
  if (
    [
      "PAIR",
      "TWO_PAIR",
      "THREE_PAIR",
      "TRIPS",
      "QUADS",
      "FIVE_OF_A_KIND",
      "BOAT",
      "SNAKE_EYES",
    ].includes(id)
  ) {
    const amount = { TRIPS: 3, QUADS: 4, FIVE_OF_A_KIND: 5 }[id];
    if (amount) {
      const group = [...counts.values()].find((g) => g.length >= amount);
      return group ? indices(group) : null;
    }
    if (id === "SNAKE_EYES") return indices(counts.get("1") || []);
    if (id === "BOAT")
      return indices(
        all.filter((i) => [2, 3].includes(counts.get(s[i]).length)),
      );
    const pairs = [...counts.values()]
      .filter((g) => (id === "PAIR" ? g.length === 2 : g.length >= 2))
      .slice(0, { PAIR: 1, TWO_PAIR: 2, THREE_PAIR: 3 }[id]);
    return pairs.length ? indices(pairs.flat().sort((a, b) => a - b)) : null;
  }
  if (
    [
      "CONTIGUOUS_TWO_PAIR",
      "CONTIGUOUS_THREE_PAIR",
      "CONTIGUOUS_BOAT",
    ].includes(id)
  ) {
    const lengths =
      id === "CONTIGUOUS_BOAT"
        ? [
            [3, 2],
            [2, 3],
          ]
        : [Array(id === "CONTIGUOUS_TWO_PAIR" ? 2 : 3).fill(2)];
    for (const lens of lengths)
      for (
        let start = 0;
        start <= n - lens.reduce((a, b) => a + b, 0);
        start++
      ) {
        let at = start;
        const runs = lens.map((len) => {
          const part = s.slice(at, at + len);
          at += len;
          return part;
        });
        if (
          runs.every((p) => [...p].every((c) => c === p[0])) &&
          new Set(runs.map((p) => p[0])).size === runs.length
        )
          return range(start, at);
      }
  }
  if (["HOPSCOTCH", "DOUBLE_HOP"].includes(id)) {
    const length = id === "DOUBLE_HOP" ? 3 : 2;
    for (let start = 0; start < n; start++) {
      const p = Array.from({ length }, (_, i) => start + i * 2);
      if (p.at(-1) < n && p.every((i) => s[i] === s[start])) return indices(p);
    }
  }
  if (
    [
      "STRAIGHT",
      "STRAIGHT_FLUSH",
      "ROYAL_FLUSH",
      "SEQUENCE_3",
      "SEQUENCE_4",
      "SEQUENCE_6",
    ].includes(id)
  ) {
    if (id === "ROYAL_FLUSH") return match("56789");
    if (id === "STRAIGHT_FLUSH") {
      for (const p of ["02468", "13579", "86420", "97531"]) {
        const found = match(p);
        if (found) return found;
      }
    }
    const length = id === "STRAIGHT" ? 5 : Number(id.at(-1));
    for (let start = 0; start <= n - length; start++)
      for (const step of [-1, 1])
        if (
          digits
            .slice(start + 1, start + length)
            .every((v, i) => v === digits[start + i] + step)
        )
          return range(start, start + length);
  }
  if (id === "MINI_SCRAMBLE") {
    for (let length = n; length >= 3; length--)
      for (let start = 0; start <= n - length; start++) {
        const p = digits.slice(start, start + length).sort((a, b) => a - b);
        if (p.slice(1).every((v, i) => v === p[i] + 1))
          return range(start, start + length);
      }
  }
  if (id === "NEIGHBORS") {
    for (let i = 0; i < n - 1; i++)
      if (Math.abs(digits[i] - digits[i + 1]) === 1) return range(i, i + 2);
    return null;
  }
  if (id === "POCKET_MIRROR") {
    for (let length = n; length >= 4; length--)
      for (let start = 0; start <= n - length; start++) {
        const p = s.slice(start, start + length);
        if (p === [...p].reverse().join(""))
          return range(start, start + length);
      }
  }
  if (id === "MINI_ECHO") {
    for (let start = 0; start <= n - 4; start++)
      if (s.slice(start, start + 2) === s.slice(start + 2, start + 4))
        return range(start, start + 4);
  }
  if (id === "RHYME") {
    for (let length = Math.floor(n / 2); length >= 2; length--)
      for (let i = 0; i <= n - length * 2; i++) {
        const j = s.indexOf(s.slice(i, i + length), i + length);
        if (j >= 0)
          return groups([positions(i, i + length), positions(j, j + length)]);
      }
  }
  if (id === "CONSEC_PAIR_NEARBY") {
    // Supporting substrings must be separated, and not just two single digits.
    for (let start = 0; start < n; start++)
      for (let end = start + 1; end < n; end++) {
        const left = s.slice(start, end);
        if (left.length > 1 && left[0] === "0") continue;
        for (let second = end + 1; second < n; second++)
          for (let stop = second + 1; stop <= n; stop++) {
            const right = s.slice(second, stop);
            if (right.length > 1 && right[0] === "0") continue;
            const a = Number(left),
              b = Number(right);
            if (Math.max(a, b) >= 10 && Math.abs(a - b) === 1)
              return groups([positions(start, end), positions(second, stop)]);
          }
      }
    return null;
  }
  if (id.startsWith("CONSEC_") || ["ARITHMETIC", "GEOMETRIC"].includes(id)) {
    const exact =
      id.includes("EXACT") ||
      id.includes("SCRAMBLED") ||
      ["ARITHMETIC", "GEOMETRIC"].includes(id);
    const required = id.includes("QUAD")
      ? 4
      : id.includes("TRIPLE")
        ? 3
        : id.includes("PAIR")
          ? 2
          : 0;
    for (let start = 0; start < (exact ? 1 : n); start++)
      for (let end = exact ? n : start + 2; end <= n; end++) {
        for (const parts of partitions(s, start, end)) {
          if (required ? parts.length !== required : parts.length < 3) continue;
          const values = parts.map((p) => p.value),
            ordered = id.includes("SCRAMBLED")
              ? [...values].sort((a, b) => a - b)
              : values;
          let matches;
          if (id === "ARITHMETIC")
            matches = values
              .slice(1)
              .every((v, i) => v - values[i] === values[1] - values[0]);
          else if (id === "GEOMETRIC")
            matches =
              values[0] > 0 &&
              values
                .slice(1)
                .every(
                  (v, i) =>
                    values[i] > 0 && v / values[i] === values[1] / values[0],
                );
          else matches = ordered.slice(1).every((v, i) => v === ordered[i] + 1);
          if (matches) return groups(parts.map((p) => p.positions));
        }
        if (exact) break;
      }
  }
  // Omit a diagram when no concrete supporting digits can be established.
  return null;
}
