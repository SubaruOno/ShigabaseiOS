import { applyPage, initState, stateAt, teamSetupsFromLineup, type Page } from "./engine";
import { convertSavedPageCoordinates, round2 } from "./coords";

type LocalPlay = { seq: number; page: Page };
type LineupRow = { team_id: string; slot: number; position_id: number; batting_hand?: string | null; throwing_hand?: string | null; uniform_no?: string | null; player_snapshot?: { name?: string; bat_hand?: string; throw_hand?: string; uniform_no?: string | number; show_index?: number } };
export type AnalysisPitch = Record<string, string | number | null>;

const nonempty = (value: unknown): string | null => value == null || value === "" ? null : String(value);
const num = (value: unknown): number | null => { const n = Number(value); return value == null || value === "" || !Number.isFinite(n) ? null : n; };
const positionName: Record<number, string> = { 1:"投手",2:"捕手",3:"一塁手",4:"二塁手",5:"三塁手",6:"遊撃手",7:"左翼手",8:"中堅手",9:"右翼手",10:"DH" };
const hand = (value?: string | null) => value === "L" ? "左" : value === "S" ? "両" : "右";

const OLD_RESULT_WORDS = new Set(["見逃し","空振り","ファール","ハーフスイング","見逃し三振","空振り三振","単打","二塁打","三塁打","本塁打","ランニング本塁打","四球","敬遠","死球","凡打死","凡打出塁","ファールフライ","犠打","犠飛","エラー","野手選択","振り逃げ","スリーバント失敗","ボーク"]);
export function resultWords(page: Page, before: ReturnType<typeof stateAt>) {
  const kind = page.res?.kind;
  // 旧Excelで専用の語がある結果は、種類より先に名前で決める
  const label = page.res?.label;
  if (label === "守備妨害" || label === "打撃妨害" || label === "走塁妨害") return label;
  // 旧Excel・本番の試合結果では、スリーバント失敗は「K3」（成績の画面も K3 を三振として数える）
  if (label === "ｽﾘｰﾊﾞﾝﾄ失敗" || label === "スリーバント失敗") return "K3";
  // 旧Excelから取り込んだページは、結果の言葉がすでに旧Excelの言葉なのでそのまま使う
  if (label && OLD_RESULT_WORDS.has(label)) return label;
  if (typeof kind === "number") return ["", "単打", "二塁打", "三塁打", "本塁打"][kind] ?? "凡打死";
  if (kind === "S") return page.res?.label === "空振" ? before.s >= 2 ? "空振り三振" : "空振り" : before.s >= 2 ? "見逃し三振" : "見逃し";
  if (kind === "B") return before.b >= 3 ? "四球" : "ボール";
  // 旧Excelに「敬遠」の語はなく四球として記録していた（成績の画面も四球を数える）
  if (kind === "IBB") return "四球";
  if (kind === "hbp") return "死球";
  if (kind === "out") return page.res?.label === "邪飛" ? "ファールフライ" : "凡打死";
  if (kind === "fc") return "野手選択";
  if (kind === "sf") return "犠飛";
  if (kind === "sac") return "犠打";
  if (kind === "e") return page.res?.label === "振り逃げ" ? "振り逃げ" : "エラー";
  if (kind === "FO") return page.res?.label === "ファウル" || page.res?.label === "ファール" ? "ファール" : page.res?.label === "邪飛" ? "ファールフライ" : page.res?.label === "見送" ? "見逃し" : page.res?.label === "空振" ? "空振り" : page.res?.label === "ボール" ? "ボール" : null;
  if (kind === "io") return page.res?.label === "失策出塁" ? "エラー" : page.res?.label === "凡打" ? "凡打死" : page.res?.label === "見送" ? "見逃し三振" : page.res?.label === "空振" ? "空振り三振" : null;
  if (kind === "BK") return "ボーク";
  return null;
}

const hitTypeName: Record<number, string> = { 1: "ゴロ", 2: "フライ", 3: "ライナー" };

function paState(page: Page, before: ReturnType<typeof stateAt>, after: ReturnType<typeof stateAt>) {
  if (page.skip) return page.ra[0]?.out || page.ra[0]?.to ? "打席完了" : "打席継続";
  if (!page.res) return "打席継続";
  const kind = page.res.kind;
  const complete = (typeof kind === "number") || ["IBB", "hbp", "out", "fc", "sf", "sac", "e", "io"].includes(String(kind)) || (kind === "S" && before.s >= 2) || (kind === "B" && before.b >= 3);
  return complete || before.bi[before.half] !== after.bi[before.half] || before.inn !== after.inn || before.half !== after.half ? "打席完了" : "打席継続";
}

