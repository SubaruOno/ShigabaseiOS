import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Keyboard,
} from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { LineChart } from "react-native-gifted-charts";
import { router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  player_id: string;
  recorded_at: string;
  bench_weight: number | null;
  bench_reps: number | null;
  bench_1rm: number | null;
  deadlift_weight: number | null;
  deadlift_reps: number | null;
  deadlift_1rm: number | null;
  squat_weight: number | null;
  squat_reps: number | null;
  squat_1rm: number | null;
  body_weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  other_exercises: string | null;
};

type ExerciseKey = "bench" | "deadlift" | "squat";

const EXERCISE: Record<ExerciseKey, { label: string; color: string; wKey: keyof Session; rKey: keyof Session; rmKey: keyof Session }> = {
  bench:    { label: "ベンチ",  color: "#0a7ea4", wKey: "bench_weight",    rKey: "bench_reps",    rmKey: "bench_1rm"    },
  deadlift: { label: "デッド",  color: "#ef4444", wKey: "deadlift_weight", rKey: "deadlift_reps", rmKey: "deadlift_1rm" },
  squat:    { label: "スクワット", color: "#22c55e", wKey: "squat_weight",  rKey: "squat_reps",   rmKey: "squat_1rm"   },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end, label: `${y}年${m}月` };
}

function getPrevMonthRange() {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
}

function calc1RM(weight: string, reps: string): string {
  const w = parseFloat(weight);
  const r = parseInt(reps);
  if (!w || !r || r <= 0) return "-";
  return (w * (1 + r / 40)).toFixed(1);
}

function avg(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x != null && x > 0);
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

function fmtMonth(yyyymm: string) {
  return `${parseInt(yyyymm.slice(5, 7))}月`;
}

function fmtYearMonth(yyyymm: string) {
  return `${yyyymm.slice(0, 4)}年${parseInt(yyyymm.slice(5, 7))}月`;
}

function localDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── ExerciseSelector ────────────────────────────────────────────────────────

