import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, Redirect, router } from "expo-router";
import { scale, verticalScale } from "@/lib/scale";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  BatterStats,
  getPAResultPitches,
  aggregateBatterStats,
} from "@/lib/batting-stats";
import { formatDate } from "@/lib/format-date";
import { extractVideoId } from "@/lib/youtube";

import { PitchTypePieChart } from "@/components/pitch-type-pie-chart";

type Tab = "batting" | "pitching";
type InningHalf = "表" | "裏"; // 表=先攻(away), 裏=後攻(home)

type Pitch = {
  id: string;
  inning: number | null;
  top_bottom: string | null;
  pa_complete: string | null;  // "打席完了" = PA最終球
  batter_name: string | null;
  batter_order: number | null;
  pitcher_name: string | null;
  pitch_type: string | null;
  pitch_speed: number | null;
  batting_result: string | null;
  batting_result2: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
};

type Game = {
  id: string;
  date: string | null;
  season: string | null;
  kind: string | null;
  away_team: string | null;
  home_team: string | null;
  away_score: number | null;
  home_score: number | null;
  away_runs_per_inning: number[] | null;
  home_runs_per_inning: number[] | null;
  youtube_url: string | null;
};

type InningTimestamp = {
  inning: number;
  top_bottom: string;
  seconds: number;
};


// 投球集計
type PitcherStats = {
  name: string;
  total: number;
  byType: Record<string, number>;
  avgSpeed: number | null;
  maxSpeed: number | null;
};

function aggregatePitching(pitches: Pitch[], half: InningHalf): PitcherStats[] {
  // 投手は守備側 = 相手チームの攻撃イニング
  const oppHalf: InningHalf = half === "表" ? "裏" : "表";
  const targetPitches = pitches.filter((p) => p.top_bottom === oppHalf);

  const map = new Map<string, { speeds: number[]; types: string[] }>();
  for (const p of targetPitches) {
    const name = p.pitcher_name ?? "不明";
    if (!map.has(name)) map.set(name, { speeds: [], types: [] });
    const entry = map.get(name)!;
    if (p.pitch_type && p.pitch_type !== "0") entry.types.push(p.pitch_type);
    if (p.pitch_type === "ストレート" && p.pitch_speed && p.pitch_speed > 0) entry.speeds.push(p.pitch_speed);
  }

  return Array.from(map.entries()).map(([name, { speeds, types }]) => {
    const byType: Record<string, number> = {};
    for (const t of types) byType[t] = (byType[t] ?? 0) + 1;
    const avgSpeed =
      speeds.length > 0
        ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
        : null;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
    return { name, total: types.length, byType, avgSpeed, maxSpeed };
  }).sort((a, b) => b.total - a.total);
}

// ─── イニングスコア表 ───────────────────────────────────────────
const LS_CELL_W = scale(25);
const LS_CELL_H = verticalScale(34);
const LS_NAME_W = scale(18);

// ─── ヒット集計用セット ───────────────────────────────────────
const HIT_SET = new Set(["単打", "二塁打", "エンタイトル", "三塁打", "本塁打", "ランニング本塁打"]);