export function toAnalysisPitches(input: {
  gameId: string; plays: LocalPlay[]; lineup: LineupRow[]; teamIds: [string,string]; teamNames: [string,string];
  gameDate: string; gameTime: string; season: string; kind: string; week: string; day: string; gameNumber: number;
  umpire?: string | null; ballTypes?: Array<{ name: string; old_excel_label?: string | null }>;
  planNames?: Record<string, string>; resultNames?: Record<string, string>; substitutions?: Array<Record<string, unknown>>;
  positionNames?: Record<string, string>;
  /** 先発にいない選手（代打・代走・継投）の名前を引くための名簿 */
  players?: Array<{ team_id: string; name: string; uniform_no?: unknown; show_index?: unknown }>;
}): AnalysisPitch[] {
  const { lineup, teamIds, teamNames } = input;
  // 状況（打順・塁・交代）は交代だけのページも含めた全ページから計算し、行にするのは投球・牽制・打席スキップのページだけ
  const allPages = input.plays.map(p => p.page);
  const playable = (page: any) => !!page.res || !!page.pickoff_throw_to || (page.skip && !!(page.ra[0]?.out || page.ra[0]?.to));
  const plays = input.plays.map((play, at) => ({ ...play, at })).filter(({ page }) => playable(page));
  const setups = teamSetupsFromLineup(lineup as any, teamIds, teamNames);
  const nameFor = (team: number, no: number | null) => {
    if (no == null) return null;
    const row = lineup.find(x => x.team_id === teamIds[team] && Number(x.uniform_no ?? x.player_snapshot?.uniform_no ?? x.player_snapshot?.show_index) === no);
    if (row?.player_snapshot?.name) return row.player_snapshot.name;
    const p = input.players?.find(x => x.team_id === teamIds[team] && Number(x.uniform_no ?? x.show_index) === no);
    return p?.name ?? String(no);
  };
  const ballName = (value: string | null) => {
    if (!value) return null;
    const found = input.ballTypes?.find(b => b.name === value);
    return found?.old_excel_label || value;
  };
  return plays.map((play, index) => {
    const before = stateAt(play.at, allPages, setups, true);
    const after = stateAt(play.at + 1, allPages, setups);
    const p = convertSavedPageCoordinates(play.page);
    const offense = before.half;
    const batterNo = before.lu[offense].order[before.bi[offense]];
    const pitcherNo = before.lu[1-offense].P;
    const catcherNo = before.lu[1-offense].order.find((_, slot) => before.lu[1-offense].pos[slot] === 2) ?? null;
    const stateBases = before.bases;
    const hitType = hitTypeName[p.feature] ?? null;
    const hitStrength = p.rank && ["A", "B", "C"].includes(p.rank) ? p.rank : p.rank === "1" ? "A" : p.rank === "2" ? "B" : p.rank === "3" ? "C" : null;
    const result2 = null;
    const planValues = Object.values(p.plan ?? {}).filter(Boolean).map(v => input.planNames?.[String(v)] ?? String(v));
    const runners = stateBases.map(no => nameFor(offense, no));
    return {
      game_id: input.gameId, play_number: play.seq, inning: before.inn, top_bottom: before.half === 0 ? "表" : "裏",
      offense_team: teamNames[offense], batter_order: before.bi[offense] + 1, batter_name: nameFor(offense, batterNo),
      batter_hand: hand(p.handB ? (p.handB === "左" ? "L" : "R") : before.lu[offense].bats[before.bi[offense]] === "左" ? "L" : before.lu[offense].bats[before.bi[offense]] === "両" ? "S" : "R"),
      pitcher_name: nameFor(1-offense, pitcherNo), pitcher_hand: before.lu[1-offense].throws,
      catcher_name: nameFor(1-offense, catcherNo), runner_1st: runners[0], runner_2nd: runners[1], runner_3rd: runners[2],
      balls: before.b, strikes: before.s, outs: before.outs, pa_complete: paState(p, before, after),
      pitch_count: (before.pcount[(1 - before.half) * 1000 + pitcherNo] ?? 0) + 1, pitch_type: ballName(p.pitch_type), pitch_speed: num(p.ball_speed),
      // 座標は旧Excel・本番と同じく小数2桁
      course_x: p.course ? round2(p.course[0]) : null, course_y: p.course ? round2(p.course[1]) : null,
      batting_result: resultWords(p, before), batting_result2: result2, hit_type: hitType, hit_strength: hitStrength,
      // The scoring UI records absolute SVG field coordinates (home plate near x=46,y=238, outward/upward); legacy imports and spray-chart rendering use these same coordinates.
      hit_x: p.batted_ball ? round2(p.batted_ball.x) : null, hit_y: p.batted_ball ? round2(p.batted_ball.y) : null,
      strategy: planValues[0] ?? null, strategy2: planValues[1] ?? null, strategy_result: null,
      // 本番の試合結果と同じく「守備位置＋エラーの種類」（例：6ファンブル）
      error_type: (() => { const e = (p.catch_fielder ?? []).filter((c: any) => typeof c === "object" && c?.err) as { pos: number; err: string }[]; return e.length ? e.map(x => `${x.pos}${String(x.err).split(/[、,]/)[0]}`).join("") : null; })(),
      fielder: p.catch_fielder.map(x => typeof x === "number" ? input.positionNames?.[String(x)] ?? positionName[x] : input.positionNames?.[String(x.pos)] ?? positionName[x.pos]).filter(Boolean).join("、") || null,
    };
  });
}

export function scoreLine(input: { plays: LocalPlay[]; lineup: LineupRow[]; teamIds: [string,string]; teamNames: [string,string] }) {
  const setups = teamSetupsFromLineup(input.lineup as any, input.teamIds, input.teamNames);
  const state = initState(setups);
  for (const { page } of input.plays) {
    applyPage(state, page);
  }
  // 実際にプレイがあった回まで（最後のアウトのあと次の回へ進んだ分は数えない）
  const inningCount = Math.max(9, state.line[0].length, state.line[1].length);
  const fillInnings = (line: number[]) => Array.from({ length: inningCount }, (_, inning) => line[inning] ?? 0);
  return { awayScore: state.score[0], homeScore: state.score[1], awayRunsPerInning: fillInnings(state.line[0]), homeRunsPerInning: fillInnings(state.line[1]) };
}
