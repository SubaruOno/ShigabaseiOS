import { describe, expect, it } from 'vitest';
import { applyPage, blank, checkCommit, DEFAULT_TEAMS, GameState, initState, Page, pitcherOf, batterOf, stateAt, teamSetupsFromLineup } from './engine';

const page = (label: string, kind: string | number, extra: Partial<Page> = {}): Page => ({ ...blank(), res: { label, kind }, ...extra });
const run = (...pages: Page[]): GameState => stateAt(pages.length, pages);
const setRunner = (st: GameState, base: number, player = 90 + base) => { st.bases[base] = player; };

describe('scoring engine mirrors prototype state transitions', () => {
  it('initializes a played inning at zero on the linescore', () => {
    const st=initState();applyPage(st,page('見逃し','S'));
    expect(st.line[0][0]).toBe(0);
    st.half=1;applyPage(st,page('見逃し','S'));
    expect(st.line[1][0]).toBe(0);
  });
  it('maps visiting lineup to top offense and home P slot to top-half pitcher', () => {
    const teams = teamSetupsFromLineup([
      { team_id: 'away', slot: 1, roster_player_id: 'a1', position_id: 8, uniform_no: '7' },
      { team_id: 'away', slot: 10, roster_player_id: 'ap', position_id: 1, uniform_no: '18' },
      { team_id: 'home', slot: 1, roster_player_id: 'h1', position_id: 6, uniform_no: '2' },
      { team_id: 'home', slot: 10, roster_player_id: 'hp', position_id: 1, uniform_no: '31' },
    ], ['away', 'home'], ['訪問', 'ホーム']);
    const st = initState(teams);
    expect([batterOf(st), pitcherOf(st)]).toEqual([7, 31]);
    st.half = 1;
    expect([batterOf(st), pitcherOf(st)]).toEqual([2, 18]);
  });
  it('pinch hitter then four balls ends PA and advances the pinch hitter', () => {
    const sub = { ...blank(), subs: [{ t: 0 as const, slot: 0, no: 44, bats: '右' as const }] };
    const walk = page('ボール', 'B');
    const st = run(sub, walk, walk, walk, walk);
    expect(st.lu[0].order[0]).toBe(44); expect(st.bi[0]).toBe(1); expect(st.bases[0]).toBe(44);
    expect(st.pcount[1]).toBe(4); expect(st.b).toBe(0); expect(checkCommit(stateAt(3, [sub, walk, walk, blank()], DEFAULT_TEAMS, true), walk)).toBeNull();
  });
  it('applies a pinch hitter in the batting order slot selected from the batter dialog', () => {
    const p = { ...blank(), subs: [{ t: 0 as const, slot: 0, no: 44, bats: '左' as const, pos: 8 }] };
    const st = stateAt(1, [p], DEFAULT_TEAMS, true);
    expect(st.lu[0].order[0]).toBe(44);
    expect(st.lu[0].bats[0]).toBe('左');
  });
  it('applies a pitcher change in the defending P slot selected from the pitcher dialog', () => {
    const p = { ...blank(), subs: [{ t: 1 as const, slot: 'P' as const, no: 44, throws: '左' as const }] };
    const st = stateAt(1, [p], DEFAULT_TEAMS, true);
    expect(st.lu[1].P).toBe(44);
    expect(st.lu[1].throws).toBe('左');
  });
  it('pinch runner replaces the runner already on base', () => {
    const st = initState(); setRunner(st, 0, 7);
    const p = { ...blank(), subs: [{ t: 0 as const, slot: 0, no: 44 }] };
    st.lu[0].order[0] = 7; applyPage(st, p); expect(st.bases[0]).toBe(44);
  });
  it('steal followed by out removes the runner and adds an out', () => {
    const st = initState(); setRunner(st, 0, 77);
    applyPage(st, { ...blank(), pickoff_throw_to: 1, ra: { 1: { to: 2 } } });
    applyPage(st, { ...blank(), pickoff_throw_to: 2, ra: { 2: { out: true } } });
    expect(st.bases).toEqual([null, null, null]); expect(st.outs).toBe(1); expect(st.pcount[1] || 0).toBe(0);
  });
  it('pickoff records no pitch and applies the manual runner out', () => {
    const st = initState(); setRunner(st, 0, 77);
    applyPage(st, { ...blank(), pickoff_throw_to: 1, ra: { 1: { out: true } } });
    expect(st.outs).toBe(1); expect(st.bases[0]).toBeNull(); expect(st.pcount[1]).toBeUndefined();
  });
  it('intentional walk does not count a pitch or ask batter hand', () => {
    const st = initState(); st.lu[0].bats[0] = '両';
    const p = page('申告敬遠', 'IBB'); expect(checkCommit(st, p)).toBeNull(); applyPage(st, p);
    expect(st.pcount[1]).toBeUndefined(); expect(st.bases[0]).toBe(DEFAULT_TEAMS[0].order[0]);
  });
  it('balk advances runners and does not count a pitch', () => {
    const st = initState(); setRunner(st, 0, 77);
    applyPage(st, page('ボーク', 'BK'));
    expect(st.bases[1]).toBe(77); expect(st.pcount[1]).toBeUndefined();
  });
  it('third strike requires a manual batter out or advance before commit', () => {
    const st = initState(); st.s = 2;
    const strikeout = page('空振', 'S');
    expect(checkCommit(st, strikeout)).toBe('打席結果（アウトまたは進塁）を入力してください');
    strikeout.ra[0] = { out: true };
    expect(checkCommit(st, strikeout)).toBeNull();
  });
  it('batter interference requires a manual batter advance', () => {
    const st = initState(), p = page('打撃妨害', 'io');
    expect(checkCommit(st, p)).toContain('打席結果'); p.ra[0] = { to: 1 }; expect(checkCommit(st, p)).toBeNull();
  });
  it('fielder choice advances runners and places batter at first', () => {
    const st = initState(); setRunner(st, 0, 77); applyPage(st, page('野選', 'fc'));
    expect(st.bases[0]).toBe(DEFAULT_TEAMS[0].order[0]); expect(st.bases[1]).toBe(77); expect(st.pcount[1]).toBe(1);
  });
  it('single advances a runner one base and puts batter on first', () => {
    const st = initState(); setRunner(st, 0, 77); applyPage(st, page('単打', 1));
    expect(st.bases.slice(0, 2)).toEqual([DEFAULT_TEAMS[0].order[0], 77]); expect(st.pcount[1]).toBe(1);
  });
  it('home run scores batter and all runners', () => {
    const st = initState(); st.bases = [10, 11, 12]; applyPage(st, page('本塁打', 4));
    expect(st.score[0]).toBe(4); expect(st.line[0][0]).toBe(4); expect(st.bases).toEqual([null, null, null]); expect(st.hits[0]).toBe(1);
  });
  it('sets tiebreak runner, batter and count before page', () => {
    const st = stateAt(1, [{ ...blank(), tb: { bi: 2, r: [0, 1, null], b: 1, s: 2, o: 1 } }], DEFAULT_TEAMS, true);
    expect(st.tie).toBe(true); expect(st.bases).toEqual([DEFAULT_TEAMS[0].order[0], DEFAULT_TEAMS[0].order[1], null]); expect(st.bi[0]).toBe(2); expect([st.b, st.s, st.outs]).toEqual([1, 2, 1]);
  });
  it('changes half inning after the third out', () => {
    const st = initState(); st.outs = 2; applyPage(st, page('凡打', 'out'));
    expect(st.half).toBe(1); expect(st.outs).toBe(0); expect(st.bases).toEqual([null, null, null]);
  });
});

