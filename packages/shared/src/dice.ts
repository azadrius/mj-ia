/**
 * Jets de dés : "1d20+5", "2d6 + 1d4 - 1", "2d20kh1" (avantage), "2d20kl1" (désavantage), "4d6kh3".
 */

export interface DiceTerm {
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: "kh" | "kl"; n: number };
}

export interface DiceRoll {
  formula: string;
  /** Détail par groupe de dés : valeurs tirées et valeurs gardées. */
  groups: { notation: string; rolls: number[]; kept: number[]; sign: 1 | -1 }[];
  modifier: number;
  total: number;
}

const TERM = /([+-])?\s*(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gi;

export function parseDice(formula: string): { dice: DiceTerm[]; modifier: number } {
  const clean = formula.replace(/\s+/g, "").toLowerCase();
  if (!clean || !/^[+-]?(\d*d\d+((kh|kl)\d+)?|\d+)([+-](\d*d\d+((kh|kl)\d+)?|\d+))*$/.test(clean)) {
    throw new Error(`Formule de dés invalide : « ${formula} »`);
  }
  const dice: DiceTerm[] = [];
  let modifier = 0;
  for (const m of clean.matchAll(TERM)) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) {
      modifier += sign * Number(m[6]);
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const sides = Number(m[3]);
    if (count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error("Trop de dés ou dé impossible");
    const term: DiceTerm = { sign, count, sides };
    if (m[4]) {
      const n = Number(m[5]);
      if (n < 1 || n > count) throw new Error("Nombre de dés gardés invalide");
      term.keep = { mode: m[4] as "kh" | "kl", n };
    }
    dice.push(term);
  }
  if (dice.length > 20) throw new Error("Trop de groupes de dés");
  return { dice, modifier };
}

export function rollDice(formula: string, random: () => number = Math.random): DiceRoll {
  const { dice, modifier } = parseDice(formula);
  let total = modifier;
  const groups = dice.map((term) => {
    const rolls = Array.from({ length: term.count }, () => 1 + Math.floor(random() * term.sides));
    let kept = rolls;
    if (term.keep) {
      const sorted = [...rolls].sort((a, b) => (term.keep!.mode === "kh" ? b - a : a - b));
      kept = sorted.slice(0, term.keep.n);
    }
    total += term.sign * kept.reduce((a, b) => a + b, 0);
    const keep = term.keep ? `${term.keep.mode}${term.keep.n}` : "";
    return { notation: `${term.count}d${term.sides}${keep}`, rolls, kept, sign: term.sign };
  });
  return { formula: formula.trim(), groups, modifier, total };
}

/** "1d20+5 → [14] + 5 = 19" */
export function describeRoll(roll: DiceRoll): string {
  const parts = roll.groups.map((g, i) => {
    const values = g.rolls.length === g.kept.length ? g.rolls.join(", ") : `${g.rolls.join(", ")} → ${g.kept.join(", ")}`;
    return `${i === 0 && g.sign === 1 ? "" : g.sign === 1 ? " + " : " - "}[${values}]`;
  });
  const mod = roll.modifier ? ` ${roll.modifier > 0 ? "+" : "-"} ${Math.abs(roll.modifier)}` : "";
  return `${roll.formula} → ${parts.join("")}${mod} = ${roll.total}`;
}
