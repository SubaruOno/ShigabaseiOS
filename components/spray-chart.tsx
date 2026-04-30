import { memo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import WebView from "react-native-webview";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スプレーチャート
// 座標系はVBAツールの絶対座標（Excelポイント単位）に基づく固定マッピング
// VBA: AddLine(161.25, 248.25, BXpt+30, BYpt+30)
// → ホームベースのデータ座標 = (131.25, 218.25)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SVG_W = 400;
const SVG_H = 360;
const HOME_X = 200;
const HOME_Y = 335;
const FOUL_LEFT_X = -30;
const FOUL_LEFT_Y = 150;
const FOUL_RIGHT_X = 430;
const FOUL_RIGHT_Y = 150;

// VBAのフィールド画像座標からSVGへの固定マッピング
// VBA画像上のホームベース位置: (131.25, 218.25) pts
// スケール: SVG foul(185px) / data foul(118pts) ≈ 1.56
const DATA_HOME_X = 131.25;
const DATA_HOME_Y = 218.25;
const DATA_SCALE = 1.56;

const SVG_DISPLAY = Math.min(
  Math.floor(Dimensions.get("window").width) - 32,
  380
);

// インプレーの結果のみ（三振・四死球を除く）
const BALLS_IN_PLAY = new Set([
  "単打", "二塁打", "エンタイトル", "三塁打", "本塁打", "ランニング本塁打", "ホームラン",
  "凡打死", "凡打出塁", "ファールフライ",
  "犠飛", "犠打",
  "エラー", "野手選択", "フィルダースチョイス",
]);

function getHitCategory(result: string | null): { color: string; label: string } {
  if (!result) return { color: "#9ca3af", label: "アウト" };
  if (result === "本塁打" || result === "ランニング本塁打" || result === "ホームラン")
    return { color: "#ef4444", label: "本塁打" };
  if (result === "三塁打")
    return { color: "#a855f7", label: "三塁打" };
  if (result === "二塁打" || result === "エンタイトル")
    return { color: "#22c55e", label: "二塁打" };
  if (result === "単打")
    return { color: "#3b82f6", label: "単打" };
  if (result === "エラー" || result === "野手選択" || result === "フィルダースチョイス")
    return { color: "#f97316", label: "エラー等" };
  return { color: "#9ca3af", label: "アウト" };
}

export type HitDot = {
  hit_x: number | null;
  hit_y: number | null;
  batting_result: string | null;
  pa_complete: string | null;
};

type Props = {
  hits: HitDot[];
  textColor?: string;
  backgroundColor?: string;
};

function buildSprayHtml(
  ballsInPlay: HitDot[],
  bg: string,
  displaySize: number
): string {
  const fieldRadius = Math.round(
    Math.sqrt((HOME_X - FOUL_LEFT_X) ** 2 + (HOME_Y - FOUL_LEFT_Y) ** 2)
  );

  // ファウルライン方向の単位ベクトル（右側）
  const fuX =  (FOUL_RIGHT_X - HOME_X) / fieldRadius; //  0.500
  const fuY =  (FOUL_RIGHT_Y - HOME_Y) / fieldRadius; // -0.866

  // 1B・3B はファウルライン上（d = 内野のスケール）
  const d = 80;
  const b1x = Math.round(HOME_X + fuX * d);   // 右ファウル線上
  const b1y = Math.round(HOME_Y + fuY * d);
  const b3x = Math.round(HOME_X - fuX * d);   // 左ファウル線上
  const b3y = b1y;
  const b2x = HOME_X;                          // 2B = 正面方向
  const b2y = Math.round(HOME_Y + fuY * d * 2);
  // ピッチャーマウンド（本塁〜2B の約 47.5% の位置）
  const moundY = Math.round(HOME_Y + fuY * d * 2 * 0.475);

  // 内野弧の半径 = ホームから2Bまでの距離（弧の頂点が2Bになる）
  const infieldR = Math.round(Math.sqrt((b2x - HOME_X) ** 2 + (b2y - HOME_Y) ** 2));
  const if1x = Math.round(HOME_X + fuX * infieldR);
  const if1y = Math.round(HOME_Y + fuY * infieldR);
  const if3x = Math.round(HOME_X - fuX * infieldR);
  const if3y = if1y;

  const dots = ballsInPlay.map((h) => {
    // VBAの固定座標マッピング
    // 小さいY値 = 外野（スクリーン座標）→ SVGも同方向
    const svgX = HOME_X + (h.hit_x! - DATA_HOME_X) * DATA_SCALE;
    const svgY = HOME_Y + (h.hit_y! - DATA_HOME_Y) * DATA_SCALE;

    const { color } = getHitCategory(h.batting_result);
    const isHit = h.batting_result != null && BALLS_IN_PLAY.has(h.batting_result) &&
      !["凡打死", "凡打出塁", "ファールフライ", "犠打"].includes(h.batting_result);
    const opacity = isHit ? "0.85" : "0.45";
    return `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="5" fill="${color}" opacity="${opacity}" stroke="white" stroke-width="0.8"/>`;
  }).join("");

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;width:${displaySize}px;height:${Math.round(displaySize * SVG_H / SVG_W)}px;overflow:hidden;background:${bg};}</style>
</head><body>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${SVG_W} ${SVG_H}"
     width="${displaySize}" height="${Math.round(displaySize * SVG_H / SVG_W)}"
     style="display:block;">
  <defs>
    <clipPath id="field-clip">
      <path d="M ${HOME_X} ${HOME_Y} L ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y} Z"/>
    </clipPath>
  </defs>

  <!-- 外野（芝） -->
  <path d="M ${HOME_X} ${HOME_Y} L ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y} Z"
        fill="#d1fae5" stroke="none"/>

  <!-- 内野（土）: ホーム→内野線上→弧(radius=home〜2B距離)→内野線上→ホーム = 扇形 -->
  <path d="M ${HOME_X} ${HOME_Y} L ${if1x} ${if1y} A ${infieldR} ${infieldR} 0 0 0 ${if3x} ${if3y} Z"
        fill="#fde68a" stroke="none" clip-path="url(#field-clip)"/>

  <!-- ファウルライン -->
  <line x1="${HOME_X}" y1="${HOME_Y}" x2="${FOUL_LEFT_X}" y2="${FOUL_LEFT_Y}"
        stroke="white" stroke-width="1.5" opacity="0.9"/>
  <line x1="${HOME_X}" y1="${HOME_Y}" x2="${FOUL_RIGHT_X}" y2="${FOUL_RIGHT_Y}"
        stroke="white" stroke-width="1.5" opacity="0.9"/>

  <!-- 外野フェンス -->
  <path d="M ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y}"
        fill="none" stroke="white" stroke-width="1.5" opacity="0.9"/>

  <!-- 内野〜外野の境界線（草ライン） -->
  <path d="M ${if1x} ${if1y} A ${infieldR} ${infieldR} 0 0 0 ${if3x} ${if3y}"
        fill="none" stroke="#86efac" stroke-width="1.5"/>

  <!-- ベース（1B, 2B, 3B） -->
  <rect x="${b1x - 4}" y="${b1y - 4}" width="8" height="8"
        fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b1x},${b1y})"/>
  <rect x="${b2x - 4}" y="${b2y - 4}" width="8" height="8"
        fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b2x},${b2y})"/>
  <rect x="${b3x - 4}" y="${b3y - 4}" width="8" height="8"
        fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b3x},${b3y})"/>

  <!-- ホームベース -->
  <polygon points="${HOME_X},${HOME_Y - 6} ${HOME_X + 4},${HOME_Y} ${HOME_X + 3},${HOME_Y + 4} ${HOME_X - 3},${HOME_Y + 4} ${HOME_X - 4},${HOME_Y}"
           fill="white" stroke="#888" stroke-width="0.8"/>

  <!-- ピッチャーマウンド -->
  <circle cx="${HOME_X}" cy="${moundY}" r="6" fill="#fde68a" stroke="#d97706" stroke-width="0.8"/>

  <!-- 打球ドット（フィールド内クリップ） -->
  <g clip-path="url(#field-clip)">
    ${dots}
  </g>