function LinescoreCell({
  value,
  bold = false,
  cellBg,
  textColor,
  onPress,
}: {
  value: string | number | null;
  bold?: boolean;
  cellBg: string;
  textColor: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={{ width: LS_CELL_W, height: LS_CELL_H, backgroundColor: cellBg, borderRadius: 4, marginHorizontal: 1.5, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: textColor, fontSize: 13, fontWeight: bold ? "700" : "400" }}>
        {value == null ? "–" : String(value)}
      </Text>
      {onPress != null && (
        <Text style={{ position: "absolute", bottom: 1, right: 3, fontSize: 7, color: textColor, opacity: 0.5 }}>▶</Text>
      )}
    </View>
  );
  if (onPress != null) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

function LinescoreEditCell({
  value,
  onChange,
  cellBg,
  textColor,
  tintColor,
}: {
  value: string;
  onChange: (v: string) => void;
  cellBg: string;
  textColor: string;
  tintColor: string;
}) {
  return (
    <View style={{ width: LS_CELL_W, height: LS_CELL_H, backgroundColor: cellBg, borderRadius: 4, marginHorizontal: 1.5, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: tintColor }}>
      <TextInput
        style={{ color: textColor, fontSize: 13, textAlign: "center", width: LS_CELL_W - 8, padding: 0 }}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
      />
    </View>
  );
}


function Linescore({
  game,
  pitches,
  colors,
  colorScheme,
  borderColor,
  canEdit,
  timestamps,
}: {
  game: Game;
  pitches: Pitch[] | undefined;
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
  borderColor: string;
  canEdit: boolean;
  timestamps?: InningTimestamp[];
}) {
  const queryClient = useQueryClient();

  const pitchMax =
    pitches && pitches.length > 0
      ? Math.max(...pitches.filter((p) => p.inning != null).map((p) => p.inning as number))
      : 0;
  const maxInning = Math.max(
    pitchMax,
    game.away_runs_per_inning?.length ?? 0,
    game.home_runs_per_inning?.length ?? 0,
    9
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  const getInningRuns = (inning: number, manual: number[] | null | undefined): number | null => {
    if (manual == null) return null;
    return manual[inning - 1] ?? null;
  };

  const [editing, setEditing] = useState(false);
  const [editAway, setEditAway] = useState<string[]>([]);
  const [editHome, setEditHome] = useState<string[]>([]);

  const startEdit = () => {
    setEditAway(innings.map((_, i) => {
      const v = game.away_runs_per_inning?.[i];
      return v != null ? String(v) : "";
    }));
    setEditHome(innings.map((_, i) => {
      const v = game.home_runs_per_inning?.[i];
      return v != null ? String(v) : "";
    }));
    setEditing(true);
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const awayRuns = editAway.map((v) => (v === "" ? 0 : parseInt(v, 10) || 0));
      const homeRuns = editHome.map((v) => (v === "" ? 0 : parseInt(v, 10) || 0));
      const awayScore = awayRuns.reduce((s, v) => s + v, 0);
      const homeScore = homeRuns.reduce((s, v) => s + v, 0);
      const { error } = await supabase.from("games").update({
        away_runs_per_inning: awayRuns,
        home_runs_per_inning: homeRuns,
        away_score: awayScore,
        home_score: homeScore,
      }).eq("id", game.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["game", game.id] });
      setEditing(false);
    },
    onError: (e: Error) => {
      setSaveError(e.message ?? "保存に失敗しました");
    },
  });

  // ヒット・エラー集計
  const terminalAway = getPAResultPitches((pitches ?? []).filter((p) => p.top_bottom === "表"));
  const terminalHome = getPAResultPitches((pitches ?? []).filter((p) => p.top_bottom === "裏"));
  const awayHits = terminalAway.filter((p) => HIT_SET.has(p.batting_result?.trim() ?? "")).length;
  const homeHits = terminalHome.filter((p) => HIT_SET.has(p.batting_result?.trim() ?? "")).length;
  const awayErrors = terminalHome.filter((p) => (p.batting_result?.trim() ?? "") === "失策").length;
  const homeErrors = terminalAway.filter((p) => (p.batting_result?.trim() ?? "") === "失策").length;

  const editAwayTotal = editing ? editAway.reduce((s, v) => s + (parseInt(v, 10) || 0), 0) : null;
  const editHomeTotal = editing ? editHome.reduce((s, v) => s + (parseInt(v, 10) || 0), 0) : null;

  const cellBg = colorScheme === "dark" ? "#1c1c1e" : "#f3f4f6";
  const headerColor = colorScheme === "dark" ? "#8e8e93" : "#9ca3af";
  const awayAbbr = (game.away_team ?? "先").charAt(0);
  const homeAbbr = (game.home_team ?? "後").charAt(0);

  // タイムスタンプ lookup: "inning-top_bottom" → seconds
  const videoId = game.youtube_url ? extractVideoId(game.youtube_url) : null;
  const tsMap = new Map<string, number>();
  for (const ts of (timestamps ?? [])) {
    tsMap.set(`${ts.inning}-${ts.top_bottom}`, ts.seconds);
  }

  const makeOnPress = (inning: number, topBottom: string) => {
    if (!videoId) return undefined;
    const seconds = tsMap.get(`${inning}-${topBottom}`);
    if (seconds == null) return undefined;
    return () => {
      const url = `https://youtu.be/${videoId}?t=${seconds}`;
      Linking.openURL(url).catch(() => Linking.openURL(url.replace("youtu.be", "www.youtube.com/watch?v=")));
    };
  };

  return (
    <View style={{ paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor, backgroundColor: editing ? colors.tint + "0d" : undefined }}>
      {canEdit && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 12, marginBottom: 6 }}>
          {editing ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setEditing(false)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: cellBg }}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.tint }}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                  {saveMutation.isPending ? "保存中..." : "保存"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={startEdit}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: cellBg }}
            >
              <Text style={{ color: headerColor, fontSize: 13 }}>スコア編集</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {saveError && (
        <Text style={{ color: "#ef4444", fontSize: 12, paddingHorizontal: 12, marginBottom: 4 }}>
          {saveError}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        <View>
          {/* ヘッダー行 */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <View style={{ width: LS_NAME_W + 3 }} />
            {innings.map((inn) => (
              <View key={inn} style={{ width: LS_CELL_W + 3, alignItems: "center" }}>
                <Text style={{ color: headerColor, fontSize: 11 }}>{inn}</Text>
              </View>
            ))}
            {["計", "安", "失"].map((label) => (
              <View key={label} style={{ width: LS_CELL_W + 3, alignItems: "center" }}>
                <Text style={{ color: headerColor, fontSize: 11 }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* 先攻 (away) 行 */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
            <View style={{ width: LS_NAME_W, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{awayAbbr}</Text>
            </View>
            {innings.map((_, i) =>
              editing ? (
                <LinescoreEditCell
                  key={i}
                  value={editAway[i] ?? ""}
                  onChange={(v) => { const next = [...editAway]; next[i] = v; setEditAway(next); }}
                  cellBg={cellBg}
                  textColor={colors.text}
                  tintColor={colors.tint}
                />
              ) : (
                <LinescoreCell
                  key={i}
                  value={getInningRuns(innings[i], game.away_runs_per_inning)}
                  cellBg={cellBg}
                  textColor={colors.text}
                  onPress={makeOnPress(innings[i], "表")}
                />
              )
            )}
            <LinescoreCell value={editing ? editAwayTotal : game.away_score} bold cellBg={cellBg} textColor={colors.text} />
            <LinescoreCell value={awayHits} cellBg={cellBg} textColor={colors.text} />
            <LinescoreCell value={awayErrors} cellBg={cellBg} textColor={colors.text} />
          </View>

          {/* 後攻 (home) 行 */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: LS_NAME_W, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{homeAbbr}</Text>
            </View>
            {innings.map((_, i) =>
              editing ? (
                <LinescoreEditCell
                  key={i}
                  value={editHome[i] ?? ""}
                  onChange={(v) => { const next = [...editHome]; next[i] = v; setEditHome(next); }}
                  cellBg={cellBg}
                  textColor={colors.text}
                  tintColor={colors.tint}
                />
              ) : (
                <LinescoreCell
                  key={i}
                  value={getInningRuns(innings[i], game.home_runs_per_inning)}
                  cellBg={cellBg}
                  textColor={colors.text}
                  onPress={makeOnPress(innings[i], "裏")}
                />
              )
            )}
            <LinescoreCell value={editing ? editHomeTotal : game.home_score} bold cellBg={cellBg} textColor={colors.text} />
            <LinescoreCell value={homeHits} cellBg={cellBg} textColor={colors.text} />
            <LinescoreCell value={homeErrors} cellBg={cellBg} textColor={colors.text} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── YouTube 動画紐付けセクション ─────────────────────────────
type VideoItem = {
  id: string;
  title: string;
  youtube_url: string;
  created_at: string;
  team1: { name: string } | null;
  team2: { name: string } | null;
};

function YouTubeSection({
  gameId,
  youtubeUrl,
  colors,
  colorScheme,
}: {
  gameId: string;
  youtubeUrl: string | null;
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cellBg = colorScheme === "dark" ? "#1c1c1e" : "#f3f4f6";
  const sheetBg = colorScheme === "dark" ? "#2c2c2e" : "#fff";

  const { data: videos, isLoading: loadingVideos } = useQuery<VideoItem[]>({
    queryKey: ["videos-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(`id, title, youtube_url, created_at,
          team1:opponent_teams!videos_team1_id_fkey(name),
          team2:opponent_teams!videos_team2_id_fkey(name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VideoItem[];
    },
    enabled: modalVisible,
    staleTime: 2 * 60 * 1000,
  });

  const handleSelect = async (video: VideoItem) => {
    setModalVisible(false);
    setSaving(true);
    setSaveError(null);

    try {
      const videoId = extractVideoId(video.youtube_url);
      if (!videoId) throw new Error("動画IDを取得できませんでした");

      const invokePromise = supabase.functions.invoke(
        "fetch-youtube-timestamps",
        { body: { video_id: videoId, game_id: gameId, youtube_url: video.youtube_url } }
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("タイムアウト: 処理が30秒以内に完了しませんでした")), 30_000)
      );
      const { data: fnData, error: fnError } = await Promise.race([invokePromise, timeoutPromise]);
      if (fnError) throw new Error(fnError.message);
      if (fnData?.error) throw new Error(fnData.error);

      queryClient.invalidateQueries({ queryKey: ["game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["timestamps", gameId] });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* 紐付け済み表示 or ボタン */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {youtubeUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(youtubeUrl)} style={{ flex: 1 }}>
            <Text style={{ color: colors.tint, fontSize: 12 }} numberOfLines={1}>
              ▶ {youtubeUrl}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <TouchableOpacity
          onPress={() => { setSaveError(null); setModalVisible(true); }}
          disabled={saving}
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: cellBg }}
        >
          <Text style={{ color: colors.icon, fontSize: 12 }}>
            {saving ? "取得中..." : youtubeUrl ? "動画を変更" : "動画を紐付ける"}
          </Text>
        </TouchableOpacity>
      </View>
      {saveError && (
        <Text style={{ color: "#ef4444", fontSize: 11, marginTop: 2 }}>{saveError}</Text>
      )}

      {/* 動画選択モーダル */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setModalVisible(false)}
        />
        <View style={{ maxHeight: "65%", backgroundColor: sheetBg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderColor }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>動画を選択</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={{ color: colors.icon, fontSize: 14 }}>閉じる</Text>
            </TouchableOpacity>
          </View>
          {loadingVideos ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <FlatList
              data={videos ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const matchInfo = [item.team1?.name, item.team2?.name].filter(Boolean).join(" vs ");
                return (
                  <TouchableOpacity
                    onPress={() => handleSelect(item)}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderColor }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }} numberOfLines={2}>{item.title}</Text>
                    {matchInfo ? (
                      <Text style={{ color: colors.icon, fontSize: 12, marginTop: 2 }}>{matchInfo}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.icon, textAlign: "center", padding: 32, fontSize: 14 }}>
                  動画が登録されていません
                </Text>
              }
            />
          )}
        </View>
      </Modal>
    </>
  );
}

function avg(hits: number, ab: number): string {
  if (ab === 0) return ".---";
  const v = hits / ab;
  return v.toFixed(3).replace("0.", ".");
}

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const isEditor = hasRole("admin") || hasRole("analyst");
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [activeTab, setActiveTab] = useState<Tab>("batting");
  // 打撃・投球で見るチーム (表=先攻away, 裏=後攻home)
  const [viewHalf, setViewHalf] = useState<InningHalf>("表");

  const { data: game, isLoading: loadingGame, isError: gameError } = useQuery<Game>({
    queryKey: ["game", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pitches, isLoading: loadingPitches, isError: pitchesError } = useQuery<Pitch[]>({
    queryKey: ["pitches", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pitches")
        .select(
          "id, inning, top_bottom, pa_complete, batter_name, batter_order, pitcher_name, pitch_type, pitch_speed, batting_result, batting_result2, balls, strikes, outs"
        )
        .eq("game_id", id)
        .order("id");
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: timestamps } = useQuery<InningTimestamp[]>({
    queryKey: ["timestamps", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_inning_timestamps")
        .select("inning, top_bottom, seconds")
        .eq("game_id", id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!id,
    staleTime: 5 * 60 * 1000,
  });

  if (!user) return <Redirect href="/login" />;

  const isLoading = loadingGame || loadingPitches;
  const isError = gameError || pitchesError;
  const headerBg = colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6";

  const awayTeamName = game?.away_team ?? "先攻";
  const homeTeamName = game?.home_team ?? "後攻";

  const batterStats = pitches ? aggregateBatterStats(pitches.filter((p) => p.top_bottom === viewHalf)) : [];
  const pitcherStats = pitches ? aggregatePitching(pitches, viewHalf) : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 試合ヘッダー */}
      {game && (
        <View style={[styles.gameHeader, { backgroundColor: headerBg }]}>
          <Text style={[styles.gameMeta, { color: colors.icon }]}>
            {formatDate(game.date)}
            {game.season ? `　${game.season}` : ""}
            {game.kind ? `　${game.kind}` : ""}
          </Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.teamName, { color: colors.text }]} numberOfLines={1}>
              {awayTeamName}
            </Text>
            <View style={[styles.scoreBadge, { backgroundColor: colors.tint + "20" }]}>
              <Text style={[styles.scoreText, { color: colors.tint }]}>
                {game.away_score ?? "—"} - {game.home_score ?? "—"}
              </Text>
            </View>
            <Text style={[styles.teamName, { color: colors.text, textAlign: "right" }]} numberOfLines={1}>
              {homeTeamName}
            </Text>
          </View>
          {pitches && (
            <Text style={[styles.gameMeta, { color: colors.icon }]}>
              総投球数: {pitches.length}球
            </Text>
          )}
          {isEditor && (
            <YouTubeSection
              gameId={game.id}
              youtubeUrl={game.youtube_url ?? null}
              colors={colors}
              colorScheme={colorScheme}
            />
          )}
        </View>
      )}

      {/* イニングスコア表 */}
      {game && (
        <Linescore
          game={game}
          pitches={pitches}
          colors={colors}
          colorScheme={colorScheme}
          borderColor={colors.borderColor}
          canEdit={isEditor}
          timestamps={timestamps}
        />
      )}

      {/* 打撃/投球タブ */}
      <View style={[styles.tabBar, { borderBottomColor: colors.borderColor }]}>
        {(["batting", "pitching"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && {
                borderBottomColor: colors.tint,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.tint : colors.icon },
              ]}
            >
              {tab === "batting" ? "打撃成績" : "投球成績"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* チーム切り替え */}
      <View style={[styles.teamToggleBar, { backgroundColor: colorScheme === "dark" ? "#1c1c1e" : "#f9fafb", borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity
          style={[
            styles.teamToggleBtn,
            viewHalf === "表" && { backgroundColor: colors.tint },
          ]}
          onPress={() => setViewHalf("表")}
        >
          <Text style={[styles.teamToggleText, { color: viewHalf === "表" ? "#fff" : colors.text }]} numberOfLines={1}>
            {awayTeamName}（先攻）
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.teamToggleBtn,
            viewHalf === "裏" && { backgroundColor: colors.tint },
          ]}
          onPress={() => setViewHalf("裏")}
        >
          <Text style={[styles.teamToggleText, { color: viewHalf === "裏" ? "#fff" : colors.text }]} numberOfLines={1}>
            {homeTeamName}（後攻）
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.icon }}>データの読み込みに失敗しました</Text>
        </View>
      ) : activeTab === "batting" ? (
        <ScrollView contentContainerStyle={styles.tableContainer}>
            <View style={{ width: "100%" }}>
              {/* テーブルヘッダー */}
              <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: headerBg }]}>
                <Text style={[styles.colOrder, styles.headerText, { color: colors.icon }]}>#</Text>
                <Text style={[styles.colName, styles.headerText, { color: colors.icon }]}>打者</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>打席</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>打数</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>安打</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>2B</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>3B</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>HR</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>BB</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>HBP</Text>
                <Text style={[styles.colStat, styles.headerText, { color: colors.icon }]}>K</Text>
                <Text style={[styles.colAvg, styles.headerText, { color: colors.icon }]}>打率</Text>
              </View>

              {batterStats.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={{ color: colors.icon }}>打撃データがありません</Text>
                </View>
              ) : (
                batterStats.map((s, i) => (
                  <View
                    key={`${s.name}-${i}`}
                    style={[
                      styles.tableRow,
                      {
                        backgroundColor:
                          i % 2 === 0 ? colors.cardBg : colorScheme === "dark" ? "#252527" : "#f9fafb",
                        borderBottomColor: colors.borderColor,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Text style={[styles.colOrder, { color: colors.icon }]}>{s.order}</Text>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => router.push({ pathname: "/player-stats/[name]", params: { name: encodeURIComponent(s.name) } })}
                    >
                      <Text style={[styles.colName, { color: colors.tint }]} numberOfLines={1}>{s.name}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.pa}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.ab}</Text>
                    <Text style={[styles.colStat, { color: colors.text, fontWeight: s.hits > 0 ? "700" : "400" }]}>{s.hits}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.doubles || "—"}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.triples || "—"}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.hr || "—"}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.bb || "—"}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.hbp || "—"}</Text>
                    <Text style={[styles.colStat, { color: colors.text }]}>{s.k || "—"}</Text>
                    <Text style={[styles.colAvg, { color: colors.tint, fontWeight: "600" }]}>
                      {avg(s.hits, s.ab)}
                    </Text>
                  </View>
                ))
              )}
            </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.pitchingContainer}>
          {pitcherStats.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.icon }}>投球データがありません</Text>
            </View>
          ) : (
            pitcherStats.map((s) => (
              <View
                key={s.name}
                style={[styles.pitcherCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
              >
                <View style={styles.pitcherHeader}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/player-stats/[name]", params: { name: encodeURIComponent(s.name) } })}
                  >
                    <Text style={[styles.pitcherName, { color: colors.tint }]}>{s.name}</Text>
                  </TouchableOpacity>
                  <View style={[styles.pitcherBadge, { backgroundColor: colors.tint + "20" }]}>
                    <Text style={[styles.pitcherBadgeText, { color: colors.tint }]}>
                      {s.total}球
                    </Text>
                  </View>
                </View>
                <View style={styles.speedRow}>
                  {s.avgSpeed != null && (
                    <Text style={[styles.speedText, { color: colors.icon }]}>
                      直球平均 {s.avgSpeed} km/h
                    </Text>
                  )}
                  {s.maxSpeed != null && (
                    <Text style={[styles.speedText, { color: colors.icon }]}>
                      最速 {s.maxSpeed} km/h
                    </Text>
                  )}
                </View>
                {Object.keys(s.byType).length > 0 && (
                  <PitchTypePieChart
                    byType={s.byType}
                    total={s.total}
                    textColor={colors.text}
                    subTextColor={colors.icon}
                    backgroundColor={colors.cardBg}
                  />
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  gameHeader: { padding: 16, gap: 6 },
  gameMeta: { fontSize: 12 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamName: { fontSize: 15, fontWeight: "600", flex: 1 },
  scoreBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  scoreText: { fontSize: 16, fontWeight: "700" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "500" },
  // チーム切り替え
  teamToggleBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  teamToggleText: { fontSize: 13, fontWeight: "600" },
  // 打撃テーブル
  tableContainer: { flexGrow: 1 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableHeader: { paddingVertical: 8 },
  headerText: { fontSize: 11, fontWeight: "600" },
  colOrder: { width: 20, textAlign: "center", fontSize: 12 },
  colName: { flex: 1, fontSize: 12, paddingHorizontal: 2 },
  colStat: { width: 28, textAlign: "center", fontSize: 12 },
  colAvg: { width: 38, textAlign: "center", fontSize: 12 },
  emptyRow: { padding: 32, alignItems: "center" },
  // 投球成績
  pitchingContainer: { padding: 16, gap: 12 },
  pitcherCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  pitcherHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pitcherName: { fontSize: 16, fontWeight: "600" },
  pitcherBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  pitcherBadgeText: { fontSize: 14, fontWeight: "700" },
  speedRow: { flexDirection: "row", gap: 16 },
  speedText: { fontSize: 13 },
});