function ExerciseSelector({ value, onChange, colors, colorScheme }: {
  value: ExerciseKey;
  onChange: (k: ExerciseKey) => void;
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  return (
    <View style={[selStyles.bar, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6" }]}>
      {(Object.keys(EXERCISE) as ExerciseKey[]).map((k) => (
        <TouchableOpacity
          key={k}
          style={[selStyles.btn, value === k && { backgroundColor: colorScheme === "dark" ? "#3a3a3c" : "#fff" }]}
          onPress={() => onChange(k)}
        >
          <Text style={[selStyles.text, { color: value === k ? EXERCISE[k].color : colors.icon }]}>
            {EXERCISE[k].label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const selStyles = StyleSheet.create({
  bar: { flexDirection: "row", borderRadius: 10, padding: 3 },
  btn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8 },
  text: { fontSize: 12, fontWeight: "600" },
});

// ─── WeightLineChart ─────────────────────────────────────────────────────────

type ChartPoint = { value: number; label: string };

function WeightLineChart({ data, color, goalValue, emptyText, colors }: {
  data: ChartPoint[];
  color: string;
  goalValue?: number | null;
  emptyText?: string;
  colors: (typeof Colors)["light"];
}) {
  const { width } = Dimensions.get("window");
  const chartWidth = width - 72;

  if (!data.length) {
    return (
      <View style={chartStyles.empty}>
        <Text style={[chartStyles.emptyText, { color: colors.icon }]}>
          {emptyText ?? "データがありません"}
        </Text>
      </View>
    );
  }

  const spacing = Math.max(44, Math.min(72, (chartWidth - 40) / data.length));

  const refLineProps = goalValue
    ? {
        showReferenceLine1: true,
        referenceLine1Position: goalValue,
        referenceLine1Config: {
          color: "#f59e0b",
          dashWidth: 5,
          dashGap: 4,
          labelText: `目標 ${goalValue}kg`,
          labelTextStyle: { color: "#f59e0b", fontSize: 10 },
        },
      }
    : {};

  return (
    <View style={{ marginLeft: -8 }}>
      <LineChart
        data={data}
        width={chartWidth}
        height={160}
        spacing={spacing}
        color={color}
        thickness={2.5}
        initialSpacing={20}
        endSpacing={20}
        noOfSections={4}
        yAxisTextStyle={{ color: colors.icon, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: colors.icon, fontSize: 10 }}
        rulesType="solid"
        rulesColor={colors.borderColor}
        yAxisColor="transparent"
        xAxisColor={colors.borderColor}
        dataPointsColor={color}
        dataPointsRadius={5}
        curved
        hideDataPoints={data.length > 12}
        {...refLineProps}
      />
    </View>
  );
}

const chartStyles = StyleSheet.create({
  empty: { height: 80, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 13 },
});

// ─── ExerciseRow ─────────────────────────────────────────────────────────────

function ExerciseRow({ label, weightVal, repsVal, onWeightChange, onRepsChange, prevWeight, prevReps, colors, colorScheme }: {
  label: string; weightVal: string; repsVal: string;
  onWeightChange: (v: string) => void; onRepsChange: (v: string) => void;
  prevWeight?: number | null; prevReps?: number | null;
  colors: (typeof Colors)["light"]; colorScheme: "light" | "dark";
}) {
  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";
  const rm = calc1RM(weightVal, repsVal);
  return (
    <View style={exStyles.row}>
      <View style={exStyles.labelRow}>
        <Text style={[exStyles.label, { color: colors.text }]}>{label}</Text>
        {(prevWeight || prevReps) && (
          <Text style={[exStyles.prev, { color: colors.icon }]}>
            前回: {prevWeight ?? "-"}kg × {prevReps ?? "-"}回
          </Text>
        )}
      </View>
      <View style={exStyles.inputs}>
        <View style={exStyles.inputWrap}>
          <TextInput style={[exStyles.input, { color: colors.text, borderColor: colors.borderColor, backgroundColor: inputBg }]}
            value={weightVal} onChangeText={onWeightChange}
            placeholder={prevWeight ? String(prevWeight) : "0"}
            placeholderTextColor={colors.icon} keyboardType="decimal-pad" />
          <Text style={[exStyles.unit, { color: colors.icon }]}>kg</Text>
        </View>
        <Text style={[exStyles.times, { color: colors.icon }]}>×</Text>
        <View style={exStyles.inputWrap}>
          <TextInput style={[exStyles.input, { color: colors.text, borderColor: colors.borderColor, backgroundColor: inputBg }]}
            value={repsVal} onChangeText={onRepsChange}
            placeholder={prevReps ? String(prevReps) : "0"}
            placeholderTextColor={colors.icon} keyboardType="number-pad" />
          <Text style={[exStyles.unit, { color: colors.icon }]}>回</Text>
        </View>
        <View style={exStyles.rmWrap}>
          <Text style={[exStyles.rmLabel, { color: colors.icon }]}>1RM</Text>
          <Text style={[exStyles.rmValue, { color: colors.tint }]}>{rm === "-" ? "-" : `${rm}kg`}</Text>
        </View>
      </View>
    </View>
  );
}

const exStyles = StyleSheet.create({
  row: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 14, fontWeight: "600" },
  prev: { fontSize: 12 },
  inputs: { flexDirection: "row", alignItems: "center", gap: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: "center" },
  unit: { fontSize: 12, width: 16 },
  times: { fontSize: 16, fontWeight: "600" },
  rmWrap: { alignItems: "center", minWidth: 60 },
  rmLabel: { fontSize: 10 },
  rmValue: { fontSize: 13, fontWeight: "700" },
});

// ─── BodyRow ─────────────────────────────────────────────────────────────────

function BodyRow({ label, unit, value, onChangeText, prev, colors, colorScheme }: {
  label: string; unit: string; value: string; onChangeText: (v: string) => void;
  prev?: number | null; colors: (typeof Colors)["light"]; colorScheme: "light" | "dark";
}) {
  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";
  return (
    <View style={bStyles.row}>
      <Text style={[bStyles.label, { color: colors.text }]}>{label}</Text>
      <View style={bStyles.inputWrap}>
        <TextInput style={[bStyles.input, { color: colors.text, borderColor: colors.borderColor, backgroundColor: inputBg }]}
          value={value} onChangeText={onChangeText}
          placeholder={prev != null ? String(prev) : "未入力"}
          placeholderTextColor={colors.icon} keyboardType="decimal-pad" />
        <Text style={[bStyles.unit, { color: colors.icon }]}>{unit}</Text>
      </View>
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 14, fontWeight: "500", flex: 1 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: { width: 90, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: "center" },
  unit: { fontSize: 13, width: 28 },
});

// ─── HistoryList ─────────────────────────────────────────────────────────────

function HistoryList({ playerId, excludeStart, colors, colorScheme }: {
  playerId: string; excludeStart: string;
  colors: (typeof Colors)["light"]; colorScheme: "light" | "dark";
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: history, isLoading, isError } = useQuery<Session[]>({
    queryKey: ["weight_history", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*")
        .eq("player_id", playerId)
        .lt("recorded_at", excludeStart)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <ActivityIndicator color={colors.tint} style={{ marginVertical: 12 }} />;
  if (isError) return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <Text style={{ color: "#ef4444", fontSize: 13 }}>過去の記録の読み込みに失敗しました</Text>
    </View>
  );
  if (!history?.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>過去の記録</Text>
      {history.map((s, i) => {
        const dl = fmtYearMonth(s.recorded_at.slice(0, 7));
        const isOpen = expanded === s.id;
        return (
          <TouchableOpacity key={s.id}
            style={[histStyles.row, i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderColor }]}
            onPress={() => setExpanded(isOpen ? null : s.id)} activeOpacity={0.7}>
            <View style={histStyles.rowHeader}>
              <Text style={[histStyles.dateLabel, { color: colors.text }]}>{dl}</Text>
              <View style={histStyles.miniStats}>
                {s.bench_weight != null && <Text style={[histStyles.stat, { color: colors.icon }]}>B:{s.bench_weight}</Text>}
                {s.deadlift_weight != null && <Text style={[histStyles.stat, { color: colors.icon }]}>D:{s.deadlift_weight}</Text>}
                {s.squat_weight != null && <Text style={[histStyles.stat, { color: colors.icon }]}>S:{s.squat_weight}</Text>}
              </View>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.icon} />
            </View>
            {isOpen && (
              <View style={histStyles.detail}>
                <View style={styles.summaryGrid}>
                  {[
                    { label: "ベンチ", w: s.bench_weight, r: s.bench_reps, rm: s.bench_1rm },
                    { label: "デッド", w: s.deadlift_weight, r: s.deadlift_reps, rm: s.deadlift_1rm },
                    { label: "スクワット", w: s.squat_weight, r: s.squat_reps, rm: s.squat_1rm },
                  ].map((item) => (
                    <View key={item.label} style={[styles.summaryItem, { borderColor: colors.borderColor }]}>
                      <Text style={[styles.summaryLabel, { color: colors.icon }]}>{item.label}</Text>
                      <Text style={[styles.summaryMain, { color: colors.text }]}>{item.w != null ? `${item.w}kg` : "-"}</Text>
                      <Text style={[styles.summarySmall, { color: colors.icon }]}>{item.r != null ? `${item.r}回` : "-"}</Text>
                      <Text style={[styles.summaryRm, { color: colors.tint }]}>1RM: {item.rm != null ? `${item.rm}kg` : "-"}</Text>
                    </View>
                  ))}
                </View>
                {(s.body_weight_kg || s.body_fat_pct || s.lean_mass_kg) && (
                  <View style={[styles.bodyRow, { borderTopColor: colors.borderColor, marginTop: 8 }]}>
                    {s.body_weight_kg != null && <Text style={[styles.bodyItem, { color: colors.text }]}>体重 <Text style={{ fontWeight: "700" }}>{s.body_weight_kg}kg</Text></Text>}
                    {s.body_fat_pct != null && <Text style={[styles.bodyItem, { color: colors.text }]}>体脂肪 <Text style={{ fontWeight: "700" }}>{s.body_fat_pct}%</Text></Text>}
                    {s.lean_mass_kg != null && <Text style={[styles.bodyItem, { color: colors.text }]}>除脂肪 <Text style={{ fontWeight: "700" }}>{s.lean_mass_kg}kg</Text></Text>}
                  </View>
                )}
                {s.other_exercises && <Text style={[histStyles.other, { color: colors.icon }]}>{s.other_exercises}</Text>}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const histStyles = StyleSheet.create({
  row: { paddingVertical: 10 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateLabel: { fontSize: 14, fontWeight: "600", width: 72 },
  miniStats: { flexDirection: "row", gap: 8, flex: 1 },
  stat: { fontSize: 12 },
  detail: { marginTop: 10, gap: 8 },
  other: { fontSize: 12, lineHeight: 18 },
});

// ─── GoalSetter ──────────────────────────────────────────────────────────────

type Goal = {
  player_id: string;
  bench_goal_kg: number | null;
  deadlift_goal_kg: number | null;
  squat_goal_kg: number | null;
};

function GoalSetter({ players, colors, colorScheme }: {
  players: { id: string; name: string }[];
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { bench: string; dead: string; squat: string }>>({});

  const { data: allGoals = [] } = useQuery<Goal[]>({
    queryKey: ["weight_goals_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("player_weight_goals").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const goalMap = new Map(allGoals.map((g) => [g.player_id, g]));

  const saveMutation = useMutation({
    mutationFn: async ({ playerId, bench, dead, squat }: { playerId: string; bench: string; dead: string; squat: string }) => {
      const payload = {
        player_id: playerId,
        bench_goal_kg: bench ? parseFloat(bench) : null,
        deadlift_goal_kg: dead ? parseFloat(dead) : null,
        squat_goal_kg: squat ? parseFloat(squat) : null,
      };
      const { error } = await supabase
        .from("player_weight_goals")
        .upsert(payload, { onConflict: "player_id" });
      if (error) throw error;
    },
    onSuccess: (_, { playerId }) => {
      queryClient.invalidateQueries({ queryKey: ["weight_goals_all"] });
      queryClient.invalidateQueries({ queryKey: ["weight_goals", playerId] });
      Alert.alert("完了", "目標値を保存しました");
      setExpanded(null);
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <View style={styles.cardHeader}>
        <Ionicons name="trophy-outline" size={18} color={colors.tint} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>目標値設定</Text>
      </View>
      {players.map((p, i) => {
        const goal = goalMap.get(p.id);
        const isOpen = expanded === p.id;
        const vals = editing[p.id] ?? {
          bench: goal?.bench_goal_kg != null ? String(goal.bench_goal_kg) : "",
          dead: goal?.deadlift_goal_kg != null ? String(goal.deadlift_goal_kg) : "",
          squat: goal?.squat_goal_kg != null ? String(goal.squat_goal_kg) : "",
        };
        const hasGoal = goal?.bench_goal_kg || goal?.deadlift_goal_kg || goal?.squat_goal_kg;

        return (
          <TouchableOpacity
            key={p.id}
            style={[
              goalStyles.row,
              i < players.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderColor },
            ]}
            onPress={() => {
              if (!editing[p.id]) {
                setEditing((prev) => ({
                  ...prev,
                  [p.id]: {
                    bench: goal?.bench_goal_kg != null ? String(goal.bench_goal_kg) : "",
                    dead: goal?.deadlift_goal_kg != null ? String(goal.deadlift_goal_kg) : "",
                    squat: goal?.squat_goal_kg != null ? String(goal.squat_goal_kg) : "",
                  },
                }));
              }
              setExpanded(isOpen ? null : p.id);
            }}
            activeOpacity={0.7}
          >
            <View style={goalStyles.rowHeader}>
              <Text style={[goalStyles.name, { color: colors.text }]}>{p.name}</Text>
              {hasGoal
                ? <Text style={[goalStyles.summary, { color: colors.icon }]}>
                    {[
                      goal?.bench_goal_kg ? `B:${goal.bench_goal_kg}` : null,
                      goal?.deadlift_goal_kg ? `D:${goal.deadlift_goal_kg}` : null,
                      goal?.squat_goal_kg ? `S:${goal.squat_goal_kg}` : null,
                    ].filter(Boolean).join("  ")}
                  </Text>
                : <Text style={[goalStyles.unset, { color: colors.icon }]}>未設定</Text>
              }
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.icon} />
            </View>
            {isOpen && (
              <View style={goalStyles.form}>
                {([
                  { label: "ベンチプレス", key: "bench" as const, color: EXERCISE.bench.color },
                  { label: "デッドリフト", key: "dead" as const, color: EXERCISE.deadlift.color },
                  { label: "スクワット",   key: "squat" as const, color: EXERCISE.squat.color },
                ] as const).map((ex) => (
                  <View key={ex.key} style={goalStyles.inputRow}>
                    <Text style={[goalStyles.inputLabel, { color: ex.color }]}>{ex.label}</Text>
                    <View style={goalStyles.inputWrap}>
                      <TextInput
                        style={[goalStyles.input, { color: colors.text, borderColor: colors.borderColor, backgroundColor: inputBg }]}
                        value={vals[ex.key]}
                        onChangeText={(v) =>
                          setEditing((prev) => ({ ...prev, [p.id]: { ...vals, [ex.key]: v } }))
                        }
                        placeholder="未設定"
                        placeholderTextColor={colors.icon}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[goalStyles.unit, { color: colors.icon }]}>kg</Text>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={[goalStyles.saveBtn, { backgroundColor: colors.tint, opacity: saveMutation.isPending ? 0.7 : 1 }]}
                  onPress={() => saveMutation.mutate({ playerId: p.id, ...vals })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={goalStyles.saveBtnText}>保存</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const goalStyles = StyleSheet.create({
  row: { paddingVertical: 10 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: "500", flex: 1 },
  summary: { fontSize: 12 },
  unset: { fontSize: 12 },
  form: { marginTop: 12, gap: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputLabel: { fontSize: 13, fontWeight: "600", width: 90 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: "center" },
  unit: { fontSize: 13, width: 20 },
  saveBtn: { borderRadius: 8, padding: 10, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

// ─── TeamTab ─────────────────────────────────────────────────────────────────

function TeamTab({ myPlayerId, isStaff, isAdmin, colors, colorScheme }: {
  myPlayerId: string | null;
  isStaff: boolean;
  isAdmin: boolean;
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  const [exercise, setExercise] = useState<ExerciseKey>("bench");
  const [subTab, setSubTab] = useState<"data" | "manage">("data");
  const [showStatus, setShowStatus] = useState(false);
  const { start: curStart, end: curEnd, label: monthLabel } = getCurrentMonthRange();

  // 全選手の全セッション
  const { data: allSessions = [], isLoading: sessLoading } = useQuery<Session[]>({
    queryKey: ["weight_all_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*").order("recorded_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: players = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["players_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("id, name").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // チーム平均推移データ
  const teamChartData = useMemo(() => {
    const monthMap = new Map<string, (number | null)[]>();
    for (const s of allSessions) {
      const m = s.recorded_at.slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m)!.push(s[EXERCISE[exercise].wKey] as number | null);
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, vals]) => {
        const a = avg(vals);
        return a != null ? { value: a, label: fmtMonth(m) } : null;
      })
      .filter((d): d is { value: number; label: string } => d != null);
  }, [allSessions, exercise]);

  // 選手ごとの最新記録 → ランキング
  const ranking = useMemo(() => {
    const latestMap = new Map<string, Session>();
    for (const s of allSessions) {
      const ex = latestMap.get(s.player_id);
      if (!ex || s.recorded_at > ex.recorded_at) latestMap.set(s.player_id, s);
    }
    const playerNameMap = new Map(players.map((p) => [p.id, p.name]));
    return Array.from(latestMap.entries())
      .map(([pid, s]) => ({
        playerId: pid,
        name: playerNameMap.get(pid) ?? "不明",
        weight: s[EXERCISE[exercise].wKey] as number | null,
        recorded_at: s.recorded_at,
      }))
      .filter((r) => r.weight != null)
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  }, [allSessions, players, exercise]);

  // 今月の入力状況（管理者用）
  const { start: cs, end: ce } = getCurrentMonthRange();
  const submittedIds = useMemo(() => {
    return new Set(
      allSessions.filter((s) => s.recorded_at >= cs && s.recorded_at < ce).map((s) => s.player_id)
    );
  }, [allSessions, cs, ce]);

  if (sessLoading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* データ/管理 サブタブ（スタッフのみ） */}
      {isStaff && (
        <View style={[subTabStyles.bar, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6" }]}>
          {(["data", "manage"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[subTabStyles.btn, subTab === t && { backgroundColor: colorScheme === "dark" ? "#3a3a3c" : "#fff" }]}
              onPress={() => setSubTab(t)}
            >
              <Text style={[subTabStyles.text, { color: subTab === t ? colors.tint : colors.icon }]}>
                {t === "data" ? "データ" : "管理"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>

        {/* ── データタブ ── */}
        {subTab === "data" && <>
          <ExerciseSelector value={exercise} onChange={setExercise} colors={colors} colorScheme={colorScheme} />

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              チーム平均推移 — {EXERCISE[exercise].label}
            </Text>
            <WeightLineChart
              data={teamChartData}
              color={EXERCISE[exercise].color}
              emptyText="データがありません"
              colors={colors}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {EXERCISE[exercise].label} 順位（最新記録）
            </Text>
            {ranking.map((r, i) => {
              const isMe = r.playerId === myPlayerId;
              return (
                <View key={r.playerId}
                  style={[
                    rankStyles.row,
                    isMe && { backgroundColor: EXERCISE[exercise].color + "18", borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
                    i < ranking.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderColor },
                  ]}>
                  <Text style={[rankStyles.rank, { color: i < 3 ? EXERCISE[exercise].color : colors.icon }]}>{i + 1}</Text>
                  <Text style={[rankStyles.name, { color: colors.text }, isMe && { fontWeight: "700" }]}>
                    {r.name}{isMe && " ★"}
                  </Text>
                  <Text style={[rankStyles.weight, { color: isMe ? EXERCISE[exercise].color : colors.text }]}>
                    {r.weight}kg
                  </Text>
                </View>
              );
            })}
            {ranking.length === 0 && (
              <Text style={{ color: colors.icon, fontSize: 13, textAlign: "center" }}>データがありません</Text>
            )}
          </View>
        </>}

        {/* ── 管理タブ（スタッフのみ） ── */}
        {subTab === "manage" && isStaff && <>
          <TouchableOpacity
            style={[styles.exportBtn, { borderColor: colors.tint }]}
            onPress={() => router.push({ pathname: "/weight-export" })}>
            <Ionicons name="download-outline" size={16} color={colors.tint} />
            <Text style={[styles.exportBtnText, { color: colors.tint }]}>データを出力（Excel・PDF）</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.tint} />
          </TouchableOpacity>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <TouchableOpacity style={styles.cardHeader} onPress={() => setShowStatus(!showStatus)}>
              <Ionicons name="people-outline" size={18} color={colors.tint} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {monthLabel} 入力状況 ({submittedIds.size}/{players.length})
              </Text>
              <Ionicons name={showStatus ? "chevron-up" : "chevron-down"} size={16} color={colors.icon} />
            </TouchableOpacity>
            {showStatus && (
              <View style={{ gap: 2, marginTop: 4 }}>
                {players.map((p) => (
                  <View key={p.id} style={statusStyles.row}>
                    {submittedIds.has(p.id)
                      ? <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                      : <Ionicons name="ellipse-outline" size={16} color={colors.icon} />}
                    <Text style={[statusStyles.name, { color: colors.text }]}>{p.name}</Text>
                    {!submittedIds.has(p.id) && (
                      <Text style={[statusStyles.unsubmitted, { color: "#ef4444" }]}>未入力</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {isAdmin && <GoalSetter players={players} colors={colors} colorScheme={colorScheme} />}
        </>}

      </ScrollView>
    </View>
  );
}

const subTabStyles = StyleSheet.create({
  bar: { flexDirection: "row", marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 3 },
  btn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8 },
  text: { fontSize: 13, fontWeight: "600" },
});

const rankStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  rank: { fontSize: 15, fontWeight: "700", width: 28, textAlign: "center" },
  name: { fontSize: 14, flex: 1 },
  weight: { fontSize: 15, fontWeight: "600" },
});

const statusStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  name: { fontSize: 14, flex: 1 },
  unsubmitted: { fontSize: 12, fontWeight: "600" },
});

// ─── MineTab ─────────────────────────────────────────────────────────────────

function MineTab({ playerId, colors, colorScheme }: {
  playerId: string;
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  const queryClient = useQueryClient();
  const { start: curStart, end: curEnd, label: monthLabel } = getCurrentMonthRange();
  const { start: prevStart, end: prevEnd } = getPrevMonthRange();
  const [exercise, setExercise] = useState<ExerciseKey>("bench");
  const [editing, setEditing] = useState(false);

  // 今月の記録
  const { data: current, isLoading } = useQuery<Session | null>({
    queryKey: ["weight_session", playerId, curStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*")
        .eq("player_id", playerId)
        .gte("recorded_at", curStart).lt("recorded_at", curEnd)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 先月の記録（前回値）
  const { data: prev } = useQuery<Session | null>({
    queryKey: ["weight_session_prev", playerId, prevStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*")
        .eq("player_id", playerId)
        .gte("recorded_at", prevStart).lt("recorded_at", prevEnd)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 個人の全履歴（グラフ用）
  const { data: allMine = [] } = useQuery<Session[]>({
    queryKey: ["weight_history_all", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*")
        .eq("player_id", playerId)
        .order("recorded_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 目標値
  const { data: goals } = useQuery<{ bench_goal_kg: number | null; deadlift_goal_kg: number | null; squat_goal_kg: number | null } | null>({
    queryKey: ["weight_goals", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_weight_goals").select("*")
        .eq("player_id", playerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // フォーム状態（1オブジェクトで管理）
  const EMPTY_FORM = {
    benchW: "", benchR: "",
    deadW: "",  deadR: "",
    squatW: "", squatR: "",
    bodyW: "", bodyFat: "", leanM: "",
    otherEx: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const setField = useCallback((key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value })), []);

  const resetForm = useCallback((session: Session | null | undefined) => {
    setForm(session ? {
      benchW:  session.bench_weight     != null ? String(session.bench_weight)     : "",
      benchR:  session.bench_reps       != null ? String(session.bench_reps)       : "",
      deadW:   session.deadlift_weight  != null ? String(session.deadlift_weight)  : "",
      deadR:   session.deadlift_reps    != null ? String(session.deadlift_reps)    : "",
      squatW:  session.squat_weight     != null ? String(session.squat_weight)     : "",
      squatR:  session.squat_reps       != null ? String(session.squat_reps)       : "",
      bodyW:   session.body_weight_kg   != null ? String(session.body_weight_kg)   : "",
      bodyFat: session.body_fat_pct     != null ? String(session.body_fat_pct)     : "",
      leanM:   session.lean_mass_kg     != null ? String(session.lean_mass_kg)     : "",
      otherEx: session.other_exercises ?? "",
    } : EMPTY_FORM);
  }, []);

  useEffect(() => { resetForm(current); }, [current, resetForm]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { benchW, benchR, deadW, deadR, squatW, squatR, bodyW, bodyFat, leanM, otherEx } = form;
      const payload = {
        player_id: playerId,
        recorded_at: localDateString(),
        bench_weight: benchW ? parseFloat(benchW) : null,
        bench_reps: benchR ? parseInt(benchR) : null,
        deadlift_weight: deadW ? parseFloat(deadW) : null,
        deadlift_reps: deadR ? parseInt(deadR) : null,
        squat_weight: squatW ? parseFloat(squatW) : null,
        squat_reps: squatR ? parseInt(squatR) : null,
        body_weight_kg: bodyW ? parseFloat(bodyW) : null,
        body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
        lean_mass_kg: leanM ? parseFloat(leanM) : null,
        other_exercises: otherEx.trim() || null,
      };
      if (current) {
        const { error } = await supabase.from("weight_sessions").update(payload).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("weight_sessions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      Keyboard.dismiss();
      Alert.alert("完了", "記録を保存しました");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["weight_session", playerId, curStart] });
      queryClient.invalidateQueries({ queryKey: ["weight_history_all", playerId] });
      queryClient.invalidateQueries({ queryKey: ["weight_all_sessions"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  // グラフデータ
  const growthData = useMemo(() => {
    const wKey = EXERCISE[exercise].wKey;
    return allMine
      .filter((s) => s[wKey] != null)
      .map((s) => ({ value: s[wKey] as number, label: fmtMonth(s.recorded_at.slice(0, 7)) }));
  }, [allMine, exercise]);

  const goalValue = exercise === "bench" ? goals?.bench_goal_kg
    : exercise === "deadlift" ? goals?.deadlift_goal_kg
    : goals?.squat_goal_kg;

  const bodyData = useMemo(() =>
    allMine.filter((s) => s.body_weight_kg != null).map((s) => ({
      value: s.body_weight_kg as number,
      label: fmtMonth(s.recorded_at.slice(0, 7)),
    })), [allMine]);

  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";
  const isSubmitted = !!current && !editing;

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={colors.tint} /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* 今月ヘッダー */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="barbell-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{monthLabel}のウエイト記録</Text>
            {isSubmitted
              ? <View style={[styles.badge, { backgroundColor: "#22c55e20" }]}><Ionicons name="checkmark-circle" size={14} color="#22c55e" /><Text style={[styles.badgeText, { color: "#22c55e" }]}>入力済</Text></View>
              : <View style={[styles.badge, { backgroundColor: "#ef444420" }]}><Ionicons name="alert-circle" size={14} color="#ef4444" /><Text style={[styles.badgeText, { color: "#ef4444" }]}>未入力</Text></View>
            }
          </View>
        </View>

        {/* 入力済サマリー */}
        {isSubmitted && current && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <View style={styles.summaryGrid}>
              {[
                { label: "ベンチ", w: current.bench_weight, r: current.bench_reps, rm: current.bench_1rm, color: "#0a7ea4" },
                { label: "デッド", w: current.deadlift_weight, r: current.deadlift_reps, rm: current.deadlift_1rm, color: "#ef4444" },
                { label: "スクワット", w: current.squat_weight, r: current.squat_reps, rm: current.squat_1rm, color: "#22c55e" },
              ].map((item) => (
                <View key={item.label} style={[styles.summaryItem, { borderColor: colors.borderColor }]}>
                  <Text style={[styles.summaryLabel, { color: item.color }]}>{item.label}</Text>
                  <Text style={[styles.summaryMain, { color: colors.text }]}>{item.w != null ? `${item.w}kg` : "-"}</Text>
                  <Text style={[styles.summarySmall, { color: colors.icon }]}>{item.r != null ? `${item.r}回` : "-"}</Text>
                  <Text style={[styles.summaryRm, { color: item.color }]}>1RM: {item.rm != null ? `${item.rm}kg` : "-"}</Text>
                </View>
              ))}
            </View>
            {(current.body_weight_kg || current.body_fat_pct || current.lean_mass_kg) && (
              <View style={[styles.bodyRow, { borderTopColor: colors.borderColor }]}>
                {current.body_weight_kg != null && <Text style={[styles.bodyItem, { color: colors.text }]}>体重 <Text style={{ fontWeight: "700" }}>{current.body_weight_kg}kg</Text></Text>}
                {current.body_fat_pct != null && <Text style={[styles.bodyItem, { color: colors.text }]}>体脂肪 <Text style={{ fontWeight: "700" }}>{current.body_fat_pct}%</Text></Text>}
                {current.lean_mass_kg != null && <Text style={[styles.bodyItem, { color: colors.text }]}>除脂肪 <Text style={{ fontWeight: "700" }}>{current.lean_mass_kg}kg</Text></Text>}
              </View>
            )}
            <TouchableOpacity style={[styles.editBtn, { borderColor: colors.tint }]} onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={16} color={colors.tint} />
              <Text style={[styles.editBtnText, { color: colors.tint }]}>修正する</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 入力フォーム */}
        {!isSubmitted && (
          <>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>ビッグ3（最大重量）</Text>
              <ExerciseRow label="ベンチプレス" weightVal={form.benchW} repsVal={form.benchR} onWeightChange={(v) => setField("benchW", v)} onRepsChange={(v) => setField("benchR", v)} prevWeight={prev?.bench_weight} prevReps={prev?.bench_reps} colors={colors} colorScheme={colorScheme} />
              <ExerciseRow label="デッドリフト" weightVal={form.deadW} repsVal={form.deadR} onWeightChange={(v) => setField("deadW", v)} onRepsChange={(v) => setField("deadR", v)} prevWeight={prev?.deadlift_weight} prevReps={prev?.deadlift_reps} colors={colors} colorScheme={colorScheme} />
              <ExerciseRow label="スクワット" weightVal={form.squatW} repsVal={form.squatR} onWeightChange={(v) => setField("squatW", v)} onRepsChange={(v) => setField("squatR", v)} prevWeight={prev?.squat_weight} prevReps={prev?.squat_reps} colors={colors} colorScheme={colorScheme} />
            </View>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>身体データ</Text>
                <Text style={[styles.optionalText, { color: colors.icon }]}>変化があれば入力</Text>
              </View>
              <BodyRow label="体重" unit="kg" value={form.bodyW} onChangeText={(v) => setField("bodyW", v)} prev={prev?.body_weight_kg} colors={colors} colorScheme={colorScheme} />
              <BodyRow label="体脂肪率" unit="%" value={form.bodyFat} onChangeText={(v) => setField("bodyFat", v)} prev={prev?.body_fat_pct} colors={colors} colorScheme={colorScheme} />
              <BodyRow label="除脂肪体重" unit="kg" value={form.leanM} onChangeText={(v) => setField("leanM", v)} prev={prev?.lean_mass_kg} colors={colors} colorScheme={colorScheme} />
            </View>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>その他の種目</Text>
                <Text style={[styles.optionalText, { color: colors.icon }]}>任意</Text>
              </View>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: colors.borderColor, backgroundColor: inputBg }]}
                value={form.otherEx} onChangeText={(v) => setField("otherEx", v)}
                placeholder={"例: ベントオーバーロウ 60kg×10\nラットプルダウン 55kg×10"}
                placeholderTextColor={colors.icon} multiline numberOfLines={4} textAlignVertical="top" />
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.tint, opacity: submitMutation.isPending ? 0.7 : 1 }]}
              onPress={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.submitBtnText}>{current ? "更新する" : "記録を保存する"}</Text></>}
            </TouchableOpacity>
            {editing && (
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.borderColor }]} onPress={() => { setEditing(false); resetForm(current); }}>
                <Text style={[styles.cancelBtnText, { color: colors.icon }]}>キャンセル</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* 個人成長グラフ */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>成長グラフ</Text>
          <ExerciseSelector value={exercise} onChange={setExercise} colors={colors} colorScheme={colorScheme} />
          <WeightLineChart
            data={growthData}
            color={EXERCISE[exercise].color}
            goalValue={goalValue}
            emptyText="記録を入力すると表示されます"
            colors={colors}
          />
          {goalValue && (
            <View style={styles.goalBadge}>
              <View style={[styles.goalLine, { backgroundColor: "#f59e0b" }]} />
              <Text style={[styles.goalText, { color: "#f59e0b" }]}>目標: {goalValue}kg</Text>
            </View>
          )}
        </View>

        {/* 体重推移グラフ */}
        {bodyData.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>体重推移</Text>
            <WeightLineChart data={bodyData} color="#a855f7" colors={colors} />
          </View>
        )}

        {/* 過去の記録 */}
        <HistoryList playerId={playerId} excludeStart={curStart} colors={colors} colorScheme={colorScheme} />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function WeightDevScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const isStaff = hasRole("analyst") || hasRole("admin");
  const isAdmin = hasRole("admin");
  const isPlayer = hasRole("player");
  const [activeTab, setActiveTab] = useState<"team" | "mine">("team");

  const { data: playerData, isLoading } = useQuery({
    queryKey: ["my_player", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("id, name").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
    enabled: !!user,
  });

  if (!user) return <Redirect href="/login" />;

  if (isLoading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  }

  // 選手のみ（staffでない）: タブなし
  if (isPlayer && !isStaff) {
    if (!playerData) {
      return (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Ionicons name="person-outline" size={48} color={colors.icon} />
          <Text style={[styles.placeholderText, { color: colors.icon }]}>選手データが紐付けられていません</Text>
        </View>
      );
    }
    // 選手も チーム/自分 タブで表示
  }

  const showMineTab = !!playerData;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* タブバー */}
      <View style={[styles.tabBar, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6" }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "team" && { backgroundColor: colorScheme === "dark" ? "#3a3a3c" : "#fff" }]}
          onPress={() => setActiveTab("team")}>
          <Text style={[styles.tabText, { color: activeTab === "team" ? colors.tint : colors.icon }]}>チーム</Text>
        </TouchableOpacity>
        {showMineTab && (
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "mine" && { backgroundColor: colorScheme === "dark" ? "#3a3a3c" : "#fff" }]}
            onPress={() => setActiveTab("mine")}>
            <Text style={[styles.tabText, { color: activeTab === "mine" ? colors.tint : colors.icon }]}>自分</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === "team"
        ? <TeamTab myPlayerId={playerData?.id ?? null} isStaff={isStaff} isAdmin={isAdmin} colors={colors} colorScheme={colorScheme} />
        : playerData && <MineTab playerId={playerData.id} colors={colors} colorScheme={colorScheme} />
      }
    </View>
  );
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  placeholderText: { fontSize: 15 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600", flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  optionalText: { fontSize: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  summaryGrid: { flexDirection: "row", gap: 8 },
  summaryItem: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, alignItems: "center", gap: 2 },
  summaryLabel: { fontSize: 10, fontWeight: "600" },
  summaryMain: { fontSize: 16, fontWeight: "700" },
  summarySmall: { fontSize: 12 },
  summaryRm: { fontSize: 11, fontWeight: "600" },
  bodyRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bodyItem: { fontSize: 13 },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 4 },
  editBtnText: { fontSize: 14, fontWeight: "500" },
  textarea: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 100 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelBtn: { alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1 },
  cancelBtnText: { fontSize: 15 },
  tabBar: { flexDirection: "row", margin: 12, borderRadius: 10, padding: 3 },
  tabItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabText: { fontSize: 13, fontWeight: "600" },
  goalBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  goalLine: { width: 20, height: 2, borderRadius: 1 },
  goalText: { fontSize: 12, fontWeight: "600" },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 13 },
  exportBtnText: { fontSize: 14, fontWeight: "600", flex: 1, textAlign: "center" },
});
