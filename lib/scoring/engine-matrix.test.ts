import { describe, expect, it } from 'vitest';
import { applyPage, blank, checkCommit, GameState, initState, Page } from './engine';

// 走者の自動の動きを、塁の埋まり方8通り × 結果の全種類で確かめる。
// 期待する動きはBASSの実入力の調査（02-bass-survey）と野球の規則から決めた。
const page = (label: string, kind: string | number, extra: Partial<Page> = {}): Page => ({ ...blank(), res: { label, kind }, ...extra });
const RUNNERS = [91, 92, 93];
const setup = (mask: number, outs = 0, balls = 0): GameState => {
  const st = initState();
  st.bases = [0, 1, 2].map(i => (mask >> i) & 1 ? RUNNERS[i] : null);
  st.outs = outs; st.b = balls;
  return st;
};
const BATTER = initState().lu[0].order[0]; // 先攻1番
const label = (mask: number) => ['1', '2', '3'].filter((_, i) => (mask >> i) & 1).join('') || '無';

// 押し出し（打者が1塁に行くとき、詰まっている走者だけ1つ進む）
const forced = (mask: number) => {
  const b: (number | null)[] = [BATTER, null, null]; let runs = 0, chain = true;
  for (let i = 0; i < 3; i++) {
    if (!((mask >> i) & 1)) { chain = false; continue; }
    if (chain) { if (i + 2 >= 4) runs++; else b[i + 1] = RUNNERS[i]; } else b[i] = RUNNERS[i];
  }
  return { bases: b, runs };
};
// 全員がn個進む（打者は n 塁へ。n=0 なら打者は動かない）
const advanceAll = (mask: number, n: number, batterTo: number) => {
  const b: (number | null)[] = [null, null, null]; let runs = 0;
  for (let i = 0; i < 3; i++) if ((mask >> i) & 1) { const to = i + 1 + n; if (to >= 4) runs++; else b[to - 1] = RUNNERS[i]; }
  if (batterTo >= 4) runs++; else if (batterTo > 0) b[batterTo - 1] = BATTER;
  return { bases: b, runs };
};
const stay = (mask: number) => ({ bases: [0, 1, 2].map(i => (mask >> i) & 1 ? RUNNERS[i] : null), runs: 0 });

type Case = { name: string; p: Page; balls?: number; expect: (mask: number) => { bases: (number | null)[]; runs: number }; outs: number; needsInput?: boolean };
const CASES: Case[] = [
  { name: '単打', p: page('単打', 1), expect: m => advanceAll(m, 1, 1), outs: 0 },
  { name: '二塁打', p: page('二塁打', 2), expect: m => advanceAll(m, 2, 2), outs: 0 },
  { name: '三塁打', p: page('三塁打', 3), expect: m => advanceAll(m, 3, 3), outs: 0 },
  { name: '本塁打', p: page('本塁打', 4), expect: m => advanceAll(m, 4, 4), outs: 0 },
  { name: '四球', p: page('ボール', 'B'), balls: 3, expect: forced, outs: 0 },
  { name: '死球', p: page('死球', 'hbp'), expect: forced, outs: 0 },
  { name: '申告敬遠', p: page('申告敬遠', 'IBB'), expect: forced, outs: 0 },
  { name: '野選', p: page('野選', 'fc'), expect: m => advanceAll(m, 1, 1), outs: 0 },
  { name: 'ボーク', p: page('ボーク', 'BK'), expect: m => advanceAll(m, 1, 0), outs: 0 },
  { name: '凡打', p: page('凡打', 'out'), expect: stay, outs: 1 },
  { name: '犠打', p: page('犠打', 'sac'), expect: stay, outs: 1 },
  { name: '守備妨害', p: page('守備妨害', 'out'), expect: stay, outs: 1 },
  { name: '失策出塁', p: page('失策出塁', 'e'), expect: forced, outs: 0 },
  { name: '振り逃げ', p: page('振り逃げ', 'e'), expect: forced, outs: 0 },
  { name: '犠飛', p: page('犠飛', 'sf'), expect: stay, outs: 0, needsInput: true },
  { name: '打撃妨害', p: page('打撃妨害', 'io'), expect: stay, outs: 0, needsInput: true },
];

describe('走者の自動の動き（8通りの塁 × 全結果）', () => {
  for (const c of CASES) for (let mask = 0; mask < 8; mask++) {
    it(`${c.name}・走者${label(mask)}`, () => {
      const st = setup(mask, 0, c.balls ?? 0);
      if (c.needsInput) { expect(checkCommit(st, c.p)).not.toBeNull(); return; }
      applyPage(st, c.p);
      const e = c.expect(mask);
      expect(st.bases).toEqual(e.bases);
      expect(st.score[0]).toBe(e.runs);
      expect(st.outs).toBe(c.outs);
    });
  }
});

describe('3つ目のアウトと得点', () => {
  it('2死三塁で打者が凡打（一塁でアウト）なら、三塁走者が本塁に入っても得点にならない', () => {
    const st = setup(0b100, 2);
    applyPage(st, page('凡打', 'out', { ra: { 3: { to: 4 } } }));
    expect(st.score[0]).toBe(0);
    expect(st.half).toBe(1);
  });
  it('2死三塁で走者が本塁に入る前に、別の走者が3つ目のアウトになる併殺でも、先に本塁を踏めば得点（打者が一塁に生きた場合）', () => {
    const st = setup(0b101, 2);
    applyPage(st, page('単打', 1, { ra: { 1: { out: true } } }));
    expect(st.score[0]).toBe(1);
  });
  it('3アウトで攻守が入れ替わり、塁とカウントが空になる', () => {
    const st = setup(0b111, 2);
    applyPage(st, page('凡打', 'out'));
    expect([st.half, st.outs, st.bases]).toEqual([1, 0, [null, null, null]]);
  });
});
