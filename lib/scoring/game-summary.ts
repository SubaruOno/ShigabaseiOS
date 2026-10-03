import { applyPage, applyPre, batterOf, initState, pitcherOf, type GameState, type Page, type TeamSetup } from "./engine";

// 試合編集の画面に出す集計（BASSの試合編集と同じ項目）
export type PlateAppearance = { team: 0 | 1; slot: number; batter: number; inning: number; text: string; page: number };
export type PitcherLine = { team: 0 | 1; no: number; outs: number; batters: number; pitches: number; hits: number; hr: number; k: number; bb: number; hbp: number; runs: number };
export type GameSummary = { pas: PlateAppearance[]; pitchers: PitcherLine[]; final: GameState };

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

export function summarizeGame(pages: Page[], setups: TeamSetup[]): GameSummary {
  const st = initState(setups);
  const pas: PlateAppearance[] = [];
  const pitchers = new Map<string, PitcherLine>();
  const line = (team: 0 | 1, no: number) => { const key = `${team}-${no}`; if (!pitchers.has(key)) pitchers.set(key, { team, no, outs: 0, batters: 0, pitches: 0, hits: 0, hr: 0, k: 0, bb: 0, hbp: 0, runs: 0 }); return pitchers.get(key)!; };
  pages.forEach((page, index) => {
    const pre = clone(st); applyPre(pre, page);
    const offense = pre.half, defense = (1 - offense) as 0 | 1;
    const batter = batterOf(pre), slot = pre.bi[offense], inning = pre.inn;
    const p = line(defense, pitcherOf(pre));
    const key = `${offense}-${batter}`, before = (pre.paLog[key] ?? []).length;
    const pcKey = defense * 1000 + pitcherOf(pre), pcBefore = pre.pcount[pcKey] ?? 0;
    const outsBefore = pre.outs, halfBefore = pre.half, runsBefore = pre.score[offense];
    applyPage(st, page);
    p.pitches += (st.pcount[pcKey] ?? 0) - pcBefore;
    // アウトの数（攻守が替わったら3つ目まで）
    p.outs += st.half !== halfBefore ? 3 - outsBefore : st.outs - outsBefore;
    p.runs += Math.max(0, st.score[offense] - runsBefore);
    const log = st.paLog[key] ?? [];
    if (log.length > before) {
      const k = page.res?.kind, label = page.res?.label ?? "";
      const text = page.skip ? "タイム" : k === "S" ? (label === "空振" ? "空振り三振" : "見逃し三振") : k === "B" ? "四球" : k === "IBB" ? "申告敬遠" : label || log[log.length - 1];
      pas.push({ team: offense as 0 | 1, slot, batter, inning, text, page: index });
      p.batters++;
      if (typeof k === "number") p.hits++;
      if (k === 4) p.hr++;
      if (k === "S" || label === "振り逃げ") p.k++;
      if (k === "B" || k === "IBB") p.bb++;
      if (k === "hbp") p.hbp++;
    }
  });
  return { pas, pitchers: [...pitchers.values()].filter(x => x.pitches > 0 || x.batters > 0), final: st };
}

/** 投球回の表し方（1/3単位。例：7アウト → "2 1/3"） */
export const inningsText = (outs: number) => { const w = Math.floor(outs / 3), r = outs % 3; return r ? `${w} ${r}/3` : `${w}`; };
