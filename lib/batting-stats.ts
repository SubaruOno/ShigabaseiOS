// VBAマクロ「結果および記入」の全終端結果
export const TERMINAL_RESULTS = new Set([
  // 安打
  "単打", "二塁打", "エンタイトル", "三塁打", "本塁打", "ランニング本塁打", "ホームラン",
  // 凡打
  "凡打死", "凡打出塁", "ファールフライ",
  // 出塁（打数なし）
  "四球", "死球",
  // 三振
  "空振り三振", "見逃し三振", "振り逃げ", "K3",
  // 犠打・犠飛
  "犠飛", "犠打",
  // エラー・野選
  "エラー", "野手選択", "フィルダースチョイス",
]);

export function isTerminal(result: string | null): boolean {
  if (!result || result === "0") return false;
  return TERMINAL_RESULTS.has(result);
}

export type PitchForStats = {
  pa_complete: string | null;
  batter_name: string | null;
  batter_order: number | null;
  batting_result: string | null;
};

export type BatterStats = {
  name: string;
  order: number;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  k: number;
};

// pa_complete = "打席完了" を優先し、なければ batting_result で判定
export function getPAResultPitches<T extends PitchForStats>(pitches: T[]): T[] {
  const hasPaComplete = pitches.some((p) => p.pa_complete === "打席完了");
  if (hasPaComplete) {
    return pitches.filter((p) => p.pa_complete === "打席完了");
  }
  return pitches.filter((p) => {
    const r = p.batting_result?.trim();
    return r && isTerminal(r);
  });
}

// 1回の打席結果を受け取り stats を更新（pa++ 込み）
export function applyBattingResult(s: BatterStats, result: string): void {
  s.pa++;
  switch (result) {
    case "単打":
      s.ab++; s.hits++; break;
    case "二塁打":
    case "エンタイトル":
      s.ab++; s.hits++; s.doubles++; break;
    case "三塁打":
      s.ab++; s.hits++; s.triples++; break;
    case "本塁打":
    case "ランニング本塁打":
      s.ab++; s.hits++; s.hr++; break;
    case "四球":
      s.bb++; break;
    case "死球":
      s.hbp++; break;
    case "見逃し三振":
    case "空振り三振":
    case "振り逃げ":
    case "K3":
      s.ab++; s.k++; break;
    case "犠打":
    case "犠飛":
      break;
    case "凡打死":
    case "凡打出塁":
    case "ファールフライ":
    case "エラー":
    case "野手選択":
    case "フィルダースチョイス":
      s.ab++; break;
    // 上記以外はPA++のみ（打数なし）
  }
}

// pitches 配列から全打者を集計（top_bottom フィルタは呼び出し側で行う）
export function aggregateBatterStats(pitches: PitchForStats[]): BatterStats[] {
  const paPitches = getPAResultPitches(pitches);
  const map = new Map<string, BatterStats>();

  for (const p of paPitches) {
    const name = p.batter_name ?? "不明";
    const order = p.batter_order ?? 99;
    const result = p.batting_result?.trim() ?? "";

    if (!map.has(name)) {
      map.set(name, { name, order, pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, k: 0 });
    }
    applyBattingResult(map.get(name)!, result);
  }

  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}
