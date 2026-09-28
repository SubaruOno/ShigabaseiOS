import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, Stack, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  G,
  Rect,
  Line,
  Circle,
  Path,
  Text as SvgText,
} from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  PitchLocationChart,
  PitchDot,
} from "@/components/pitch-location-chart";

const PITCH_TYPES = [
  "ストレート","ツーシーム","カットボール","スライダー","カーブ",
  "シュート","シンカー","フォーク","スプリット","チェンジアップ","特殊球",
];

type Session = {
  id: string;
  player_id: string;
  date: string;
  session_name: string | null;
};

type Pitch = {
  id: string;
  session_id: string;
  pitch_number: number;
  pitch_type: string;
  pitch_speed: number | null;
  is_strike: boolean;
  course_x: number | null;
  course_y: number | null;
};

type TypeStat = { count: number; strikes: number; speeds: number[] };

type SessionStats = {
  session: Session;
  pitches: Pitch[];
  total: number;
  strikes: number;
  strikeRate: number;
  byType: Map<string, TypeStat>;
};

function computeStats(session: Session, pitches: Pitch[]): SessionStats {
  const byType = new Map<string, TypeStat>();
  let strikes = 0;
  for (const p of pitches) {
    if (p.is_strike) strikes++;
    const t = byType.get(p.pitch_type) ?? { count: 0, strikes: 0, speeds: [] };
    t.count++;
    if (p.is_strike) t.strikes++;
    if (p.pitch_speed != null) t.speeds.push(p.pitch_speed);
    byType.set(p.pitch_type, t);
  }
  return {
    session,
    pitches,
    total: pitches.length,
    strikes,
    strikeRate: pitches.length > 0 ? (strikes / pitches.length) * 100 : 0,
    byType,
  };
}

type TrendPoint = { date: string; strikeRate: number };

