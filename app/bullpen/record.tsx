import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Line, Circle } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const PITCH_TYPES = [
  "ストレート","ツーシーム","カットボール","スライダー","カーブ",
  "シュート","シンカー","フォーク","スプリット","チェンジアップ","特殊球",
];

const PITCH_COLOR: Record<string, string> = {
  ストレート: "#ef4444",
  ツーシーム: "#f97316",
  カットボール: "#eab308",
  スライダー: "#3b82f6",
  カーブ: "#a855f7",
  シュート: "#ec4899",
  シンカー: "#06b6d4",
  フォーク: "#22c55e",
  スプリット: "#16a34a",
  チェンジアップ: "#84cc16",
  特殊球: "#6b7280",
};

// SVG座標系 (pitch-location-chart.tsx と同じ仕様)
const ZONE_VB = 264;
const SZ_MIN = 53.25;
const SZ_MAX = 210.75;
const SZ_SIZE = 157.5;
const I1 = 105.75;
const I2 = 158.25;

const ZONE_SIZE = Math.min(Dimensions.get("window").width - 48, 264);

type Step = "player" | "pitching" | "finish";

type PitchEntry = {
  pitch_type: string;
  pitch_speed: number | null;
  is_strike: boolean;
  course_x: number | null;
  course_y: number | null;
};

type Player = { id: string; name: string; uniform_number: number | null };

