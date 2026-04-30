import {
  BatterStats,
  PitchForStats,
  getPAResultPitches,
  applyBattingResult,
} from "./batting-stats";

export type { BatterStats };

export type OrderStats = BatterStats & { order: number };

export type PitcherAnalyticsStats = {
  name: string;
  totalPitches: number;
  strikeRate: string;   // "63.2%"
  avgSpeed: number | null;
  maxSpeed: number | null;
  byType: Record<string, number>;
};

export type PitchForAnalytics = PitchForStats & {
  pitcher_name: string | null;
  pitch_type: string | null;
  pitch_speed: number | null;
  course_x: number | null;
  course_y: number | null;
};

// pitch-location-chart.tsx と同ロジック
const BALL_RESULTS = new Set(["ボール", "四球", "死球"]);

// 全選手合算のチーム1行
export function aggregateTeamBatting(pitches: PitchForStats[]): BatterStats {
  const paPitches = getPAResultPitches(pitches);
  const s: BatterStats = {
    name: "チーム",
    order: 0,
    pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, k: 0,
  };
  for (const p of paPitches) {
    applyBattingResult(s, p.batting_result?.trim() ?? "");
  }
  return s;
}

// 打順 1〜9 ごとの集計
export function aggregateByOrder(pitches: PitchForStats[]): OrderStats[] {
  const paPitches = getPAResultPitches(pitches);
  const map = new Map<number, OrderStats>();

  for (const p of paPitches) {
    const order = p.batter_order ?? 99;
    if (!map.has(order)) {
      map.set(order, {
        name: `${order}番`,
        order,
        pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, k: 0,
      });
    }
    applyBattingResult(map.get(order)!, p.batting_result?.trim() ?? "");
  }

  return Array.from(map.values())
    .filter((s) => s.order >= 1 && s.order <= 9)
    .sort((a, b) => a.order - b.order);
}

// 投手別集計
export function aggregatePerPitcher(pitches: PitchForAnalytics[]): PitcherAnalyticsStats[] {
  type Entry = {
    speeds: number[];
    types: string[];
    withCoords: { batting_result: string | null }[];
  };
  const map = new Map<string, Entry>();

  for (const p of pitches) {
    const name = p.pitcher_name ?? "不明";
    if (!map.has(name)) {
      map.set(name, { speeds: [], types: [], withCoords: [] });
    }
    const entry = map.get(name)!;
    if (p.pitch_type && p.pitch_type !== "0") entry.types.push(p.pitch_type);
    if (p.pitch_speed && p.pitch_speed > 0) entry.speeds.push(p.pitch_speed);
    if (
      p.course_x != null && p.course_x !== 0 &&
      p.course_y != null && p.course_y !== 0
    ) {
      entry.withCoords.push({ batting_result: p.batting_result });
    }
  }

  const result: PitcherAnalyticsStats[] = [];
  for (const [name, entry] of map) {
    const byType: Record<string, number> = {};
    for (const t of entry.types) byType[t] = (byType[t] ?? 0) + 1;

    const total = entry.withCoords.length;
    const strikes = entry.withCoords.filter(
      (p) => p.batting_result != null && !BALL_RESULTS.has(p.batting_result)
    ).length;
    const strikeRate = total > 0 ? `${((strikes / total) * 100).toFixed(1)}%` : "—";

    const avgSpeed =
      entry.speeds.length > 0
        ? Math.round(entry.speeds.reduce((a, b) => a + b, 0) / entry.speeds.length)
        : null;
    const maxSpeed = entry.speeds.length > 0 ? Math.max(...entry.speeds) : null;

    result.push({
      name,
      totalPitches: entry.types.length,
      strikeRate,
      avgSpeed,
      maxSpeed,
      byType,
    });
  }

  return result.sort((a, b) => b.totalPitches - a.totalPitches);
}
