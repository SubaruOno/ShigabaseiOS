import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, Redirect } from "expo-router";
import { useState, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useLayout } from "@/hooks/use-layout";
import {
  BatterStats,
  PitchForStats,
  getPAResultPitches,
  applyBattingResult,
} from "@/lib/batting-stats";
import { PitchTypePieChart } from "@/components/pitch-type-pie-chart";
import { PitchLocationChart } from "@/components/pitch-location-chart";
import { SprayChart } from "@/components/spray-chart";
import { formatDate } from "@/lib/format-date";

type Tab = "batting" | "pitching";

type PitchWithGame = PitchForStats & {
  id: string;
  pitcher_name: string | null;
  pitcher_hand: string | null;
  batter_hand: string | null;
  pitch_type: string | null;
  pitch_speed: number | null;
  course_x: number | null;
  course_y: number | null;
  hit_x: number | null;
  hit_y: number | null;
  top_bottom: string | null;
  game_id: string;
  games: {
    id: string;
    date: string | null;
    season: string | null;
    kind: string | null;
    away_team: string | null;
    home_team: string | null;
  } | null;
};

type PitcherAggStats = {
  pitches: number;
  bf: number;
  ip: string;
  h: number;
  hr: number;
  k: number;
  bb: number;
  hbp: number;
  baa: string;
  avgSpeed: number | null;
  maxSpeed: number | null;
  byType: Record<string, number>;
};

type GameEntry = {
  id: string;
  date: string | null;
  season: string | null;
  kind: string | null;
  label: string;
};

type Filters = {
  year: number | null;      // null = すべて
  season: string | null;   // null = すべて
  kind: string | null;     // null = すべて
  gameIds: string[] | null; // null = すべて、配列 = 特定試合
};

type PlayerRecord = {
  id: string;
  name: string;
  excel_name: string | null;
  uniform_number: number | null;
};

function formatIP(outs: number): string {
  const full = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? String(full) : `${full}.${rem}`;
}

function outsForResult(result: string): number {
  switch (result) {
    case "空振り三振":
    case "見逃し三振":
    case "K3":
    case "凡打死":
    case "ファールフライ":
    case "犠打":
    case "犠飛":
      return 1;
    default:
      return 0;
  }
}

function calcBaa(h: number, bf: number, bb: number, hbp: number, sf: number): string {
  const ab = bf - bb - hbp - sf;
  if (ab <= 0) return ".---";
  const v = h / ab;
  return v.toFixed(3).replace("0.", ".");
}


function avg(hits: number, ab: number): string {
  if (ab === 0) return ".---";
  const v = hits / ab;
  return v.toFixed(3).replace("0.", ".");
}

function emptyStats(name: string): BatterStats {
  return { name, order: 0, pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, k: 0 };
}

