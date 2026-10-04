import type { Page } from "./engine";

// 試合のメンバーの背番号を、マスターの今の背番号に合わせ直す。
// 入力済みのページは背番号で選手を指しているので、同じ選手を新しい番号で指すように書き換える。
export type RenumberLineupRow = { team_id: string; slot: number; roster_player_id?: string | null; uniform_no?: string | number | null; player_snapshot?: any };
export type RenumberPlayer = { id: string; team_id: string; name?: string; uniform_no?: string | number | null; show_index?: number | null };
export type RenumberChange = { team: 0 | 1; from: number; to: number; name: string };
export type RenumberPlan = { changes: RenumberChange[]; conflict: string | null };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const rowNo = (r: RenumberLineupRow) => num(r.player_snapshot?.uniform_no ?? r.uniform_no);

/** 試合で使われている背番号（スタメン・交代）を集める */
function usedNumbers(pages: Page[], lineup: RenumberLineupRow[], teamIds: [string, string]): [Set<number>, Set<number>] {
  const used: [Set<number>, Set<number>] = [new Set(), new Set()];
  for (const r of lineup) { const t = teamIds.indexOf(r.team_id); const n = rowNo(r); if (t >= 0 && n) used[t].add(n); }
  for (const p of pages) for (const s of p.subs ?? []) if (s.no) used[s.t].add(s.no);
  return used;
}

/**
 * どの番号をどの番号に替えるかを決める。
 * 番号の持ち主は、まずこの試合のスタメン（選手IDが分かる）、なければ名簿で今その番号を持つ選手。
 */
export function planRenumber(pages: Page[], lineup: RenumberLineupRow[], teamIds: [string, string], roster: RenumberPlayer[]): RenumberPlan {
  const changes: RenumberChange[] = [];
  const used = usedNumbers(pages, lineup, teamIds);
  const masterNo = (p: RenumberPlayer) => num(p.uniform_no ?? p.show_index);
  for (const t of [0, 1] as const) {
    const players = roster.filter(p => p.team_id === teamIds[t]);
    const owner = new Map<number, RenumberPlayer>();
    for (const n of used[t]) {
      const starter = lineup.find(r => r.team_id === teamIds[t] && rowNo(r) === n && r.roster_player_id);
      const p = starter ? players.find(x => x.id === starter.roster_player_id) : players.find(x => masterNo(x) === n);
      if (p) owner.set(n, p);
    }
    const target = new Map<number, number>();
    for (const [from, p] of owner) { const to = masterNo(p); if (to && to !== from) { target.set(from, to); changes.push({ team: t, from, to, name: String(p.name ?? "") }); } }
    // 付け替えたあとに、同じ番号の選手が2人にならないか
    const after = new Map<number, number>();
    for (const n of used[t]) { const m = target.get(n) ?? n; if (after.has(m)) return { changes, conflict: `${m}番の選手が2人になります。マスターの背番号を確かめてください` }; after.set(m, n); }
  }
  return { changes, conflict: null };
}

/** 決めた付け替えを、メンバーと全ページに当てる（元のデータは変えずに新しいものを返す） */
export function applyRenumber<R extends RenumberLineupRow>(pages: Page[], lineup: R[], teamIds: [string, string], changes: RenumberChange[], halfOf: (pageIndex: number) => 0 | 1): { pages: Page[]; lineup: R[] } {
  const map: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  for (const c of changes) map[c.team].set(c.from, c.to);
  const re = (t: 0 | 1, n: number | null | undefined) => (n ? map[t].get(n) ?? n : n);
  const newLineup = lineup.map(r => {
    const t = teamIds.indexOf(r.team_id) as 0 | 1; const n = rowNo(r); const to = t >= 0 && n ? map[t].get(n) : undefined;
    return to ? { ...r, uniform_no: String(to), player_snapshot: r.player_snapshot ? { ...r.player_snapshot, uniform_no: to } : r.player_snapshot } : r;
  });
  const newPages = pages.map((p, i) => {
    const q: Page = JSON.parse(JSON.stringify(p));
    q.subs = (q.subs ?? []).map(s => ({ ...s, no: re(s.t, s.no) ?? null }));
    // タイブレークの走者・取り込み試合の補正の走者は、そのページの攻撃側の番号
    if (q.tb) { const t = halfOf(i); q.tb.r = q.tb.r.map(b => re(t, b) ?? null); }
    if (q.sync) { const t = q.sync.half; q.sync.bases = q.sync.bases.map(b => re(t, b) ?? null); }
    return q;
  });
  return { pages: newPages, lineup: newLineup };
}
