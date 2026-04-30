import { memo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import WebView from "react-native-webview";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 座標仕様: 264×264、Y軸反転（左上原点、キャッチャー視点）
// ストライクゾーン: (53.25, 53.25) 〜 (210.75, 210.75)
// 3×3分割境界: X/Y = [53.25, 105.75, 158.25, 210.75]
// セルサイズ: 52.5×52.5、外側マージン: 53.25
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VB     = 264;     // viewBox 固定サイズ
const SZ_MIN  = 53.25;  // ストライクゾーン 左/上
const SZ_MAX  = 210.75; // ストライクゾーン 右/下
const SZ_SIZE = 157.5;  // = SZ_MAX - SZ_MIN
const I1      = 105.75; // 3×3 内部分割 1本目
const I2      = 158.25; // 3×3 内部分割 2本目

// 表示サイズ: 画面幅 - 左右パディング(32px)、最大360px
const SVG_DISPLAY = Math.min(
  Math.floor(Dimensions.get("window").width) - 32,
  360
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 球種カラー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PITCH_COLOR: Record<string, string> = {
  ストレート:     "#ef4444",
  ツーシーム:     "#f97316",
  カットボール:   "#eab308",
  カット:         "#eab308",
  スライダー:     "#3b82f6",
  カーブ:         "#a855f7",
  シュート:       "#ec4899",
  シンカー:       "#06b6d4",
  フォーク:       "#22c55e",
  スプリット:     "#16a34a",
  チェンジ:       "#84cc16",
  チェンジアップ: "#84cc16",
  特殊球:         "#6b7280",
};
const FALLBACK_COLORS = [
  "#0ea5e9", "#d946ef", "#f59e0b", "#10b981", "#8b5cf6",
];

const BALL_RESULTS = new Set(["ボール", "四球", "死球"]);

export type PitchDot = {
  course_x: number | null;
  course_y: number | null;
  pitch_type: string | null;
  batting_result: string | null;
};

type Props = {
  pitches: PitchDot[];
  textColor?: string;
  subTextColor?: string;
  backgroundColor?: string;
};

function buildChartHtml(
  pitches: PitchDot[],
  pitchTypeOrder: string[],
  bg: string,
  displaySize: number
): string {
  const dots = pitches
    .map((p) => {
      const x = p.course_x!.toFixed(2);
      const y = p.course_y!.toFixed(2);
      const idx = p.pitch_type ? pitchTypeOrder.indexOf(p.pitch_type) : -1;
      const color = p.pitch_type
        ? (PITCH_COLOR[p.pitch_type] ?? FALLBACK_COLORS[Math.max(0, idx) % FALLBACK_COLORS.length])
        : "#999";
      const isBall = p.batting_result == null || BALL_RESULTS.has(p.batting_result);
      const opacity = isBall ? "0.35" : "0.9";
      return `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}" opacity="${opacity}" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html, body { margin:0; padding:0; width:${displaySize}px; height:${displaySize}px; overflow:hidden; background:${bg}; }
</style>
</head><body>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${VB} ${VB}"
     width="${displaySize}" height="${displaySize}"
     style="display:block;overflow:hidden;">
  <defs>
    <clipPath id="clip">
      <rect x="0" y="0" width="${VB}" height="${VB}"/>
    </clipPath>
  </defs>
  <!-- 全体背景 (ボールゾーン) -->
  <rect x="0" y="0" width="${VB}" height="${VB}" fill="rgba(240,241,243,0.7)" stroke="none"/>
  <!-- ストライクゾーン背景 -->
  <rect x="${SZ_MIN}" y="${SZ_MIN}" width="${SZ_SIZE}" height="${SZ_SIZE}" fill="rgba(220,232,255,0.5)" stroke="none"/>
  <!-- 3×3 内部分割線 -->
  <line x1="${I1}" y1="${SZ_MIN}" x2="${I1}" y2="${SZ_MAX}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${I2}" y1="${SZ_MIN}" x2="${I2}" y2="${SZ_MAX}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${SZ_MIN}" y1="${I1}" x2="${SZ_MAX}" y2="${I1}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${SZ_MIN}" y1="${I2}" x2="${SZ_MAX}" y2="${I2}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <!-- ストライクゾーン外枠 -->
  <rect x="${SZ_MIN}" y="${SZ_MIN}" width="${SZ_SIZE}" height="${SZ_SIZE}" fill="none" stroke="#333" stroke-width="2"/>
  <!-- 投球ドット (viewBox全体でクリップ) -->
  <g clip-path="url(#clip)">
    ${dots}
  </g>
</svg>
</body></html>`;
}

export function buildLocationChartSvg(pitches: PitchDot[], size = 260, clipId = "loc-0"): string {
  const validPitches = pitches.filter(
    (p) => p.course_x != null && p.course_y != null && p.course_x !== 0 && p.course_y !== 0 && p.pitch_type !== "0"
  );

  const pitchTypeOrder: string[] = [];
  for (const p of validPitches) {
    if (p.pitch_type && !pitchTypeOrder.includes(p.pitch_type)) pitchTypeOrder.push(p.pitch_type);
  }

  const dots = validPitches.map((p) => {
    const x = p.course_x!.toFixed(2);
    const y = p.course_y!.toFixed(2);
    const idx = p.pitch_type ? pitchTypeOrder.indexOf(p.pitch_type) : -1;
    const color = p.pitch_type
      ? (PITCH_COLOR[p.pitch_type] ?? FALLBACK_COLORS[Math.max(0, idx) % FALLBACK_COLORS.length])
      : "#999";
    const isBall = p.batting_result == null || BALL_RESULTS.has(p.batting_result);
    const opacity = isBall ? "0.35" : "0.9";
    return `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}" opacity="${opacity}" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" style="display:block;overflow:hidden;">
  <defs><clipPath id="${clipId}"><rect x="0" y="0" width="${VB}" height="${VB}"/></clipPath></defs>
  <rect x="0" y="0" width="${VB}" height="${VB}" fill="rgba(240,241,243,0.7)" stroke="none"/>
  <rect x="${SZ_MIN}" y="${SZ_MIN}" width="${SZ_SIZE}" height="${SZ_SIZE}" fill="rgba(220,232,255,0.5)" stroke="none"/>
  <line x1="${I1}" y1="${SZ_MIN}" x2="${I1}" y2="${SZ_MAX}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${I2}" y1="${SZ_MIN}" x2="${I2}" y2="${SZ_MAX}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${SZ_MIN}" y1="${I1}" x2="${SZ_MAX}" y2="${I1}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <line x1="${SZ_MIN}" y1="${I2}" x2="${SZ_MAX}" y2="${I2}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
  <rect x="${SZ_MIN}" y="${SZ_MIN}" width="${SZ_SIZE}" height="${SZ_SIZE}" fill="none" stroke="#333" stroke-width="2"/>
  <g clip-path="url(#${clipId})">${dots}</g>
</svg>`;
}

export const PitchLocationChart = memo(function PitchLocationChart({
  pitches,
  textColor = "#111",
  subTextColor = "#666",
  backgroundColor = "#ffffff",
}: Props) {
  const validPitches = pitches.filter(
    (p) =>
      p.course_x != null &&
      p.course_y != null &&
      p.course_x !== 0 &&
      p.course_y !== 0 &&
      p.pitch_type !== "0"
  );

  if (validPitches.length === 0) return null;

  const allWithCoords = pitches.filter(
    (p) => p.course_x != null && p.course_y != null && p.course_x !== 0 && p.course_y !== 0
  );
  const strikeCount = allWithCoords.filter(
    (p) => p.batting_result != null && !BALL_RESULTS.has(p.batting_result)
  ).length;
  const total = allWithCoords.length;
  const strikeRate = total > 0
    ? ((strikeCount / total) * 100).toFixed(1)
    : "0.0";

  const pitchTypeOrder: string[] = [];
  for (const p of validPitches) {
    if (p.pitch_type && !pitchTypeOrder.includes(p.pitch_type)) {
      pitchTypeOrder.push(p.pitch_type);
    }
  }

  const html = buildChartHtml(validPitches, pitchTypeOrder, backgroundColor, SVG_DISPLAY);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>投球コース</Text>
        <Text style={[styles.strikeRate, { color: subTextColor }]}>
          ストライク率{" "}
          <Text style={{ color: textColor, fontWeight: "600" }}>
            {strikeRate}%
          </Text>
          {"  "}
          <Text style={{ fontSize: 11 }}>
            ({strikeCount}/{total}球)
          </Text>
        </Text>
      </View>

      <View style={{ width: SVG_DISPLAY, height: SVG_DISPLAY, overflow: "hidden" }}>
        <WebView
          source={{ html }}
          style={{ width: SVG_DISPLAY, height: SVG_DISPLAY }}
          scrollEnabled={false}
          originWhitelist={["*"]}
          androidLayerType="hardware"
        />
      </View>

      {/* 凡例: 横並び折り返し */}
      <View style={styles.legend}>
        {pitchTypeOrder.map((type, i) => {
          const color =
            PITCH_COLOR[type] ??
            FALLBACK_COLORS[i % FALLBACK_COLORS.length];
          const count = validPitches.filter(
            (p) => p.pitch_type === type
          ).length;
          return (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text
                style={[styles.legendLabel, { color: textColor }]}
                numberOfLines={1}
              >
                {type} {count}
              </Text>
            </View>
          );
        })}
        <View style={styles.legendSpacer} />
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: "#888" }]} />
          <Text style={[styles.legendLabel, { color: subTextColor }]}>ストライク</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: "#888", opacity: 0.35 }]} />
          <Text style={[styles.legendLabel, { color: subTextColor }]}>ボール</Text>
        </View>
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
  strikeRate: { fontSize: 12 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  legendSpacer: { width: "100%" },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  legendLabel: { fontSize: 11, fontWeight: "500" },
});