function TrendChart({
  points,
  textColor,
  lineColor,
}: {
  points: TrendPoint[];
  textColor: string;
  lineColor: string;
}) {
  // 画面の回転に追従させるためフックで幅を取る
  const W = useWindowDimensions().width - 64;
  const H = 170;
  const PAD = { t: 12, r: 12, b: 44, l: 40 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = points.length;

  const toX = (i: number) =>
    PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const toY = (v: number) => PAD.t + (1 - v / 100) * cH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.strikeRate).toFixed(1)}`)
    .join(" ");

  const yLabels = [0, 25, 50, 75, 100];

  return (
    <Svg width={W} height={H}>
      {yLabels.map((v) => (
        <G key={v}>
          <Line
            x1={PAD.l}
            y1={toY(v)}
            x2={PAD.l + cW}
            y2={toY(v)}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          <SvgText
            x={PAD.l - 5}
            y={toY(v) + 4}
            textAnchor="end"
            fontSize={10}
            fill={textColor}
          >
            {v}
          </SvgText>
        </G>
      ))}
      <Path d={pathD} stroke={lineColor} strokeWidth={2.5} fill="none" />
      {points.map((p, i) => (
        <G key={i}>
          <Circle cx={toX(i)} cy={toY(p.strikeRate)} r={5} fill={lineColor} />
          <SvgText
            x={toX(i)}
            y={toY(p.strikeRate) - 10}
            textAnchor="middle"
            fontSize={10}
            fill={lineColor}
            fontWeight="600"
          >
            {p.strikeRate.toFixed(0)}%
          </SvgText>
          <SvgText
            x={toX(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill={textColor}
          >
            {p.date.slice(5).replace("-", "/")}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

export default function BullpenPlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [tab, setTab] = useState<"sessions" | "trend">("sessions");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  const { data, isLoading } = useQuery<{
    playerName: string;
    sessions: Session[];
    pitches: Pitch[];
  }>({
    queryKey: ["bullpen_player", id],
    queryFn: async () => {
      const [{ data: playerData, error: pe }, { data: sessionsData, error: se }] =
        await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", id).single(),
          supabase
            .from("bullpen_sessions")
            .select("id, player_id, date, session_name")
            .eq("player_id", id)
            .order("date", { ascending: false }),
        ]);
      if (pe) throw pe;
      if (se) throw se;

      const sessionIds = (sessionsData ?? []).map((s) => s.id);
      let pitches: Pitch[] = [];
      if (sessionIds.length > 0) {
        const { data: pitchData, error: pitchErr } = await supabase
          .from("bullpen_pitches")
          .select("id, session_id, pitch_number, pitch_type, pitch_speed, is_strike, course_x, course_y")
          .in("session_id", sessionIds);
        if (pitchErr) throw pitchErr;
        pitches = (pitchData ?? []) as Pitch[];
      }

      return {
        playerName: (playerData as any)?.display_name ?? "—",
        sessions: (sessionsData ?? []) as Session[],
        pitches,
      };
    },
    enabled: !!user && !!id,
    staleTime: 2 * 60 * 1000,
  });

  const statsMap = useMemo(() => {
    if (!data) return new Map<string, SessionStats>();
    const pitchesBySession = new Map<string, Pitch[]>();
    for (const p of data.pitches) {
      const arr = pitchesBySession.get(p.session_id) ?? [];
      arr.push(p);
      pitchesBySession.set(p.session_id, arr);
    }
    const map = new Map<string, SessionStats>();
    for (const s of data.sessions) {
      map.set(s.id, computeStats(s, pitchesBySession.get(s.id) ?? []));
    }
    return map;
  }, [data]);

  const trendPoints = useMemo((): TrendPoint[] => {
    const byDate = new Map<string, { strikes: number; total: number }>();
    for (const [, stats] of statsMap) {
      const d = stats.session.date;
      const e = byDate.get(d) ?? { strikes: 0, total: 0 };
      e.strikes += stats.strikes;
      e.total += stats.total;
      byDate.set(d, e);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => ({
        date,
        strikeRate: e.total > 0 ? (e.strikes / e.total) * 100 : 0,
      }));
  }, [statsMap]);

  if (!user) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: data?.playerName ?? "投球記録", headerBackTitle: "戻る" }}
      />

      {/* タブバー */}
      <View style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        {(["sessions", "trend"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              styles.tab,
              tab === t && { borderBottomColor: colors.tint, borderBottomWidth: 2 },
            ]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.tint : colors.icon }]}>
              {t === "sessions" ? "セッション" : "推移"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* セッションタブ */}
          {tab === "sessions" && (
            <>
              {(data?.sessions ?? []).length === 0 ? (
                <Text style={[styles.empty, { color: colors.icon }]}>投球記録がありません</Text>
              ) : (
                (data?.sessions ?? []).map((session) => {
                  const stats = statsMap.get(session.id);
                  if (!stats) return null;
                  const isExpanded = expandedId === session.id;
                  return (
                    <View
                      key={session.id}
                      style={[styles.sessionCard, { backgroundColor: cardBg, borderColor }]}
                    >
                      <TouchableOpacity
                        style={styles.sessionHeader}
                        onPress={() => setExpandedId(isExpanded ? null : session.id)}
                      >
                        <View style={styles.sessionMeta}>
                          <Text style={[styles.sessionDate, { color: colors.text }]}>
                            {session.date.replace(/-/g, "/")}
                          </Text>
                          {session.session_name ? (
                            <Text style={[styles.sessionName, { color: colors.icon }]}>
                              {session.session_name}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.sessionRight}>
                          <Text style={[styles.sessionSR, { color: colors.tint }]}>
                            {stats.strikeRate.toFixed(1)}%
                          </Text>
                          <Text style={[styles.sessionTotal, { color: colors.icon }]}>
                            {stats.total}球
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.icon}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={[styles.sessionDetail, { borderTopColor: borderColor }]}>
                          {/* 球種別テーブル */}
                          <Text style={[styles.detailLabel, { color: colors.text }]}>球種別</Text>
                          <View>
                            <View style={[styles.typeRow, { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                              <Text style={[styles.typeCell, styles.typeName, { color: colors.icon }]}>球種</Text>
                              <Text style={[styles.typeCell, { color: colors.icon }]}>球数</Text>
                              <Text style={[styles.typeCell, { color: colors.icon }]}>SR%</Text>
                              <Text style={[styles.typeCell, { color: colors.icon }]}>avg</Text>
                              <Text style={[styles.typeCell, { color: colors.icon }]}>max</Text>
                            </View>
                            {PITCH_TYPES.filter((t) => stats.byType.has(t)).map((t) => {
                              const s = stats.byType.get(t)!;
                              const sr = s.count > 0 ? ((s.strikes / s.count) * 100).toFixed(0) : "—";
                              const avg = s.speeds.length > 0
                                ? Math.round(s.speeds.reduce((a, b) => a + b) / s.speeds.length)
                                : null;
                              const max = s.speeds.length > 0 ? Math.max(...s.speeds) : null;
                              return (
                                <View key={t} style={styles.typeRow}>
                                  <Text style={[styles.typeCell, styles.typeName, { color: colors.text }]}>{t}</Text>
                                  <Text style={[styles.typeCell, { color: colors.text }]}>{s.count}</Text>
                                  <Text style={[styles.typeCell, { color: colors.tint, fontWeight: "600" }]}>{sr}%</Text>
                                  <Text style={[styles.typeCell, { color: colors.text }]}>{avg ?? "—"}</Text>
                                  <Text style={[styles.typeCell, { color: colors.text }]}>{max ?? "—"}</Text>
                                </View>
                              );
                            })}
                          </View>

                          {/* コース分布 */}
                          {stats.pitches.some((p) => p.course_x != null) && (
                            <>
                              <Text style={[styles.detailLabel, { color: colors.text, marginTop: 14 }]}>
                                コース分布
                              </Text>
                              <PitchLocationChart
                                pitches={stats.pitches.map((p) => ({
                                  course_x: p.course_x,
                                  course_y: p.course_y,
                                  pitch_type: p.pitch_type,
                                  batting_result: p.is_strike ? "ストライク" : "ボール",
                                } as PitchDot))}
                                textColor={colors.text}
                                subTextColor={colors.icon}
                                backgroundColor={cardBg}
                              />
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* 推移タブ */}
          {tab === "trend" && (
            <View style={[styles.trendCard, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.trendTitle, { color: colors.text }]}>ストライク率 推移</Text>
              {trendPoints.length < 2 ? (
                <Text style={[styles.empty, { color: colors.icon }]}>
                  推移グラフには2日以上のデータが必要です
                </Text>
              ) : (
                <TrendChart
                  points={trendPoints}
                  textColor={colors.text}
                  lineColor={colors.tint}
                />
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  empty: { textAlign: "center", paddingVertical: 40, fontSize: 14 },
  sessionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  sessionMeta: { flex: 1, gap: 2 },
  sessionDate: { fontSize: 15, fontWeight: "600" },
  sessionName: { fontSize: 12 },
  sessionRight: { alignItems: "flex-end", gap: 2 },
  sessionSR: { fontSize: 18, fontWeight: "700" },
  sessionTotal: { fontSize: 12 },
  sessionDetail: {
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  detailLabel: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  typeRow: { flexDirection: "row", paddingVertical: 6 },
  typeCell: { flex: 1, textAlign: "center", fontSize: 12 },
  typeName: { flex: 2, textAlign: "left" },
  trendCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: "hidden",
  },
  trendTitle: { fontSize: 15, fontWeight: "600" },
});