</svg>
</body></html>`;
}

export function buildSprayChartSvg(hits: HitDot[], size = 300, clipId = "spray-0"): string {
  const ballsInPlay = hits.filter(
    (h) =>
      h.hit_x != null && h.hit_y != null &&
      h.hit_x !== 0 && h.hit_y !== 0 &&
      h.batting_result != null && BALLS_IN_PLAY.has(h.batting_result) &&
      h.pa_complete === "打席完了"
  );

  const fieldRadius = Math.round(
    Math.sqrt((HOME_X - FOUL_LEFT_X) ** 2 + (HOME_Y - FOUL_LEFT_Y) ** 2)
  );
  const fuX = (FOUL_RIGHT_X - HOME_X) / fieldRadius;
  const fuY = (FOUL_RIGHT_Y - HOME_Y) / fieldRadius;
  const d = 80;
  const b1x = Math.round(HOME_X + fuX * d);
  const b1y = Math.round(HOME_Y + fuY * d);
  const b3x = Math.round(HOME_X - fuX * d);
  const b3y = b1y;
  const b2x = HOME_X;
  const b2y = Math.round(HOME_Y + fuY * d * 2);
  const moundY = Math.round(HOME_Y + fuY * d * 2 * 0.475);
  const infieldR = Math.round(Math.sqrt((b2x - HOME_X) ** 2 + (b2y - HOME_Y) ** 2));
  const if1x = Math.round(HOME_X + fuX * infieldR);
  const if1y = Math.round(HOME_Y + fuY * infieldR);
  const if3x = Math.round(HOME_X - fuX * infieldR);
  const if3y = if1y;

  const dots = ballsInPlay.map((h) => {
    const svgX = HOME_X + (h.hit_x! - DATA_HOME_X) * DATA_SCALE;
    const svgY = HOME_Y + (h.hit_y! - DATA_HOME_Y) * DATA_SCALE;
    const { color } = getHitCategory(h.batting_result);
    const isHit = h.batting_result != null && BALLS_IN_PLAY.has(h.batting_result) &&
      !["凡打死", "凡打出塁", "ファールフライ", "犠打"].includes(h.batting_result);
    const opacity = isHit ? "0.85" : "0.45";
    return `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="5" fill="${color}" opacity="${opacity}" stroke="white" stroke-width="0.8"/>`;
  }).join("");

  const svgH = Math.round(size * SVG_H / SVG_W);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${size}" height="${svgH}" style="display:block;">
  <defs><clipPath id="${clipId}"><path d="M ${HOME_X} ${HOME_Y} L ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y} Z"/></clipPath></defs>
  <path d="M ${HOME_X} ${HOME_Y} L ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y} Z" fill="#d1fae5" stroke="none"/>
  <path d="M ${HOME_X} ${HOME_Y} L ${if1x} ${if1y} A ${infieldR} ${infieldR} 0 0 0 ${if3x} ${if3y} Z" fill="#fde68a" stroke="none" clip-path="url(#${clipId})"/>
  <line x1="${HOME_X}" y1="${HOME_Y}" x2="${FOUL_LEFT_X}" y2="${FOUL_LEFT_Y}" stroke="white" stroke-width="1.5" opacity="0.9"/>
  <line x1="${HOME_X}" y1="${HOME_Y}" x2="${FOUL_RIGHT_X}" y2="${FOUL_RIGHT_Y}" stroke="white" stroke-width="1.5" opacity="0.9"/>
  <path d="M ${FOUL_LEFT_X} ${FOUL_LEFT_Y} A ${fieldRadius} ${fieldRadius} 0 0 1 ${FOUL_RIGHT_X} ${FOUL_RIGHT_Y}" fill="none" stroke="white" stroke-width="1.5" opacity="0.9"/>
  <path d="M ${if1x} ${if1y} A ${infieldR} ${infieldR} 0 0 0 ${if3x} ${if3y}" fill="none" stroke="#86efac" stroke-width="1.5"/>
  <rect x="${b1x - 4}" y="${b1y - 4}" width="8" height="8" fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b1x},${b1y})"/>
  <rect x="${b2x - 4}" y="${b2y - 4}" width="8" height="8" fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b2x},${b2y})"/>
  <rect x="${b3x - 4}" y="${b3y - 4}" width="8" height="8" fill="white" stroke="#888" stroke-width="0.8" transform="rotate(45,${b3x},${b3y})"/>
  <polygon points="${HOME_X},${HOME_Y - 6} ${HOME_X + 4},${HOME_Y} ${HOME_X + 3},${HOME_Y + 4} ${HOME_X - 3},${HOME_Y + 4} ${HOME_X - 4},${HOME_Y}" fill="white" stroke="#888" stroke-width="0.8"/>
  <circle cx="${HOME_X}" cy="${moundY}" r="6" fill="#fde68a" stroke="#d97706" stroke-width="0.8"/>
  <g clip-path="url(#${clipId})">${dots}</g>
</svg>`;
}

