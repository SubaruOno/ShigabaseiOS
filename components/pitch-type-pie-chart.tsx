import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

// 球種ごとの固定カラー
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

type Props = {
  byType: Record<string, number>;
  total: number;
  textColor?: string;
  subTextColor?: string;
  backgroundColor?: string;
  pieSize?: number;
};

export const PitchTypePieChart = memo(function PitchTypePieChart({
  byType,
  total,
  textColor = "#111",
  subTextColor = "#666",
  backgroundColor = "#ffffff",
  pieSize = 130,
}: Props) {
  const entries = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({
      label,
      count,
      pct: Math.round((count / total) * 100),
      color: PITCH_COLOR[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));

  const cx = pieSize / 2;
  const cy = pieSize / 2;
  const r = pieSize / 2 - 3;
  const isSingle = entries.length === 1;

  let currentAngle = -Math.PI / 2;
  const paths = entries.map((e) => {
    const angle = (e.count / total) * 2 * Math.PI;
    const sa = currentAngle;
    const ea = currentAngle + (isSingle ? angle * 0.9999 : angle);
    currentAngle += angle;

    if (isSingle) {
      return { key: e.label, color: e.color, d: null };
    }

    const sx = cx + r * Math.cos(sa);
    const sy = cy + r * Math.sin(sa);
    const ex = cx + r * Math.cos(ea);
    const ey = cy + r * Math.sin(ea);
    const flag = angle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${flag} 1 ${ex} ${ey} Z`;
    return { key: e.label, color: e.color, d };
  });

  return (
    <View style={styles.container}>
      <Svg width={pieSize} height={pieSize}>
        {isSingle ? (
          <Circle cx={cx} cy={cy} r={r} fill={entries[0]?.color ?? "#ccc"} />
        ) : (
          paths.map((p) =>
            p.d ? (
              <Path
                key={p.key}
                d={p.d}
                fill={p.color}
                stroke={backgroundColor}
                strokeWidth={1.5}
              />
            ) : null
          )
        )}
      </Svg>
      <View style={styles.legend}>
        {entries.map((e) => (
          <View key={e.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: e.color }]} />
            <Text
              style={[styles.legendLabel, { color: textColor }]}
              numberOfLines={1}
            >
              {e.label}
            </Text>
            <Text style={[styles.legendStat, { color: subTextColor }]}>
              {e.count}球 ({e.pct}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 12 },
  legend: { flex: 1, gap: 5 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendLabel: { fontSize: 13, fontWeight: "500", flex: 1 },
  legendStat: { fontSize: 12, flexShrink: 0 },
});