export default function BullpenRecord() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const canRecord = hasRole("analyst") || hasRole("admin");

  const [step, setStep] = useState<Step>("player");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [pitches, setPitches] = useState<PitchEntry[]>([]);
  const [activePitchType, setActivePitchType] = useState("ストレート");
  const [speedText, setSpeedText] = useState("");
  const [tappedCourse, setTappedCourse] = useState<{ x: number; y: number } | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [saving, setSaving] = useState(false);

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;
  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";
  const insets = useSafeAreaInsets();

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["bullpen_players_list"],
    queryFn: async () => {
      const { data: playerRoles, error: re } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "player");
      if (re) throw re;
      const playerIds = (playerRoles ?? []).map((r) => r.user_id);
      if (playerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, uniform_number")
        .in("id", playerIds)
        .order("uniform_number");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.display_name as string,
        uniform_number: p.uniform_number as number | null,
      }));
    },
    enabled: !!user && canRecord,
    staleTime: 5 * 60 * 1000,
  });

  const summary = useMemo(() => {
    const strikes = pitches.filter((p) => p.is_strike).length;
    const total = pitches.length;
    const byType = new Map<string, { count: number; strikes: number; speeds: number[] }>();
    for (const p of pitches) {
      const t = byType.get(p.pitch_type) ?? { count: 0, strikes: 0, speeds: [] };
      t.count++;
      if (p.is_strike) t.strikes++;
      if (p.pitch_speed != null) t.speeds.push(p.pitch_speed);
      byType.set(p.pitch_type, t);
    }
    return { strikes, total, byType };
  }, [pitches]);

  if (!user) return <Redirect href="/login" />;

  if (!canRecord) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.icon} />
        <Text style={[styles.noPermText, { color: colors.icon }]}>アナリスト権限が必要です</Text>
      </View>
    );
  }

  const recordPitch = (isStrike: boolean) => {
    const parsed = speedText.trim() ? parseInt(speedText, 10) : NaN;
    const speed = isNaN(parsed) ? null : parsed;
    setPitches((prev) => [
      ...prev,
      {
        pitch_type: activePitchType,
        pitch_speed: speed,
        is_strike: isStrike,
        course_x: tappedCourse?.x ?? null,
        course_y: tappedCourse?.y ?? null,
      },
    ]);
    setTappedCourse(null);
  };

  const undoLastPitch = () => {
    setPitches((prev) => prev.slice(0, -1));
  };

  const handleSave = async () => {
    if (!selectedPlayer || pitches.length === 0) return;
    setSaving(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from("bullpen_sessions")
        .insert({
          player_id: selectedPlayer.id,
          date: new Date().toISOString().split("T")[0],
          session_name: sessionName.trim() || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;

      const { error: pitchError } = await supabase.from("bullpen_pitches").insert(
        pitches.map((p, i) => ({
          session_id: sessionData.id,
          pitch_number: i + 1,
          pitch_type: p.pitch_type,
          pitch_speed: p.pitch_speed,
          is_strike: p.is_strike,
          course_x: p.course_x,
          course_y: p.course_y,
        }))
      );
      if (pitchError) throw pitchError;

      Alert.alert("保存完了", `${selectedPlayer.name}の投球データを保存しました`, [
        { text: "OK", onPress: () => router.replace("/bullpen" as any) },
      ]);
    } catch {
      Alert.alert("エラー", "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // ━━━━━ Step 1: 選手選択 ━━━━━
  if (step === "player") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.stepHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.icon} />
          </TouchableOpacity>
          <Text style={[styles.stepTitle, { color: colors.text }]}>投手を選択</Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : (players ?? []).length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="person-outline" size={40} color={colors.icon} />
            <Text style={[styles.noPermText, { color: colors.icon }]}>選手データが見つかりません</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              {(players ?? []).map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.playerRow,
                    { borderBottomColor: borderColor },
                    i === (players ?? []).length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    // 別の投手に替えるときは、前の投手の投球を持ち越さない
                    const start = () => {
                      if (selectedPlayer?.id !== p.id) {
                        setPitches([]);
                        setTappedCourse(null);
                        setSpeedText("");
                        setSessionName("");
                      }
                      setSelectedPlayer(p);
                      setStep("pitching");
                    };
                    if (selectedPlayer && selectedPlayer.id !== p.id && pitches.length > 0) {
                      Alert.alert(
                        "投手を替えますか",
                        `${selectedPlayer.name}の${pitches.length}球は保存されずに消えます`,
                        [
                          { text: "やめる", style: "cancel" },
                          { text: "替える", style: "destructive", onPress: start },
                        ]
                      );
                      return;
                    }
                    start();
                  }}
                >
                  <Text style={[styles.playerNum, { color: colors.icon }]}>
                    {p.uniform_number ?? "—"}
                  </Text>
                  <Text style={[styles.playerName, { color: colors.text }]}>{p.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.icon} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  // ━━━━━ Step 2: 投球入力 ━━━━━
  if (step === "pitching") {
    const activeColor = PITCH_COLOR[activePitchType] ?? colors.tint;
    const total = pitches.length;
    const strikes = pitches.filter((p) => p.is_strike).length;
    const recentPitches = pitches.slice(-5).reverse();

    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ヘッダー */}
        <View style={[styles.stepHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => setStep("player")} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.tint} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{selectedPlayer?.name}</Text>
            <Text style={[styles.stepSub, { color: colors.icon }]}>
              {total}球{"  "}S:{strikes}{"  "}B:{total - strikes}
              {total > 0 ? `  SR:${((strikes / total) * 100).toFixed(0)}%` : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.finishBtn, { borderColor: colors.tint }]}
            onPress={() => {
              if (pitches.length === 0) {
                Alert.alert("確認", "投球が記録されていません");
                return;
              }
              setStep("finish");
            }}
          >
            <Text style={[styles.finishBtnText, { color: colors.tint }]}>終了</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.pitchingContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 球種選択 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeScroll}
            contentContainerStyle={styles.typeScrollContent}
          >
            {PITCH_TYPES.map((type) => {
              const isActive = type === activePitchType;
              const color = PITCH_COLOR[type] ?? "#999";
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    { borderColor: color },
                    isActive && { backgroundColor: color },
                  ]}
                  onPress={() => setActivePitchType(type)}
                >
                  <Text style={[styles.typeChipText, { color: isActive ? "white" : color }]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* インタラクティブ投球ゾーン */}
          <View style={styles.zoneWrapper}>
            <View
              style={{ width: ZONE_SIZE, height: ZONE_SIZE }}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                const scale = ZONE_VB / ZONE_SIZE;
                setTappedCourse({
                  x: e.nativeEvent.locationX * scale,
                  y: e.nativeEvent.locationY * scale,
                });
              }}
            >
              <Svg
                viewBox={`0 0 ${ZONE_VB} ${ZONE_VB}`}
                width={ZONE_SIZE}
                height={ZONE_SIZE}
              >
                {/* 背景 */}
                <Rect x={0} y={0} width={ZONE_VB} height={ZONE_VB} fill="rgba(240,241,243,0.7)" />
                {/* ストライクゾーン */}
                <Rect x={SZ_MIN} y={SZ_MIN} width={SZ_SIZE} height={SZ_SIZE} fill="rgba(220,232,255,0.5)" />
                {/* 分割線 */}
                <Line x1={I1} y1={SZ_MIN} x2={I1} y2={SZ_MAX} stroke="#bbb" strokeWidth={1.2} strokeDasharray="5,3" />
                <Line x1={I2} y1={SZ_MIN} x2={I2} y2={SZ_MAX} stroke="#bbb" strokeWidth={1.2} strokeDasharray="5,3" />
                <Line x1={SZ_MIN} y1={I1} x2={SZ_MAX} y2={I1} stroke="#bbb" strokeWidth={1.2} strokeDasharray="5,3" />
                <Line x1={SZ_MIN} y1={I2} x2={SZ_MAX} y2={I2} stroke="#bbb" strokeWidth={1.2} strokeDasharray="5,3" />
                {/* 外枠 */}
                <Rect x={SZ_MIN} y={SZ_MIN} width={SZ_SIZE} height={SZ_SIZE} fill="none" stroke="#333" strokeWidth={2} />
                {/* タップ位置 */}
                {tappedCourse && (
                  <Circle
                    cx={tappedCourse.x}
                    cy={tappedCourse.y}
                    r={11}
                    fill={activeColor}
                    opacity={0.85}
                  />
                )}
              </Svg>
            </View>
            {tappedCourse ? (
              <TouchableOpacity onPress={() => setTappedCourse(null)}>
                <Text style={[styles.zoneTip, { color: colors.tint }]}>タップ位置をクリア</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.zoneTip, { color: colors.icon }]}>
                ゾーンをタップしてコースを記録（任意）
              </Text>
            )}
          </View>

          {/* 球速入力 */}
          <View style={[styles.speedRow, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.speedLabel, { color: colors.text }]}>球速</Text>
            <TextInput
              style={[styles.speedInput, { color: colors.text, borderColor, backgroundColor: inputBg }]}
              value={speedText}
              onChangeText={setSpeedText}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={colors.icon}
              maxLength={3}
              returnKeyType="done"
            />
            <Text style={[styles.speedUnit, { color: colors.icon }]}>km/h</Text>
          </View>

          {/* S/B ボタン */}
          <View style={styles.sbRow}>
            <TouchableOpacity
              style={[styles.sbBtn, styles.strikeBtn]}
              onPress={() => recordPitch(true)}
            >
              <Text style={styles.sbBtnText}>ストライク</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sbBtn, styles.ballBtn]}
              onPress={() => recordPitch(false)}
            >
              <Text style={styles.sbBtnText}>ボール</Text>
            </TouchableOpacity>
          </View>

          {/* 直近ログ + 取り消し */}
          {pitches.length > 0 && (
            <View style={[styles.logCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.logTitle, { color: colors.icon }]}>直近5球</Text>
                <TouchableOpacity onPress={undoLastPitch} style={styles.undoBtn} hitSlop={8}>
                  <Ionicons name="arrow-undo-outline" size={16} color={colors.icon} />
                  <Text style={[styles.undoText, { color: colors.icon }]}>取り消し</Text>
                </TouchableOpacity>
              </View>
              {recentPitches.map((p, i) => {
                const idx = pitches.length - i;
                return (
                  <View
                    key={i}
                    style={[
                      styles.logRow,
                      { borderBottomColor: borderColor },
                      i === recentPitches.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <Text style={[styles.logNum, { color: colors.icon }]}>#{idx}</Text>
                    <Text style={[styles.logType, { color: PITCH_COLOR[p.pitch_type] ?? colors.text }]}>
                      {p.pitch_type}
                    </Text>
                    <Text style={[styles.logSB, { color: p.is_strike ? "#16a34a" : "#dc2626" }]}>
                      {p.is_strike ? "S" : "B"}
                    </Text>
                    <Text style={[styles.logSpeed, { color: colors.icon }]}>
                      {p.pitch_speed != null ? `${p.pitch_speed}km/h` : "—"}
                    </Text>
                    <Text style={[styles.logCourse, { color: colors.icon }]}>
                      {p.course_x != null ? "●" : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ━━━━━ Step 3: セッション名 + 保存 ━━━━━
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.stepHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setStep("pitching")} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </TouchableOpacity>
        <Text style={[styles.stepTitle, { color: colors.text }]}>セッション完了</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* サマリーカード */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.summaryPlayer, { color: colors.text }]}>{selectedPlayer?.name}</Text>
          <Text style={[styles.summarySR, { color: colors.tint }]}>
            SR{" "}
            {summary.total > 0
              ? ((summary.strikes / summary.total) * 100).toFixed(1)
              : "0.0"}
            %
          </Text>
          <Text style={[styles.summarySub, { color: colors.icon }]}>
            {summary.total}球 / S:{summary.strikes} B:{summary.total - summary.strikes}
          </Text>

          {/* 球種別テーブル */}
          <View style={{ marginTop: 14 }}>
            <View style={[styles.typeRow, { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.typeCell, styles.typeName, { color: colors.icon }]}>球種</Text>
              <Text style={[styles.typeCell, { color: colors.icon }]}>球数</Text>
              <Text style={[styles.typeCell, { color: colors.icon }]}>SR%</Text>
              <Text style={[styles.typeCell, { color: colors.icon }]}>avg</Text>
              <Text style={[styles.typeCell, { color: colors.icon }]}>max</Text>
            </View>
            {PITCH_TYPES.filter((t) => summary.byType.has(t)).map((t) => {
              const s = summary.byType.get(t)!;
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
        </View>

        {/* セッション名入力 */}
        <View style={[styles.card, { backgroundColor: cardBg, padding: 16, gap: 8 }]}>
          <Text style={[styles.nameLabel, { color: colors.text }]}>セッション名（任意）</Text>
          <TextInput
            style={[styles.nameInput, { color: colors.text, borderColor, backgroundColor: inputBg }]}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="例: 変化球中心、軽め"
            placeholderTextColor={colors.icon}
            maxLength={50}
            returnKeyType="done"
          />
        </View>

        {/* 保存ボタン */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.tint, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="white" />
              <Text style={styles.saveBtnText}>保存する</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  noPermText: { fontSize: 15 },

  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerBtn: { padding: 6, width: 40, alignItems: "center" },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  stepTitle: { fontSize: 17, fontWeight: "600" },
  stepSub: { fontSize: 12 },
  finishBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  finishBtnText: { fontSize: 14, fontWeight: "600" },

  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 12, overflow: "hidden" },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  playerNum: { fontSize: 13, fontWeight: "600", width: 28, textAlign: "center" },
  playerName: { flex: 1, fontSize: 16, fontWeight: "500" },

  pitchingContent: { padding: 16, gap: 16, paddingBottom: 40 },

  typeScroll: { flexGrow: 0 },
  typeScrollContent: { gap: 8, paddingVertical: 2 },
  typeChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipText: { fontSize: 13, fontWeight: "600" },

  zoneWrapper: { alignItems: "center", gap: 8 },
  zoneTip: { fontSize: 12 },

  speedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  speedLabel: { fontSize: 15, fontWeight: "500" },
  speedInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  speedUnit: { fontSize: 14 },

  sbRow: { flexDirection: "row", gap: 12 },
  sbBtn: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  strikeBtn: { backgroundColor: "#16a34a" },
  ballBtn: { backgroundColor: "#dc2626" },
  sbBtnText: { color: "white", fontSize: 18, fontWeight: "700" },

  logCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 4,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logTitle: { fontSize: 13, fontWeight: "600" },
  undoBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  undoText: { fontSize: 13 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  logNum: { fontSize: 11, width: 28 },
  logType: { flex: 1, fontSize: 13, fontWeight: "500" },
  logSB: { fontSize: 14, fontWeight: "700", width: 16, textAlign: "center" },
  logSpeed: { fontSize: 12, width: 60, textAlign: "right" },
  logCourse: { fontSize: 12, width: 16, textAlign: "center" },

  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  summaryPlayer: { fontSize: 16, fontWeight: "600" },
  summarySR: { fontSize: 36, fontWeight: "700" },
  summarySub: { fontSize: 13 },
  typeRow: { flexDirection: "row", paddingVertical: 6 },
  typeCell: { flex: 1, textAlign: "center", fontSize: 12 },
  typeName: { flex: 2, textAlign: "left" },

  nameLabel: { fontSize: 14, fontWeight: "500" },
  nameInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
  },
  saveBtnText: { color: "white", fontSize: 17, fontWeight: "700" },
});
