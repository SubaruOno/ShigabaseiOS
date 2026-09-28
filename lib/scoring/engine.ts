export type Hand = '左' | '右' | '両';
export type Move = { to?: number; out?: boolean; back?: boolean; homeOut?: boolean };
export type Substitution = { t: 0 | 1; slot: number | 'P'; no: number | null; bats?: Hand; pos?: number; throws?: Hand };
export type Page = {
  subs: Substitution[]; tb: { bi: number; r: (number | null)[]; b?: number; s?: number; o?: number } | null;
  pitch_type: string | null; course: [number, number] | null; catcher_mitt_position: number;
  ball_speed: string; res: { label: string; kind: string | number } | null; flags: string[];
  plan: Record<string, unknown>; batted_ball: { x: number; y: number } | null; feature: number; rank: string | null;
  catch_fielder: (number | { pos: number; err?: string })[]; ra: Record<number, Move>; pickoff_throw_to: number;
  skip: boolean; skipOut: boolean | null; memo: string; time: string | null; handP: Hand | null; handB: Hand | null;
};
export type TeamSetup = { name: string; order: number[]; pos: number[]; bats: Hand[]; P: number; throws: Hand };
export type GameState = {
  inn: number; half: 0 | 1; score: [number, number]; hits: [number, number]; line: [number[], number[]];
  outs: number; b: number; s: number; bases: (number | null)[]; bi: [number, number];
  pcount: Record<number, number>; paLog: Record<string, string[]>; tie: boolean; subHalf: [number[], number[]]; lu: TeamSetup[];
};
export const blank = (): Page => ({ subs: [], tb: null, pitch_type: null, course: null, catcher_mitt_position: 0, ball_speed: '', res: null, flags: [], plan: {}, batted_ball: null, feature: 0, rank: null, catch_fielder: [], ra: {}, pickoff_throw_to: 0, skip: false, skipOut: null, memo: '', time: null, handP: null, handB: null });
export const DEFAULT_TEAMS: TeamSetup[] = [
  { name: '滋賀大学(テスト)', order: [15, 5, 6, 9, 8, 7, 4, 3, 2], pos: [4, 5, 10, 8, 9, 7, 6, 3, 2], bats: ['右', '左', '左', '左', '左', '両', '左', '両', '右'], P: 1, throws: '左' },
  { name: '対戦校(テスト)', order: [7, 15, 8, 9, 4, 5, 6, 3, 2], pos: [9, 10, 7, 8, 3, 4, 5, 6, 2], bats: ['左', '両', '左', '左', '右', '左', '左', '右', '右'], P: 1, throws: '右' },
];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export function initState(teams: TeamSetup[] = DEFAULT_TEAMS): GameState {
  return { inn: 1, half: 0, score: [0, 0], hits: [0, 0], line: [[], []], outs: 0, b: 0, s: 0, bases: [null, null, null], bi: [0, 0], pcount: {}, paLog: {}, tie: false, subHalf: [[], []], lu: clone(teams) };
}
export const batterOf = (st: GameState): number => st.lu[st.half].order[st.bi[st.half]];
export const pitcherOf = (st: GameState): number => st.lu[1 - st.half].P;
function endPA(st: GameState, text: string) { const team = st.half, no = batterOf(st), key = `${team}-${no}`; (st.paLog[key] ??= []).push(text); st.bi[team] = (st.bi[team] + 1) % 9; st.b = 0; st.s = 0; }
function addRun(st: GameState, n: number) { if (!n) return; st.score[st.half] += n; const line = st.line[st.half]; line[st.inn - 1] = (line[st.inn - 1] || 0) + n; }
export function autoMoves(st: GameState, p: Page): Record<number, Move> {
  const k = p.res?.kind, m: Record<number, Move> = {};
  const walk = (k === 'B' && st.b >= 3) || k === 'IBB' || k === 'hbp';
  if (walk) { m[0] = { to: 1 }; let need = 1; for (let i = 1; i <= 3; i++) if (st.bases[i - 1] != null && need === i) { m[i] = { to: i + 1 }; need = i + 1; } }
  else if (k === 4) { m[0] = { to: 4 }; [1, 2, 3].forEach(i => { if (st.bases[i - 1] != null) m[i] = { to: 4 }; }); }
  else if (k === 1 || k === 'fc' || k === 'BK') { if (k !== 'BK') m[0] = { to: 1 }; [1, 2, 3].forEach(i => { if (st.bases[i - 1] != null) m[i] = { to: i + 1 }; }); }
  else if (typeof k === 'number') m[0] = { to: k };
  else if (k === 'out' || k === 'sac') m[0] = { out: true };
  else if (k === 'e') m[0] = { to: 1 };
  return m;
}
export function moves(st: GameState, p: Page): Record<number, Move> {
  const m = autoMoves(st, p);
  for (const [base, action] of Object.entries(p.ra)) { const n = Number(base); if (action.back) { delete m[n]; continue; } m[n] = { ...m[n], ...action }; if (action.out) delete m[n].to; else if (action.to) delete m[n].out; }
  return m;
}
export function applyPre(st: GameState, p: Page) {
  for (const c of p.subs || []) { const lineup = st.lu[c.t]; if (c.slot === 'P') { if (c.no != null) lineup.P = c.no; if (c.throws) lineup.throws = c.throws; continue; }
    const old = lineup.order[c.slot]; if (c.no != null && c.no !== old) { lineup.order[c.slot] = c.no; if (c.bats) lineup.bats[c.slot] = c.bats; if (c.t === st.half) st.bases = st.bases.map(id => id === old ? c.no : id); st.subHalf[c.t].push(c.slot); }
    if (c.pos != null) lineup.pos[c.slot] = c.pos;
  }
  if (p.tb) { const lineup = st.lu[st.half]; st.tie = true; st.bi[st.half] = p.tb.bi; st.bases = p.tb.r.map(i => i == null ? null : lineup.order[i]); st.b = p.tb.b || 0; st.s = p.tb.s || 0; st.outs = p.tb.o || 0; }
}
export function three(st: GameState) { if (st.outs >= 3) { st.outs = 0; st.b = 0; st.s = 0; st.bases = [null, null, null]; st.subHalf[st.half] = []; if (st.half) { st.half = 0; st.inn++; } else st.half = 1; } }
export function applyPage(st: GameState, p: Page) {
  applyPre(st, p); const team = st.half, batter = batterOf(st), pitcher = pitcherOf(st), mv = moves(st, p);
  const moveRunners = () => { let runs = 0; const next: (number | null)[] = [null, null, null];
    for (let i = 3; i >= 1; i--) { const id = st.bases[i - 1]; if (id == null) continue; const a = mv[i]; if (!a || (!a.out && !a.to)) { next[i - 1] = id; continue; } if (a.out) { st.outs++; continue; } if ((a.to || 0) >= 4) { if (!a.homeOut) runs++; else st.outs++; } else if (a.to) next[a.to - 1] = id; }
    const b = mv[0]; if (b?.out) st.outs++; else if (b?.to) { if (b.to >= 4) { if (!b.homeOut) runs++; else st.outs++; } else next[b.to - 1] = batter; }
    st.bases = next; addRun(st, runs);
  };
  if (p.pickoff_throw_to) { moveRunners(); three(st); return; }
  if (p.skip) { if (!mv[0] || (!mv[0].out && !mv[0].to)) return; const out = !!mv[0].out; moveRunners(); endPA(st, out ? '凡退' : '出塁'); three(st); return; }
  if (!p.res) return; const k = p.res.kind;
  if (k !== 'BK' && k !== 'IBB') st.pcount[pitcher] = (st.pcount[pitcher] || 0) + 1;
  if (k === 'S') st.s = Math.min(st.s + 1, 3); else if (k === 'B') st.b = Math.min(st.b + 1, 4); else if (k === 'FO' && st.s < 2) st.s++;
  const batterMove = mv[0], ended = batterMove && (batterMove.out || batterMove.to); moveRunners();
  if (ended) { let text = p.res.label; if (k === 'S') text = p.res.label === '空振' ? '空三振' : '見三振'; else if (k === 'B') text = '四球'; else if (k === 'IBB') text = '敬遠'; else if (k === 'hbp') text = '死球'; else if (k === 'fc') text = '野選'; else if (k === 'io') text = p.res.label; else if (typeof k === 'number') { st.hits[team]++; text = ['', '安', '二', '三', '本'][k]; } else if (k === 'out') text = p.feature === 2 ? '飛' : p.feature === 3 ? '直' : 'ゴ'; else if (k === 'sf') text = '犠飛'; else if (k === 'sac') text = '犠打'; else if (p.res.label === '失策出塁') text = '失'; endPA(st, text); }
  three(st);
}
export function checkCommit(st: GameState, p: Page): string | null {
  if (p.skip && !(p.ra[0] && (p.ra[0].out || p.ra[0].to))) return '打席結果（アウトまたは進塁）を入力してください';
  if (!p.res && !p.skip && !p.pickoff_throw_to) return '入力がありません';
  if (p.res?.kind === 'FO' && !p.feature) return '打球の質を選択してください';
  const lineup = st.lu[st.half]; if (lineup.bats[st.bi[st.half]] === '両' && !p.handB && p.res?.kind !== 'IBB' && !p.pickoff_throw_to) return '右打席・左打席を選んでください';
  if (p.res) { const k = p.res.kind, m = moves(st, p)[0], ended = m && (m.out || m.to); if (((k === 'S' && st.s >= 2) || k === 'sf' || k === 'io' || (k === 'S' && st.s + 1 >= 3)) && !ended) return '打席結果（アウトまたは進塁）を入力してください'; }
  return null;
}
export function stateAt(index: number, pages: Page[], teams: TeamSetup[] = DEFAULT_TEAMS, includePre = false): GameState { const st = initState(teams); for (let i = 0; i < index; i++) applyPage(st, pages[i]); if (includePre && pages[index]) applyPre(st, pages[index]); return st; }