describe('追い越し防止（すばるの指摘 2026-09-29）', () => {
  it('1塁走者がいて三塁打なら、走者は生還し打者は3塁', () => {
    const pages = [blank()];
    pages[0].res = { label: '単打', kind: 1 };
    const p2 = blank(); p2.res = { label: '三塁打', kind: 3 };
    const st = stateAt(2, [pages[0], p2]);
    expect(st.bases[2]).not.toBeNull();
    expect(st.bases[0]).toBeNull();
    expect(st.score[0]).toBe(1);
  });
  it('1塁走者がいて二塁打なら、走者は3塁、打者は2塁', () => {
    const p1 = blank(); p1.res = { label: '単打', kind: 1 };
    const p2 = blank(); p2.res = { label: '二塁打', kind: 2 };
    const st = stateAt(2, [p1, p2]);
    expect(st.bases[1]).not.toBeNull();
    expect(st.bases[2]).not.toBeNull();
    expect(st.bases[0]).toBeNull();
  });
  it('手で打者を2塁へ進めたら、1塁走者は3塁へ押し出される', () => {
    const p1 = blank(); p1.res = { label: '単打', kind: 1 };
    const p2 = blank(); p2.res = { label: '失策出塁', kind: 'e' }; p2.ra = { 0: { to: 2 } };
    const st = stateAt(2, [p1, p2]);
    expect(st.bases[0]).toBeNull();
    expect(st.bases[1]).not.toBeNull();
    expect(st.bases[2]).not.toBeNull();
  });
});