export const SprayChart = memo(function SprayChart({ hits, textColor = "#111", backgroundColor = "#ffffff" }: Props) {
  // インプレーの打席完了投球のみ抽出
  const ballsInPlay = hits.filter(
    (h) =>
      h.hit_x != null &&
      h.hit_y != null &&
      h.hit_x !== 0 &&
      h.hit_y !== 0 &&
      h.batting_result != null &&
      BALLS_IN_PLAY.has(h.batting_result) &&
      h.pa_complete === "打席完了"
  );

  if (ballsInPlay.length === 0) return null;

  const svgHeight = Math.round(SVG_DISPLAY * SVG_H / SVG_W);
  const html = buildSprayHtml(ballsInPlay, backgroundColor, SVG_DISPLAY);

  // 凡例集計
  const categories: Record<string, { color: string; count: number }> = {};
  for (const h of ballsInPlay) {
    const { color, label } = getHitCategory(h.batting_result);
    if (!categories[label]) categories[label] = { color, count: 0 };
    categories[label].count++;
  }
  const categoryOrder = ["本塁打", "三塁打", "二塁打", "単打", "エラー等", "アウト"];
  const legendItems = categoryOrder
    .filter((l) => categories[l])
    .map((l) => ({ label: l, ...categories[l] }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>打球方向</Text>
        <Text style={[styles.sub, { color: textColor, opacity: 0.5 }]}>
          {ballsInPlay.length}打球
        </Text>
      </View>
      <View style={{ width: SVG_DISPLAY, height: svgHeight, overflow: "hidden" }}>
        <WebView
          source={{ html }}
          style={{ width: SVG_DISPLAY, height: svgHeight }}
          scrollEnabled={false}
          originWhitelist={["*"]}
          androidLayerType="hardware"
        />
      </View>
      <View style={styles.legend}>
        {legendItems.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendLabel, { color: textColor }]}>
              {item.label} {item.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: 13, fontWeight: "600" },
  sub: { fontSize: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  legendLabel: { fontSize: 11, fontWeight: "500" },
});