export function teamSetupsFromLineup(lineup: Array<{team_id:string;slot:number;roster_player_id:string;position_id:number;batting_hand?:string|null;throwing_hand?:string|null;uniform_no?:string|null;player_snapshot?:{uniform_no?:number|string;bat_hand?:string;throw_hand?:string;name?:string}}>, teamIds:[string,string], teamNames:[string,string]): TeamSetup[] {
  return teamIds.map((teamId, index) => {
    const rows=lineup.filter(row=>row.team_id===teamId).sort((a,b)=>a.slot-b.slot);
    const order=Array.from({length:9},(_,slot)=>{
      const row=rows.find(item=>item.slot===slot+1);
      const raw=row?.uniform_no??row?.player_snapshot?.uniform_no??row?.player_snapshot?.show_index;
      const number=Number(raw);
      return Number.isFinite(number)&&number>0?number:slot+1;
    });
    const positions=Array.from({length:9},(_,slot)=>rows.find(item=>item.slot===slot+1)?.position_id??(slot===0?1:10));
    const bats=Array.from({length:9},(_,slot)=>{const h=rows.find(item=>item.slot===slot+1)?.batting_hand??rows.find(item=>item.slot===slot+1)?.player_snapshot?.bat_hand;return h==='L'?'左':h==='S'?'両':'右' as Hand});
    const p=rows.find(item=>item.slot===10);const pitchNo=Number(p?.uniform_no??p?.player_snapshot?.uniform_no??p?.player_snapshot?.show_index??order[0]);
    const throws=(p?.throwing_hand??p?.player_snapshot?.throw_hand)==='L'?'左':'右' as Hand;
    return {name:teamNames[index],order,pos:positions,bats,P:Number.isFinite(pitchNo)?pitchNo:order[0],throws};
  });
}