export default function PlayerStatsScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  // 円グラフ(約320)とコース図(最大360)が並ぶ幅があれば左右に並べる。iPadは縦向きでも並ぶ
  const { width } = useLayout();
  const chartsSideBySide = width >= 720;
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("batting");
  const [filters, setFilters] = useState<Filters>({ year: null, season: null, kind: null, gameIds: null });
  const [filterVisible, setFilterVisible] = useState(false);
  const [handFilter, setHandFilter] = useState<"右" | "左" | null>(null);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setHandFilter(null);
  };

  const decodedName = name ? decodeURIComponent(name) : "";

  // 打撃データ取得（このプレイヤーが打者として登場した全投球）
  const { data: battingPitches, isLoading: loadingBatting } = useQuery<PitchWithGame[]>({
    queryKey: ["player_batting", decodedName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pitches")
        .select(
          "id, pa_complete, batter_name, batter_order, batting_result, pitcher_name, pitcher_hand, pitch_type, pitch_speed, hit_x, hit_y, top_bottom, game_id, games(id, date, season, kind, away_team, home_team)"
        )
        .eq("batter_name", decodedName)
        .order("game_id");
      if (error) throw error;
      return data as unknown as PitchWithGame[];
    },
    enabled: !!user && !!decodedName,
    staleTime: 5 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
  });

  // 投球データ取得（このプレイヤーが投手として登板した全投球）
  const { data: pitchingPitches, isLoading: loadingPitching } = useQuery<PitchWithGame[]>({
    queryKey: ["player_pitching", decodedName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pitches")
        .select(
          "id, pa_complete, batting_result, batter_hand, pitch_type, pitch_speed, course_x, course_y, game_id, games(id, date, season, kind, away_team, home_team)"
        )
        .eq("pitcher_name", decodedName)
        .order("game_id");
      if (error) throw error;
      return data as unknown as PitchWithGame[];
    },
    enabled: !!user && !!decodedName,
    staleTime: 5 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
  });

  // 選手情報取得（背番号表示用。excel_name 未設定でも画面は動作する）
  const { data: playerRecord } = useQuery<PlayerRecord | null>({
    queryKey: ["player_record", decodedName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, excel_name, uniform_number")
        .eq("excel_name", decodedName)
        .maybeSingle();
      if (error) throw error;
      return data as PlayerRecord | null;
    },
    enabled: !!user && !!decodedName,
    staleTime: 10 * 60 * 1000,
  });

  // フィルター選択肢（年度・シーズン・試合種別・試合一覧）
  const filterOptions = useMemo(() => {
    const yearSet = new Set<number>();
    const seasonSet = new Set<string>();
    const kindSet = new Set<string>();
    const gameMap = new Map<string, GameEntry>();

    for (const p of [...(battingPitches ?? []), ...(pitchingPitches ?? [])]) {
      const g = p.games;
      if (!g) continue;
      if (g.date) yearSet.add(new Date(g.date).getFullYear());
      if (g.season) seasonSet.add(g.season);
      if (g.kind) kindSet.add(g.kind);
      if (!gameMap.has(p.game_id)) {
        gameMap.set(p.game_id, {
          id: p.game_id,
          date: g.date,
          season: g.season,
          kind: g.kind,
          label: `${formatDate(g.date)}　${g.away_team ?? "?"} vs ${g.home_team ?? "?"}`,
        });
      }
    }

    return {
      years: Array.from(yearSet).sort((a, b) => b - a),
      seasons: Array.from(seasonSet).sort(),
      kinds: Array.from(kindSet).sort(),
      games: Array.from(gameMap.values()).sort((a, b) =>
        (b.date ?? "").localeCompare(a.date ?? "")
      ),
    };
  }, [battingPitches, pitchingPitches]);

  // フィルタ済みデータ
  const applyFilters = (pitches: PitchWithGame[]) => {
    if (filters.gameIds !== null) {
      // 試合選択モード：選択試合のみ（year/season/kind は無視）
      return pitches.filter((p) => filters.gameIds!.includes(p.game_id));
    }
    return pitches.filter((p) => {
      if (filters.year && (!p.games?.date || new Date(p.games.date).getFullYear() !== filters.year)) return false;
      if (filters.season && p.games?.season !== filters.season) return false;
      if (filters.kind && p.games?.kind !== filters.kind) return false;
      return true;
    });
  };

  const filteredBatting = useMemo(() => {
    let result = applyFilters(battingPitches ?? []);
    if (handFilter) result = result.filter((p) => p.pitcher_hand === handFilter);
    return result;
  }, [battingPitches, filters, handFilter]);

  const filteredPitching = useMemo(() => {
    let result = applyFilters(pitchingPitches ?? []);
    if (handFilter) result = result.filter((p) => p.batter_hand === handFilter);
    return result;
  }, [pitchingPitches, filters, handFilter]);

  // 通算打撃成績
  const totalBatting = useMemo(() => {
    if (!filteredBatting.length) return null;
    const paPitches = getPAResultPitches(filteredBatting);
    const s = emptyStats(decodedName);
    for (const p of paPitches) {
      applyBattingResult(s, p.batting_result?.trim() ?? "");
    }
    return s;
  }, [filteredBatting, decodedName]);

  // 試合別打撃成績
  const gameBatting = useMemo(() => {
    const byGame = new Map<string, PitchWithGame[]>();
    for (const p of filteredBatting) {
      if (!byGame.has(p.game_id)) byGame.set(p.game_id, []);
      byGame.get(p.game_id)!.push(p);
    }

    const result: Array<{
      gameId: string;
      date: string | null;
      teams: string;
      stats: BatterStats;
    }> = [];

    for (const [gameId, pitches] of byGame) {
      const game = pitches[0].games;
      const paPitches = getPAResultPitches(pitches);
      const s = emptyStats(decodedName);
      for (const p of paPitches) {
        applyBattingResult(s, p.batting_result?.trim() ?? "");
      }
      const teams = game
        ? `${game.away_team ?? "?"} vs ${game.home_team ?? "?"}`
        : "—";
      result.push({ gameId, date: game?.date ?? null, teams, stats: s });
    }

    return result.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [filteredBatting, decodedName]);

  // 通算投球成績
  const pitchingStats = useMemo((): PitcherAggStats | null => {
    if (!filteredPitching.length) return null;

    const speeds: number[] = [];
    const types: string[] = [];
    let bf = 0, h = 0, hr = 0, k = 0, bb = 0, hbp = 0, sf = 0, totalOuts = 0;

    for (const p of filteredPitching) {
      if (p.pitch_type && p.pitch_type !== "0") types.push(p.pitch_type);
      if (p.pitch_speed && p.pitch_speed > 0) speeds.push(p.pitch_speed);

      if (p.pa_complete === "打席完了") {
        bf++;
        const result = p.batting_result?.trim() ?? "";
        switch (result) {
          case "単打": h++; break;
          case "二塁打": case "エンタイトル": h++; break;
          case "三塁打": h++; break;
          case "本塁打": case "ランニング本塁打": h++; hr++; break;
          case "四球": bb++; break;
          case "死球": hbp++; break;
          case "空振り三振": case "見逃し三振": case "K3": k++; break;
          case "振り逃げ": k++; break;
          case "犠飛": sf++; break;
        }
        totalOuts += outsForResult(result);
      }
    }

    const byType: Record<string, number> = {};
    for (const t of types) byType[t] = (byType[t] ?? 0) + 1;
    const avgSpeed = speeds.length > 0
      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
      : null;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

    return {
      pitches: types.length,
      bf,
      ip: formatIP(totalOuts),
      h, hr, k, bb, hbp,
      baa: calcBaa(h, bf, bb, hbp, sf),
      avgSpeed, maxSpeed, byType,
    };
  }, [filteredPitching]);

  // 試合別投球成績
  const gamePitching = useMemo(() => {
    const byGame = new Map<string, PitchWithGame[]>();
    for (const p of filteredPitching) {
      if (!byGame.has(p.game_id)) byGame.set(p.game_id, []);
      byGame.get(p.game_id)!.push(p);
    }
    const result: Array<{
      gameId: string;
      date: string | null;
      teams: string;
      total: number;
      avgSpeed: number | null;
      maxSpeed: number | null;
      bf: number;
      ip: string;
      h: number;
      k: number;
      bb: number;
      hbp: number;
      baa: string;
    }> = [];
    for (const [gameId, pitches] of byGame) {
      const game = pitches[0].games;
      const speeds = pitches
        .filter((p) => p.pitch_speed && p.pitch_speed > 0)
        .map((p) => p.pitch_speed!);
      const avgSpeed = speeds.length > 0
        ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
        : null;
      const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

      let bf = 0, h = 0, k = 0, bb = 0, hbp = 0, sf = 0, totalOuts = 0;
      for (const p of pitches) {
        if (p.pa_complete === "打席完了") {
          bf++;
          const r = p.batting_result?.trim() ?? "";
          switch (r) {
            case "単打": case "二塁打": case "エンタイトル": case "三塁打": h++; break;
            case "本塁打": case "ランニング本塁打": h++; break;
            case "四球": bb++; break;
            case "死球": hbp++; break;
            case "空振り三振": case "見逃し三振": case "K3": case "振り逃げ": k++; break;
            case "犠飛": sf++; break;
          }
          totalOuts += outsForResult(r);
        }
      }

      const teams = game
        ? `${game.away_team ?? "?"} vs ${game.home_team ?? "?"}`
        : "—";
      result.push({
        gameId,
        date: game?.date ?? null,
        teams,
        total: pitches.filter((p) => p.pitch_type && p.pitch_type !== "0").length,
        avgSpeed, maxSpeed,
        bf, ip: formatIP(totalOuts), h, k, bb, hbp,
        baa: calcBaa(h, bf, bb, hbp, sf),
      });
    }
    return result.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [filteredPitching]);

  if (!user) return <Redirect href="/login" />;

  const isLoading = loadingBatting || loadingPitching;
  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;
  const headerBg = colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6";

  const hasBatting = filteredBatting.length > 0;
  const hasPitching = filteredPitching.some(
    (p) => p.pitch_type && p.pitch_type !== "0"
  );
  const effectiveTab: Tab = !isLoading && !hasBatting && hasPitching
    ? "pitching"
    : activeTab === "pitching" && !isLoading && !hasPitching
    ? "batting"
    : activeTab;

  const activeFilterCount = [
    filters.year !== null,
    filters.season !== null,
    filters.kind !== null,
    filters.gameIds !== null,
  ].filter(Boolean).length;

  const gameSelectMode = filters.gameIds !== null;

  const toggleGameId = (id: string) => {
    const current = filters.gameIds ?? [];
    const next = current.includes(id)
      ? current.filter((g) => g !== id)
      : [...current, id];
    setFilters((f) => ({ ...f, gameIds: next.length === 0 ? null : next }));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 選手ヘッダー */}
      <View style={[styles.playerHeader, { backgroundColor: headerBg }]}>
        <Text style={[styles.playerName, { color: colors.text }]}>{decodedName}</Text>
        {playerRecord?.uniform_number != null && (
          <Text style={[styles.uniformNumber, { color: colors.icon }]}>
            #{playerRecord.uniform_number}
          </Text>
        )}
      </View>

      {/* フィルターバー */}
      {filterOptions.games.length > 0 && (
        <View style={[styles.filterBar, { borderBottomColor: borderColor }]}>
          {/* フィルターボタン */}
          <TouchableOpacity
            style={[
              styles.filterBtn,
              { borderColor: activeFilterCount > 0 ? colors.tint : borderColor },
              activeFilterCount > 0 && { backgroundColor: colors.tint + "15" },
            ]}
            onPress={() => setFilterVisible(true)}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={activeFilterCount > 0 ? colors.tint : colors.icon}
            />
            <Text style={[styles.filterBtnText, { color: activeFilterCount > 0 ? colors.tint : colors.text }]}>
              フィルター
            </Text>
            {activeFilterCount > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: colors.tint }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.filterClearBtn}
              onPress={() => setFilters({ year: null, season: null, kind: null, gameIds: null })}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.icon} />
            </TouchableOpacity>
          )}

          <View style={{ flex: 1 }} />

          {/* 対左右セグメント */}
          <View style={[styles.handSegment, { borderColor }]}>
            {([null, "右", "左"] as const).map((h, i) => {
              const label = h === null ? "全" : h;
              const active = handFilter === h;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.handSegBtn,
                    i < 2 && { borderRightColor: borderColor, borderRightWidth: StyleSheet.hairlineWidth },
                    active && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setHandFilter(h)}
                >
                  <Text style={[styles.handSegText, { color: active ? "#fff" : colors.text }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.handSegLabel, { color: colors.icon }]}>
            {effectiveTab === "batting" ? "投手" : "打者"}
          </Text>
        </View>
      )}

      {/* フィルターモーダル */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterVisible(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colorScheme === "dark" ? "#1c1c1e" : "#f2f2f7" }]}
            onPress={() => {}}
          >
            {/* モーダルヘッダー */}
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <TouchableOpacity
                onPress={() => setFilters({ year: null, season: null, kind: null, gameIds: null })}
                hitSlop={8}
              >
                <Text style={[styles.modalResetText, { color: activeFilterCount > 0 ? colors.tint : colors.icon }]}>
                  リセット
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>フィルター</Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
              {/* 年度 */}
              {filterOptions.years.length > 1 && (
                <View style={[styles.modalSection, { opacity: gameSelectMode ? 0.35 : 1 }]}>
                  <Text style={[styles.modalSectionTitle, { color: colors.icon }]}>年度</Text>
                  <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
                    {[null, ...filterOptions.years].map((y, i) => (
                      <TouchableOpacity
                        key={y ?? "__all__"}
                        disabled={gameSelectMode}
                        style={[
                          styles.modalOption,
                          { borderBottomColor: borderColor },
                          i === filterOptions.years.length && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => setFilters((f) => ({ ...f, year: y }))}
                      >
                        <Text style={[styles.modalOptionText, { color: colors.text }]}>
                          {y ?? "全年度"}
                        </Text>
                        {filters.year === y && (
                          <Ionicons name="checkmark" size={20} color={colors.tint} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* シーズン */}
              {filterOptions.seasons.length > 0 && (
                <View style={[styles.modalSection, { opacity: gameSelectMode ? 0.35 : 1 }]}>
                  <Text style={[styles.modalSectionTitle, { color: colors.icon }]}>シーズン</Text>
                  <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
                    {[null, ...filterOptions.seasons].map((s, i) => (
                      <TouchableOpacity
                        key={s ?? "__all__"}
                        disabled={gameSelectMode}
                        style={[
                          styles.modalOption,
                          { borderBottomColor: borderColor },
                          i === filterOptions.seasons.length && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => setFilters((f) => ({ ...f, season: s }))}
                      >
                        <Text style={[styles.modalOptionText, { color: colors.text }]}>
                          {s ?? "全期間"}
                        </Text>
                        {filters.season === s && (
                          <Ionicons name="checkmark" size={20} color={colors.tint} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* 試合種別 */}
              {filterOptions.kinds.length > 0 && (
                <View style={[styles.modalSection, { opacity: gameSelectMode ? 0.35 : 1 }]}>
                  <Text style={[styles.modalSectionTitle, { color: colors.icon }]}>試合種別</Text>
                  <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
                    {[null, ...filterOptions.kinds].map((k, i) => (
                      <TouchableOpacity
                        key={k ?? "__all__"}
                        disabled={gameSelectMode}
                        style={[
                          styles.modalOption,
                          { borderBottomColor: borderColor },
                          i === filterOptions.kinds.length && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => setFilters((f) => ({ ...f, kind: k }))}
                      >
                        <Text style={[styles.modalOptionText, { color: colors.text }]}>
                          {k ?? "すべて"}
                        </Text>
                        {filters.kind === k && (
                          <Ionicons name="checkmark" size={20} color={colors.tint} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* 試合選択 */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Text style={[styles.modalSectionTitle, { color: colors.icon }]}>試合を選択</Text>
                  {gameSelectMode && (
                    <TouchableOpacity
                      onPress={() => setFilters((f) => ({ ...f, gameIds: null }))}
                      hitSlop={8}
                    >
                      <Text style={[styles.modalResetText, { color: colors.tint }]}>選択解除</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {gameSelectMode && (
                  <Text style={[styles.modalSectionNote, { color: colors.icon }]}>
                    ※ 試合選択中はシーズン・種別フィルターは無効
                  </Text>
                )}
                <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
                  {filterOptions.games.map((g, i) => {
                    const checked = filters.gameIds?.includes(g.id) ?? false;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[
                          styles.modalOption,
                          { borderBottomColor: borderColor },
                          i === filterOptions.games.length - 1 && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => toggleGameId(g.id)}
                      >
                        <View style={styles.gameOptionLeft}>
                          <Text style={[styles.modalOptionText, { color: colors.text }]}>
                            {g.label}
                          </Text>
                          {(g.season || g.kind) && (
                            <Text style={[styles.gameOptionSub, { color: colors.icon }]}>
                              {[g.season, g.kind].filter(Boolean).join("　")}
                            </Text>
                          )}
                        </View>
                        <View style={[
                          styles.checkbox,
                          { borderColor: checked ? colors.tint : borderColor },
                          checked && { backgroundColor: colors.tint },
                        ]}>
                          {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <>
          {/* タブバー：打撃・投球両方データがある場合のみ表示 */}
          {hasBatting && hasPitching && (
            <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
              {(["batting", "pitching"] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tab,
                    effectiveTab === tab && {
                      borderBottomColor: colors.tint,
                      borderBottomWidth: 2,
                    },
                  ]}
                  onPress={() => handleTabChange(tab)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: effectiveTab === tab ? colors.tint : colors.icon },
                    ]}
                  >
                    {tab === "batting" ? "打撃成績" : "投球成績"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {isLoading ? null : effectiveTab === "batting" ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* 通算成績 */}
          {totalBatting ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>通算成績</Text>
              {/* 1行目: 打席 / 安打 / 本塁打 / 打率 */}
              <View style={[styles.statRow, { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                {[
                  { label: "打席", value: String(totalBatting.pa), tint: false },
                  { label: "安打", value: String(totalBatting.hits), tint: false },
                  { label: "本塁打", value: totalBatting.hr ? String(totalBatting.hr) : "—", tint: false },
                  { label: "打率", value: avg(totalBatting.hits, totalBatting.ab), tint: true },
                ].map((item, j) => (
                  <View key={item.label} style={[styles.statBox, j < 3 && { borderRightColor: borderColor, borderRightWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.statLabel, { color: colors.icon }]}>{item.label}</Text>
                    <Text style={[styles.statValue, { color: item.tint ? colors.tint : colors.text }, item.tint && { fontWeight: "700" }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
              {/* 2行目: 打数 / 2塁打 / 三振 / 四死球 */}
              <View style={styles.statRow}>
                {[
                  { label: "打数", value: String(totalBatting.ab) },
                  { label: "2塁打", value: totalBatting.doubles ? String(totalBatting.doubles) : "—" },
                  { label: "三振", value: totalBatting.k ? String(totalBatting.k) : "—" },
                  { label: "四死球", value: (totalBatting.bb + totalBatting.hbp) ? String(totalBatting.bb + totalBatting.hbp) : "—" },
                ].map((item, j) => (
                  <View key={item.label} style={[styles.statBox, j < 3 && { borderRightColor: borderColor, borderRightWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.statLabel, { color: colors.icon }]}>{item.label}</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={{ color: colors.icon }}>打撃データなし</Text>
            </View>
          )}

          {/* スプレーチャート */}
          {filteredBatting.some((p) => p.hit_x != null && p.hit_y != null) && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <SprayChart
                hits={filteredBatting}
                textColor={colors.text}
                backgroundColor={cardBg}
              />
            </View>
          )}

          {/* 試合別成績 */}
          {gameBatting.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>試合別成績</Text>
              {gameBatting.map((g, i) => (
                <View
                  key={g.gameId}
                  style={[
                    styles.gameRow,
                    {
                      borderTopColor: borderColor,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.gameRowLeft}>
                    <Text style={[styles.gameDate, { color: colors.text }]}>
                      {formatDate(g.date)}
                    </Text>
                    <Text style={[styles.gameTeams, { color: colors.icon }]} numberOfLines={1}>
                      {g.teams}
                    </Text>
                  </View>
                  <Text style={[styles.gameStatText, { color: colors.text }]}>
                    {g.stats.hits}/{g.stats.ab}
                    {g.stats.hr > 0 ? `  HR:${g.stats.hr}` : ""}
                    {g.stats.bb > 0 ? `  BB:${g.stats.bb}` : ""}
                    {g.stats.k > 0 ? `  K:${g.stats.k}` : ""}
                  </Text>
                  <Text style={[styles.gameAvg, { color: colors.tint }]}>
                    {avg(g.stats.hits, g.stats.ab)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {pitchingStats ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>通算投球成績</Text>

              {/* 1行目: 球数 / 投球回 / 奪三振 / 被打率 */}
              <View style={[styles.statRow, { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                {[
                  { label: "球数", value: String(pitchingStats.pitches), tint: false },
                  { label: "投球回", value: pitchingStats.ip, tint: false },
                  { label: "奪三振", value: String(pitchingStats.k), tint: false },
                  { label: "被打率", value: pitchingStats.baa, tint: true },
                ].map((item, j) => (
                  <View key={item.label} style={[styles.statBox, j < 3 && { borderRightColor: borderColor, borderRightWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.statLabel, { color: colors.icon }]}>{item.label}</Text>
                    <Text style={[styles.statValue, { color: item.tint ? colors.tint : colors.text }, item.tint && { fontWeight: "700" }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
              {/* 2行目: 打者対戦 / 被安打 / 与四死 / 本塁打 */}
              <View style={styles.statRow}>
                {[
                  { label: "打者対戦", value: String(pitchingStats.bf) },
                  { label: "被安打", value: String(pitchingStats.h) },
                  { label: "与四死", value: String(pitchingStats.bb + pitchingStats.hbp) },
                  { label: "本塁打", value: pitchingStats.hr ? String(pitchingStats.hr) : "—" },
                ].map((item, j) => (
                  <View key={item.label} style={[styles.statBox, j < 3 && { borderRightColor: borderColor, borderRightWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.statLabel, { color: colors.icon }]}>{item.label}</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{item.value}</Text>
                  </View>
                ))}
              </View>

              {/* 球速 */}
              {(pitchingStats.avgSpeed != null || pitchingStats.maxSpeed != null) && (
                <View style={styles.speedRow}>
                  {pitchingStats.avgSpeed != null && (
                    <Text style={[styles.speedText, { color: colors.icon }]}>
                      平均 {pitchingStats.avgSpeed} km/h
                    </Text>
                  )}
                  {pitchingStats.maxSpeed != null && (
                    <Text style={[styles.speedText, { color: colors.icon }]}>
                      最速 {pitchingStats.maxSpeed} km/h
                    </Text>
                  )}
                </View>
              )}

              {/* 広い画面では円グラフとコース図を左右に並べる */}
              <View style={chartsSideBySide ? styles.chartsWide : undefined}>
                {/* 球種円グラフ */}
                {Object.keys(pitchingStats.byType).length > 0 && (
                  <View style={chartsSideBySide ? styles.chartsWideItem : undefined}>
                    <PitchTypePieChart
                      byType={pitchingStats.byType}
                      total={pitchingStats.pitches}
                      textColor={colors.text}
                      subTextColor={colors.icon}
                      backgroundColor={cardBg}
                    />
                  </View>
                )}

                {/* 投球コースチャート */}
                <View style={chartsSideBySide ? styles.chartsWideItem : undefined}>
                  <PitchLocationChart
                    pitches={filteredPitching}
                    textColor={colors.text}
                    subTextColor={colors.icon}
                    backgroundColor={cardBg}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={{ color: colors.icon }}>投球データなし</Text>
            </View>
          )}

          {/* 試合別投球成績 */}
          {gamePitching.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>試合別成績</Text>
              {gamePitching.map((g, i) => (
                <View
                  key={g.gameId}
                  style={[
                    styles.gameRow,
                    { borderTopColor: borderColor, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={styles.gameRowLeft}>
                    <Text style={[styles.gameDate, { color: colors.text }]}>{formatDate(g.date)}</Text>
                    <Text style={[styles.gameTeams, { color: colors.icon }]} numberOfLines={1}>{g.teams}</Text>
                  </View>
                  <View style={styles.pitchGameStats}>
                    <Text style={[styles.gameStatText, { color: colors.text }]}>
                      {g.total}球　IP:{g.ip}
                    </Text>
                    <Text style={[styles.pitchGameSub, { color: colors.icon }]}>
                      H:{g.h}　K:{g.k}　四死:{g.bb + g.hbp}
                    </Text>
                  </View>
                  <Text style={[styles.gameAvg, { color: colors.tint }]}>{g.baa}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyBox: { padding: 32, alignItems: "center" },
  playerHeader: { padding: 16, gap: 4 },
  playerName: { fontSize: 20, fontWeight: "700" },
  uniformNumber: { fontSize: 14 },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterBtnText: { fontSize: 13, fontWeight: "500" },
  filterBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  filterClearBtn: { padding: 2 },
  handSegment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 7,
    overflow: "hidden",
  },
  handSegBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  handSegText: { fontSize: 13, fontWeight: "500" },
  handSegLabel: { fontSize: 11, marginLeft: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: "600" },
  modalResetText: { fontSize: 14 },
  modalSection: { paddingHorizontal: 16, paddingTop: 20, gap: 6 },
  modalSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalSectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  modalSectionNote: { fontSize: 12, marginTop: 2 },
  modalCard: { borderRadius: 12, overflow: "hidden", marginBottom: 4 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: { fontSize: 16 },
  gameOptionLeft: { flex: 1, gap: 2 },
  gameOptionSub: { fontSize: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "500" },
  scrollContent: { padding: 16, gap: 12 },
  chartsWide: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  chartsWideItem: { flex: 1 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  gameRowLeft: { flex: 1, gap: 2 },
  gameDate: { fontSize: 13, fontWeight: "500" },
  gameTeams: { fontSize: 11 },
  gameStatText: { fontSize: 13, fontWeight: "500" },
  gameAvg: { fontSize: 13, fontWeight: "600", width: 52, textAlign: "right" },
  speedRow: { flexDirection: "row", gap: 16 },
  speedText: { fontSize: 13 },
  // stat grid
  statRow: { flexDirection: "row" },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 16, fontWeight: "600", marginTop: 3 },
  // per-game pitching row
  pitchGameStats: { alignItems: "flex-end", gap: 3 },
  pitchGameSub: { fontSize: 12 },
});
