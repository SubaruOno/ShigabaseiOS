import { describe, expect, it } from 'vitest';
import { applyPage, batterOf, blank, checkCommit, initState, Page, pitcherOf, stateAt, subError } from './engine';

// 選手交代・タイブレーク・打席スキップ・盗塁と牽制の重なり・併殺を、BASSの調査（02-bass-survey）どおりに動くか確かめる
const page = (label: string, kind: string | number, extra: Partial<Page> = {}): Page => ({ ...blank(), res: { label, kind }, ...extra });
const first = initState().lu[0].order;

describe('選手交代', () => {
  it('代走：塁にいる選手を代えると、塁の上の選手も入れ替わる', () => {
    const single = page('単打', 1);
    const sub: Page = { ...blank(), subs: [{ t: 0, slot: 0, no: 55 }] };
    const st = stateAt(2, [single, { ...sub, res: { label: 'ボール', kind: 'B' } }]);
    expect(st.bases[0]).toBe(55);
    expect(st.lu[0].order[0]).toBe(55);
  });
  it('代打：次の打者の枠を代えると、その選手が打席に立つ', () => {
    const sub: Page = { ...page('単打', 1), subs: [{ t: 0, slot: 0, no: 44 }] };
    const st = stateAt(1, [sub]);
    expect(st.bases[0]).toBe(44);
  });
  it('投手交代：守っている側のPを代えると、その後の球数は新しい投手に付く', () => {
    const change: Page = { ...page('ボール', 'B'), subs: [{ t: 1, slot: 'P', no: 30 }] };
    const st = stateAt(2, [page('ボール', 'B'), change]);
    expect(pitcherOf(st)).toBe(30);
    expect(st.pcount[1030]).toBe(1);
    expect(Object.values(st.pcount).reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('守備位置の変更だけでは打順も塁も変わらない', () => {
    const st = stateAt(1, [{ ...page('ボール', 'B'), subs: [{ t: 1, slot: 3, no: null, pos: 7 }] }]);
    expect(st.lu[1].pos[3]).toBe(7);
    expect(st.lu[1].order).toEqual(initState().lu[1].order);
  });
});

describe('タイブレーク', () => {
  it('打者・走者・カウントを入れると、その状況から始まる', () => {
    const tb: Page = { ...page('ボール', 'B'), tb: { bi: 4, r: [3, 2, null], b: 0, s: 0, o: 0 } };
    const st = initState(); applyPage(st, tb);
    expect(st.tie).toBe(true);
    expect(st.bases).toEqual([first[3], first[2], null]);
    expect(st.b).toBe(1);
    expect(batterOf(st)).toBe(first[4]);
  });
});

describe('打席スキップ', () => {
  it('打者の結果を入れないと確定できない', () => {
    expect(checkCommit(initState(), { ...blank(), skip: true })).not.toBeNull();
  });
  it('アウトなら1アウト増えて次の打者へ。球数は増えない', () => {
    const st = initState(); applyPage(st, { ...blank(), skip: true, ra: { 0: { out: true } } });
    expect([st.outs, batterOf(st)]).toEqual([1, first[1]]);
    expect(Object.keys(st.pcount).length).toBe(0);
  });
  it('進塁なら打者が塁に出る', () => {
    const st = initState(); applyPage(st, { ...blank(), skip: true, ra: { 0: { to: 1 } } });
    expect(st.bases[0]).toBe(first[0]);
    expect(batterOf(st)).toBe(first[1]);
  });
});

describe('同じ打席での盗塁と牽制', () => {
  it('盗塁（ボール）→ 牽制でアウト：打者は同じまま、アウトが1つ増え、球数は1のまま', () => {
    const single = page('単打', 1);
    const steal = page('ボール', 'B', { ra: { 1: { to: 2, steal: true } as any } });
    const pick: Page = { ...blank(), pickoff_throw_to: 2, ra: { 2: { out: true } } };
    const st = stateAt(3, [single, steal, pick]);
    expect(st.bases).toEqual([null, null, null]);
    expect(st.outs).toBe(1);
    expect(batterOf(st)).toBe(first[1]);
    expect(st.b).toBe(1);
  });
  it('牽制でアウトにならなければ何も変わらない', () => {
    const st = stateAt(2, [page('単打', 1), { ...blank(), pickoff_throw_to: 1 }]);
    expect(st.bases[0]).toBe(first[0]);
    expect(st.outs).toBe(0);
  });
});

describe('併殺', () => {
  it('一塁走者と打者をアウト（6-4-3）：2アウト増え、塁は空', () => {
    const st = stateAt(2, [page('単打', 1), page('凡打', 'out', { ra: { 1: { out: true } }, catch_fielder: [6, 4, 3] })]);
    expect(st.outs).toBe(2);
    expect(st.bases).toEqual([null, null, null]);
  });
  it('無死一三塁の併殺の間に三塁走者が本塁：2アウト目なので得点になる', () => {
    const st = initState(); st.bases = [91, null, 93];
    applyPage(st, page('凡打', 'out', { ra: { 1: { out: true }, 3: { to: 4 } } }));
    expect([st.outs, st.score[0]]).toEqual([2, 1]);
  });
  it('1死一三塁の併殺（打者が3つ目のアウト）：本塁に入っても得点にならない', () => {
    const st = initState(); st.bases = [91, null, 93]; st.outs = 1;
    applyPage(st, page('凡打', 'out', { ra: { 1: { out: true }, 3: { to: 4 } } }));
    expect(st.score[0]).toBe(0);
    expect(st.half).toBe(1);
  });
});

describe('球数', () => {
  it('両チームの投手が同じ背番号でも、球数は別々に数える', () => {
    const st = initState(); st.lu[0].P = 1; st.lu[1].P = 1;
    for (let i = 0; i < 3; i++) applyPage(st, page('ボール', 'B'));
    st.half = 1; st.b = 0;
    expect(st.pcount[1001]).toBe(3);
    expect(st.pcount[1] ?? 0).toBe(0);
  });
});

describe('交代で出せない選手', () => {
  it('出場中の選手は代打に出せない', () => {
    const st = initState();
    expect(subError(st, 0, 0, st.lu[0].order[3])).toMatch('出場中');
    expect(subError(st, 0, 0, 44)).toBeNull();
  });
  it('交代で退いた選手はもう出られない（打者も投手も）', () => {
    const old = initState().lu[0].order[0];
    const st = stateAt(1, [{ ...page('ボール', 'B'), subs: [{ t: 0, slot: 0, no: 44 }] }]);
    expect(subError(st, 0, 0, old)).toMatch('退いた');
    const oldP = initState().lu[1].P;
    const st2 = stateAt(1, [{ ...page('ボール', 'B'), subs: [{ t: 1, slot: 'P', no: 30 }] }]);
    expect(subError(st2, 1, 'P', oldP)).toMatch('退いた');
  });
  it('守っている野手が投手に回るのはよいが、今の投手をもう一度は選べない', () => {
    const st = initState();
    expect(subError(st, 1, 'P', st.lu[1].order[2])).toBeNull();
    expect(subError(st, 1, 'P', st.lu[1].P)).toMatch('すでに投手');
  });
});

describe('大谷ルール', () => {
  it('大谷ルールの試合だけ、投手を打順に入れられる', () => {
    const st = initState(); const P = st.lu[0].P;
    expect(subError(st, 0, 8, P)).toMatch('出場中');
    expect(subError(st, 0, 8, P, true)).toBeNull();
  });
  it('大谷ルールでも、打順にいる野手を別の枠に入れるのは出場中として止める', () => {
    const st = initState();
    expect(subError(st, 0, 8, st.lu[0].order[2], true)).toMatch('出場中');
  });
});
