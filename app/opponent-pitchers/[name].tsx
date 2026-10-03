import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Redirect, useNavigation } from "expo-router";
import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAll } from "@/lib/fetch-all";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import {
  PitchTypePieChart,
  PITCH_COLOR,
  FALLBACK_COLORS,
} from "@/components/pitch-type-pie-chart";

type Pitch = {
  pitch_type: string | null;
  pitch_speed: number | null;
  batting_result: string | null;
  game_id: string;
  games: {
    date: string | null;
    away_team: string | null;
    home_team: string | null;
  } | null;
};

type PitchTypeStat = {
  type: string;
  count: number;
  pct: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  color: string;
};

type GameRecord = {
  game_id: string;
  date: string | null;
  away_team: string | null;
  home_team: string | null;
  pitchCount: number;
};

export default function OpponentPitcherDetail() {
  const { name: encodedName } = useLocalSearchParams<{ name: string }>();
  const name = decodeURIComponent(encodedName ?? "");
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const navigation = useNavigation();
  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  const { data: pitches, isLoading } = useQuery<Pitch[]>({
    queryKey: ["opponent-pitcher-detail", name],
    queryFn: async () => {
      // 1000行を超える投手でも全部読む
      const data = await fetchAll((from, to) => supabase
        .from("pitches")
        .select(
          "id, pitch_type, pitch_speed, batting_result, game_id, games(date, away_team, home_team)"
        )
        .eq("pitcher_name", name)
        .order("id")
        .range(from, to));
      return data as unknown as Pitch[];
    },
    enabled: !!user && !!name,
  });

  const { pitchTypeStats, byType, gameHistory, totalPitches, validTotal } = useMemo(() => {
    if (!pitches)
      return { pitchTypeStats: [], byType: {}, gameHistory: [], totalPitches: 0, validTotal: 0 };

    const totalPitches = pitches.length;

    // 球種ごとの球速リスト
    // "0" や数字のみの球種は空セル由来のゴミデータなので除外
    // pitch_speed = 0 も同様に無効値として除外
    const typeSpeedMap = new Map<string, number[]>();
    const typeCounts = new Map<string, number>();
    for (const p of pitches) {
      if (!p.pitch_type) continue;
      if (/^\d+$/.test(p.pitch_type)) continue; // "0" などの数値文字列を除外
      typeCounts.set(p.pitch_type, (typeCounts.get(p.pitch_type) ?? 0) + 1);
      if (!typeSpeedMap.has(p.pitch_type)) typeSpeedMap.set(p.pitch_type, []);
      if (p.pitch_speed != null && p.pitch_speed > 0) typeSpeedMap.get(p.pitch_type)!.push(p.pitch_speed);
    }

    // 有効な球種の合計球数（null・"0" を除いたもの）を割合計算に使う
    const validTotal = Array.from(typeCounts.values()).reduce((a, b) => a + b, 0);

    const sortedTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);

    const pitchTypeStats: PitchTypeStat[] = sortedTypes.map(([type, count], i) => {
      const speeds = typeSpeedMap.get(type) ?? [];
      return {
        type,
        count,
        pct: Math.round((count / validTotal) * 100),
        avg: speeds.length
          ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
          : null,
        min: speeds.length ? Math.min(...speeds) : null,
        max: speeds.length ? Math.max(...speeds) : null,
        color: PITCH_COLOR[type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      };
    });

    // PitchTypePieChart 用
    const byType = Object.fromEntries(typeCounts);

    // 試合履歴
    const gameMap = new Map<string, GameRecord>();
    for (const p of pitches) {
      if (!gameMap.has(p.game_id)) {
        gameMap.set(p.game_id, {
          game_id: p.game_id,
          date: p.games?.date ?? null,
          away_team: p.games?.away_team ?? null,
          home_team: p.games?.home_team ?? null,
          pitchCount: 0,
        });
      }
      gameMap.get(p.game_id)!.pitchCount++;
    }
    const gameHistory = Array.from(gameMap.values()).sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "")
    );

    return { pitchTypeStats, byType, gameHistory, totalPitches, validTotal };
  }, [pitches]);

  if (!user) return <Redirect href="/login" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          size="large"
          color={colors.tint}
          style={{ marginTop: 40 }}
        />
      ) : (
        <>
          {/* 球種・球速セクション */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              球種・球速
            </Text>
            <Text style={[styles.totalLabel, { color: colors.icon }]}>
              総投球数: {validTotal}球
            </Text>

            {pitchTypeStats.length === 0 ? (
              <Text style={[styles.empty, { color: colors.icon }]}>
                球種データなし
              </Text>
            ) : (
              <View style={styles.chartRow}>
                {/* 円グラフ（レジェンドなし） */}
                <PitchTypePieChart
                  byType={byType}
                  total={validTotal}
                  textColor={colors.text}
                  subTextColor={colors.icon}
                  backgroundColor={colors.cardBg}
                  pieSize={140}
                  showLegend={false}
                />

                {/* 球速帯テーブル */}
                <View style={styles.speedTable}>
                  {/* ヘッダー */}
                  <View style={[styles.tableHeaderRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[styles.tableHeaderCell, styles.colType, { color: colors.icon }]}>
                      球種
                    </Text>
                    <Text style={[styles.tableHeaderCell, styles.colAvg, { color: colors.icon }]}>
                      平均
                    </Text>
                    <Text style={[styles.tableHeaderCell, styles.colRange, { color: colors.icon }]}>
                      幅
                    </Text>
                  </View>

                  {/* 行 */}
                  {pitchTypeStats.map((s, i) => (
                    <View
                      key={s.type}
                      style={[
                        styles.tableRow,
                        { borderBottomColor: colors.borderColor },
                        i === pitchTypeStats.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={[styles.colType, styles.typeCell]}>
                        <View style={[styles.dot, { backgroundColor: s.color }]} />
                        <Text
                          style={[styles.typeText, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {s.type}
                        </Text>
                      </View>
                      <Text style={[styles.colAvg, styles.cellText, { color: colors.text }]}>
                        {s.avg != null ? `${s.avg}` : "—"}
                      </Text>
                      <Text style={[styles.colRange, styles.cellText, { color: colors.icon }]}>
                        {s.min != null ? `${s.min}-${s.max}` : "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* 対戦履歴セクション */}
          <View
            style={[
              styles.section,
              { backgroundColor: colors.cardBg, marginTop: 12 },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              対戦履歴
            </Text>
            {gameHistory.map((g, i) => (
              <View
                key={g.game_id}
                style={[
                  styles.gameRow,
                  { borderBottomColor: colors.borderColor },
                  i === gameHistory.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.gameDate, { color: colors.text }]}>
                  {formatDate(g.date)}
                </Text>
                <Text
                  style={[styles.gameTeams, { color: colors.icon }]}
                  numberOfLines={1}
                >
                  {g.away_team} vs {g.home_team}
                </Text>
                <Text style={[styles.gamePitches, { color: colors.icon }]}>
                  {g.pitchCount}球
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  section: { borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  totalLabel: { fontSize: 12, marginBottom: 14 },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  speedTable: {
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "500",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  typeText: { fontSize: 12, fontWeight: "500", flexShrink: 1 },
  cellText: { fontSize: 12 },
  colType: { flex: 2 },
  colAvg: { flex: 1, textAlign: "right" },
  colRange: { flex: 2, textAlign: "right" },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  gameDate: { fontSize: 13, fontWeight: "500", width: 75 },
  gameTeams: { fontSize: 13, flex: 1 },
  gamePitches: { fontSize: 12 },
  empty: { fontSize: 13, textAlign: "center", paddingVertical: 8 },
});
