import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { Redirect } from "expo-router";
import { useState, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/fetch-all";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  getPAResultPitches,
  applyBattingResult,
  BatterStats,
} from "@/lib/batting-stats";
import { PitchTypePieChart } from "@/components/pitch-type-pie-chart";
import {
  PitchLocationChart,
  PitchDot,
  buildLocationChartSvg,
} from "@/components/pitch-location-chart";
import { SprayChart, HitDot, buildSprayChartSvg } from "@/components/spray-chart";
import { formatDate } from "@/lib/format-date";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type Step = "player" | "analysis" | "result";
type AnalysisType = "batting" | "pitching" | "spray" | "location";

type PitchRow = {
  id: string;
  batter_name: string | null;
  batter_order: number | null;
  pitcher_name: string | null;
  game_id: string;
  pa_complete: string | null;
  batting_result: string | null;
  pitch_type: string | null;
  pitch_speed: number | null;
  course_x: number | null;
  course_y: number | null;
  hit_x: number | null;
  hit_y: number | null;
  games: {
    id: string;
    date: string | null;
    away_team: string | null;
    home_team: string | null;
  } | null;
};

type PlayerHit = {
  name: string;
  asBatter: boolean;
  asPitcher: boolean;
  batterHand: string | null;
  pitcherHand: string | null;
  offenseTeams: string[];
};

type PitchingStats = {
  total: number; bf: number; h: number; hr: number; k: number;
  bb: number; hbp: number; ip: string; byType: Record<string, number>;
  avgSpeed: number | null; maxSpeed: number | null; baa: string;
};

const ANALYSIS_OPTIONS: { type: AnalysisType; label: string; icon: any; desc: string }[] = [
  { type: "batting",  label: "打撃成績",        icon: "stats-chart-outline", desc: "通算・試合別の打撃成績" },
  { type: "pitching", label: "投球成績",        icon: "baseball-outline",    desc: "球種・球速・被打率" },
  { type: "spray",    label: "スプレーチャート", icon: "map-outline",         desc: "打球方向の分布" },
  { type: "location", label: "投球コース分布",   icon: "grid-outline",        desc: "ストライクゾーンへの投球分布" },
];

function avg(hits: number, ab: number) {
  if (ab === 0) return ".---";
  return (hits / ab).toFixed(3).replace("0.", ".");
}
function emptyStats(): BatterStats {
  return { name: "", order: 0, pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, k: 0 };
}
function outsForResult(r: string) {
  switch (r) {
    case "空振り三振": case "見逃し三振": case "K3":
    case "凡打死": case "ファールフライ": case "犠打": case "犠飛": return 1;
    default: return 0;
  }
}
function formatIP(outs: number) {
  const f = Math.floor(outs / 3), r = outs % 3;
  return r === 0 ? String(f) : `${f}.${r}`;
}

function computePitchingStats(pitches: PitchRow[]): PitchingStats | null {
  if (!pitches.length) return null;
  const speeds: number[] = [];
  const byType: Record<string, number> = {};
  let bf = 0, h = 0, hr = 0, k = 0, bb = 0, hbp = 0, sf = 0, totalOuts = 0;
  for (const p of pitches) {
    if (p.pitch_type && p.pitch_type !== "0") byType[p.pitch_type] = (byType[p.pitch_type] ?? 0) + 1;
    if (p.pitch_speed && p.pitch_speed > 0) speeds.push(p.pitch_speed);
    if (p.pa_complete === "打席完了") {
      bf++;
      const r = p.batting_result?.trim() ?? "";
      switch (r) {
        case "単打": case "二塁打": case "エンタイトル": case "三塁打": h++; break;
        case "本塁打": case "ランニング本塁打": h++; hr++; break;
        case "四球": bb++; break;
        case "死球": hbp++; break;
        case "空振り三振": case "見逃し三振": case "K3": case "振り逃げ": k++; break;
        case "犠飛": sf++; break;
      }
      totalOuts += outsForResult(r);
    }
  }
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b) / speeds.length) : null;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
  const abForBaa = bf - bb - hbp - sf;
  const baa = abForBaa > 0 ? (h / abForBaa).toFixed(3).replace("0.", ".") : ".---";
  return { total, bf, h, hr, k, bb, hbp, ip: formatIP(totalOuts), byType, avgSpeed, maxSpeed, baa };
}

function buildPdfHtml(
  players: string[],
  analysis: AnalysisType,
  battingByPlayer: Map<string, BatterStats>,
  pitchingByPlayer: Map<string, PitchingStats>,
  battingPitches: PitchRow[],
  pitchingPitches: PitchRow[],
): string {
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const analysisLabel = ANALYSIS_OPTIONS.find((o) => o.type === analysis)?.label ?? "";

  let content = "";

  if (analysis === "batting") {
    const rows = players.map((name) => {
      const s = battingByPlayer.get(name);
      if (!s) return `<tr><td>${name}</td><td colspan="9">データなし</td></tr>`;
      return `<tr>
        <td>${name}</td><td>${s.pa}</td><td>${s.ab}</td><td>${s.hits}</td>
        <td>${s.doubles || "—"}</td><td>${s.triples || "—"}</td><td>${s.hr || "—"}</td>
        <td>${(s.bb + s.hbp) || "—"}</td><td>${s.k || "—"}</td>
        <td class="hl">${avg(s.hits, s.ab)}</td>
      </tr>`;
    }).join("");
    content = `<h2>打撃成績</h2>
    <table><thead><tr>
      <th>選手名</th><th>打席</th><th>打数</th><th>安打</th><th>2塁打</th><th>3塁打</th><th>本塁打</th><th>四死球</th><th>三振</th><th>打率</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

  } else if (analysis === "pitching") {
    const rows = players.map((name) => {
      const s = pitchingByPlayer.get(name);
      if (!s) return `<tr><td>${name}</td><td colspan="9">データなし</td></tr>`;
      return `<tr>
        <td>${name}</td><td>${s.total}</td><td>${s.bf}</td><td>${s.ip}</td><td>${s.k}</td>
        <td>${s.bb + s.hbp}</td><td>${s.h}</td><td class="hl">${s.baa}</td>
        <td>${s.avgSpeed != null ? s.avgSpeed + "km/h" : "—"}</td>
        <td>${s.maxSpeed != null ? s.maxSpeed + "km/h" : "—"}</td>
      </tr>`;
    }).join("");
    content = `<h2>投球成績</h2>
    <table><thead><tr>
      <th>選手名</th><th>球数</th><th>対打者</th><th>投球回</th><th>奪三振</th><th>与四死</th><th>被安打</th><th>被打率</th><th>平均球速</th><th>最速</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

  } else if (analysis === "spray") {
    const sections = players.map((name, i) => {
      const hits = battingPitches.filter((p) => p.batter_name === name) as HitDot[];
      const svg = buildSprayChartSvg(hits, 280, `spray-${i}`);
      return `<div class="ps"><h3>${name}</h3>${svg}</div>`;
    }).join("");
    content = `<h2>スプレーチャート</h2>${sections}`;

  } else if (analysis === "location") {
    const sections = players.map((name, i) => {
      const pitches = pitchingPitches.filter((p) => p.pitcher_name === name) as PitchDot[];
      const svg = buildLocationChartSvg(pitches, 280, `loc-${i}`);
      return `<div class="ps"><h3>${name}</h3>${svg}</div>`;
    }).join("");
    content = `<h2>投球コース分布</h2>${sections}`;
  }

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
  body{font-family:-apple-system,'Hiragino Sans',sans-serif;padding:24px;color:#111;}
  h1{font-size:22px;margin-bottom:4px;}
  .meta{font-size:13px;color:#666;margin-bottom:24px;}
  h2{font-size:17px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px;}
  h3{font-size:15px;margin:16px 0 8px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th{background:#f3f4f6;padding:8px 10px;text-align:center;border:1px solid #e5e7eb;white-space:nowrap;}
  td{padding:8px 10px;text-align:center;border:1px solid #e5e7eb;}
  td:first-child{text-align:left;white-space:nowrap;}
  th:first-child{text-align:left;}
  tr:nth-child(even){background:#f9fafb;}
  .hl{font-weight:bold;color:#2563eb;}
  .ps{margin-bottom:24px;}
  svg{display:block;}
</style>
</head><body>
<h1>分析レポート</h1>
<p class="meta">出力日: ${today}　分析: ${analysisLabel}　対象: ${players.join("、")}</p>
${content}
</body></html>`;
}

export default function ScoutScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const [step, setStep] = useState<Step>("player");
  const [searchText, setSearchText] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisType | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  // ── 全選手を初回ロード（手・チーム情報込み）──
  const { data: playerData, isFetching: loadingPlayers } = useQuery<{
    players: PlayerHit[];
    teamList: string[];
  }>({
    queryKey: ["scout_all_players_v2"],
    queryFn: async () => {
      const [{ data: batterData }, { data: pitcherData }, { data: gamesData }] = await Promise.all([
        // 1回に1000行までしか返らないので、全投球を範囲を変えて読む（選手の一覧が欠けないように）
        fetchAll((from, to) => supabase.from("pitches")
          .select("id, batter_name, batter_hand, top_bottom, games(away_team, home_team)")
          .not("batter_name", "is", null)
          .order("id")
          .range(from, to)).then(data => ({ data })),
        fetchAll((from, to) => supabase.from("pitches")
          .select("id, pitcher_name, pitcher_hand, top_bottom, games(away_team, home_team)")
          .not("pitcher_name", "is", null)
          .order("id")
          .range(from, to)).then(data => ({ data })),
        supabase.from("games").select("away_team, home_team"),
      ]);
      const map = new Map<string, PlayerHit>();

      for (const r of batterData ?? []) {
        if (!r.batter_name) continue;
        const e: PlayerHit = map.get(r.batter_name) ?? { name: r.batter_name, asBatter: false, asPitcher: false, batterHand: null, pitcherHand: null, offenseTeams: [] };
        e.asBatter = true;
        if (r.batter_hand && !e.batterHand) e.batterHand = r.batter_hand;
        // 打者チーム: 表=ビジター, 裏=ホーム
        if (r.top_bottom && r.games) {
          const g = r.games as unknown as { away_team: string | null; home_team: string | null };
          const team = r.top_bottom === "表" ? g.away_team : g.home_team;
          if (team && !e.offenseTeams.includes(team)) e.offenseTeams.push(team);
        }
        map.set(r.batter_name, e);
      }
      for (const r of pitcherData ?? []) {
        if (!r.pitcher_name) continue;
        const e: PlayerHit = map.get(r.pitcher_name) ?? { name: r.pitcher_name, asBatter: false, asPitcher: false, batterHand: null, pitcherHand: null, offenseTeams: [] };
        e.asPitcher = true;
        if (r.pitcher_hand && !e.pitcherHand) e.pitcherHand = r.pitcher_hand;
        // 投手チーム: 表=ホーム(守備), 裏=ビジター(守備)
        if (r.top_bottom && r.games) {
          const g = r.games as unknown as { away_team: string | null; home_team: string | null };
          const team = r.top_bottom === "表" ? g.home_team : g.away_team;
          if (team && !e.offenseTeams.includes(team)) e.offenseTeams.push(team);
        }
        map.set(r.pitcher_name, e);
      }
      const players = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));

      const teamSet = new Set<string>();
      for (const g of gamesData ?? []) {
        if (g.away_team) teamSet.add(g.away_team);
        if (g.home_team) teamSet.add(g.home_team);
      }
      const teamList = [...teamSet].sort((a, b) => a.localeCompare(b, "ja"));
      return { players, teamList };
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const allPlayers = playerData?.players;
  const teamList = playerData?.teamList ?? [];

  // ── フィルター状態 ──
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "batter" | "pitcher">("all");
  const [handFilter, setHandFilter] = useState<"all" | "右" | "左">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const activeFilterCount = [roleFilter !== "all", handFilter !== "all", teamFilter !== "all"].filter(Boolean).length;

  const trimmed = (searchText ?? "").trim();
  const displayPlayers = useMemo(() => {
    let list = allPlayers ?? [];
    if (trimmed) list = list.filter((p) => p.name.includes(trimmed));
    if (roleFilter === "batter") list = list.filter((p) => p.asBatter);
    else if (roleFilter === "pitcher") list = list.filter((p) => p.asPitcher);
    if (handFilter !== "all") {
      list = list.filter((p) => {
        if (roleFilter === "batter") return p.batterHand === handFilter;
        if (roleFilter === "pitcher") return p.pitcherHand === handFilter;
        return p.batterHand === handFilter || p.pitcherHand === handFilter;
      });
    }
    if (teamFilter !== "all") list = list.filter((p) => p.offenseTeams.includes(teamFilter));
    return list;
  }, [allPlayers, trimmed, roleFilter, handFilter, teamFilter]);

  // ── 結果データ (複数選手) ──
  const sortedPlayers = [...selectedPlayers].sort();
  const { data: battingPitches, isLoading: loadingBatting } = useQuery<PitchRow[]>({
    queryKey: ["scout_batting_multi", sortedPlayers],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("pitches")
        .select("id, batter_name, batter_order, pitcher_name, game_id, pa_complete, batting_result, pitch_type, pitch_speed, hit_x, hit_y, games(id, date, away_team, home_team)")
        .in("batter_name", selectedPlayers)
        .order("id")
        .range(from, to));
      return data as unknown as PitchRow[];
    },
    enabled: !!user && step === "result" && selectedPlayers.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pitchingPitches, isLoading: loadingPitching } = useQuery<PitchRow[]>({
    queryKey: ["scout_pitching_multi", sortedPlayers],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("pitches")
        .select("id, batter_name, batter_order, pitcher_name, game_id, pa_complete, batting_result, pitch_type, pitch_speed, course_x, course_y, games(id, date, away_team, home_team)")
        .in("pitcher_name", selectedPlayers)
        .order("id")
        .range(from, to));
      return data as unknown as PitchRow[];
    },
    enabled: !!user && step === "result" && selectedPlayers.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // ── 打撃成績 by player ──
  const battingByPlayer = useMemo(() => {
    const map = new Map<string, BatterStats>();
    for (const name of selectedPlayers) {
      const pitches = (battingPitches ?? []).filter((p) => p.batter_name === name);
      if (!pitches.length) continue;
      const s = emptyStats();
      for (const p of getPAResultPitches(pitches)) applyBattingResult(s, p.batting_result?.trim() ?? "");
      map.set(name, s);
    }
    return map;
  }, [battingPitches, selectedPlayers]);

  // ── 投球成績 by player ──
  const pitchingByPlayer = useMemo(() => {
    const map = new Map<string, PitchingStats>();
    for (const name of selectedPlayers) {
      const pitches = (pitchingPitches ?? []).filter((p) => p.pitcher_name === name);
      const stats = computePitchingStats(pitches);
      if (stats) map.set(name, stats);
    }
    return map;
  }, [pitchingPitches, selectedPlayers]);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 10) return prev;
      return [...prev, name];
    });
  };

  const handleExportPdf = async () => {
    if (!selectedAnalysis) return;
    setPdfLoading(true);
    try {
      const html = buildPdfHtml(
        selectedPlayers, selectedAnalysis,
        battingByPlayer, pitchingByPlayer,
        battingPitches ?? [], pitchingPitches ?? []
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch {
      Alert.alert("エラー", "PDF出力に失敗しました");
    } finally {
      setPdfLoading(false);
    }
  };

  if (!user) return <Redirect href="/login" />;

  const goBack = () => {
    if (step === "analysis") setStep("player");
    else if (step === "result") { setSelectedAnalysis(null); setStep("analysis"); }
  };

  const analysisLabel = ANALYSIS_OPTIONS.find((o) => o.type === selectedAnalysis)?.label ?? "";
  const isLoadingResult = loadingBatting || loadingPitching;

  const headerTitle =
    step === "player" ? "選手を選択"
    : step === "analysis" ? "分析内容を選択"
    : selectedPlayers.length === 1 ? selectedPlayers[0]
    : `${selectedPlayers.length}人を比較`;

  const headerSub =
    step === "analysis"
      ? selectedPlayers.length === 1 ? selectedPlayers[0] : `${selectedPlayers.length}人を選択中`
      : step === "result" ? analysisLabel
      : "";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ステップヘッダー */}
      <View style={[styles.stepHeader, { borderBottomColor: borderColor, backgroundColor: cardBg }]}>
        {step !== "player" && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.tint} />
          </TouchableOpacity>
        )}
        <View style={styles.stepHeaderText}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>{headerTitle}</Text>
          {!!headerSub && (
            <Text style={[styles.stepSub, { color: colors.icon }]}>{headerSub}</Text>
          )}
        </View>
      </View>

      {/* ── Step 1: 選手選択 ── */}
      {step === "player" && (
        <View style={styles.flex1}>
          {/* 絞り込みバー */}
          <View style={[styles.searchBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
            <Ionicons name="search" size={16} color={colors.icon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="絞り込み..."
              placeholderTextColor={colors.icon}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <TouchableOpacity onPress={() => setShowFilters((v) => !v)} style={styles.filterToggleBtn} hitSlop={8}>
              <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? colors.tint : colors.icon} />
              {activeFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: colors.tint }]}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* フィルターパネル */}
          {showFilters && (
            <View style={[styles.filterPanel, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
              {/* 役割 */}
              <View style={styles.filterRow}>
                <Text style={[styles.filterLabel, { color: colors.icon }]}>役割</Text>
                <View style={styles.filterOptions}>
                  {(["all", "batter", "pitcher"] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.filterChip, { borderColor: colors.tint }, roleFilter === v && { backgroundColor: colors.tint }]}
                      onPress={() => setRoleFilter(v)}
                    >
                      <Text style={[styles.filterChipText, { color: roleFilter === v ? "white" : colors.tint }]}>
                        {v === "all" ? "全員" : v === "batter" ? "打者" : "投手"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {/* 利き手 */}
              <View style={styles.filterRow}>
                <Text style={[styles.filterLabel, { color: colors.icon }]}>利き手</Text>
                <View style={styles.filterOptions}>
                  {(["all", "右", "左"] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.filterChip, { borderColor: colors.tint }, handFilter === v && { backgroundColor: colors.tint }]}
                      onPress={() => setHandFilter(v)}
                    >
                      <Text style={[styles.filterChipText, { color: handFilter === v ? "white" : colors.tint }]}>
                        {v === "all" ? "全て" : v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {/* チーム */}
              {teamList.length > 0 && (
                <View style={styles.filterRow}>
                  <Text style={[styles.filterLabel, { color: colors.icon }]}>チーム</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterOptions}>
                    {(["all", ...teamList]).map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.filterChip, { borderColor: colors.tint, marginRight: 6 }, teamFilter === v && { backgroundColor: colors.tint }]}
                        onPress={() => setTeamFilter(v)}
                      >
                        <Text style={[styles.filterChipText, { color: teamFilter === v ? "white" : colors.tint }]}>
                          {v === "all" ? "全チーム" : v}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* 選択済みチップ */}
          {selectedPlayers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.chipsScroll, { borderBottomColor: borderColor }]}
              contentContainerStyle={styles.chipsContent}
            >
              {selectedPlayers.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.chip, { backgroundColor: colors.tint + "20", borderColor: colors.tint }]}
                  onPress={() => togglePlayer(name)}
                >
                  <Text style={[styles.chipText, { color: colors.tint }]} numberOfLines={1}>{name}</Text>
                  <Ionicons name="close" size={13} color={colors.tint} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* 選手リスト */}
          {loadingPlayers && !allPlayers ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.tint} />
            </View>
          ) : displayPlayers.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.icon }}>該当する選手が見つかりません</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.flex1} contentContainerStyle={styles.listContent}>
              <View style={[styles.listCard, { backgroundColor: cardBg }]}>
                {displayPlayers.map((hit, i) => {
                  const isSelected = selectedPlayers.includes(hit.name);
                  return (
                    <TouchableOpacity
                      key={hit.name}
                      style={[
                        styles.listRow,
                        { borderBottomColor: borderColor },
                        i === displayPlayers.length - 1 && { borderBottomWidth: 0 },
                        isSelected && { backgroundColor: colors.tint + "10" },
                      ]}
                      onPress={() => togglePlayer(hit.name)}
                    >
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                        size={20}
                        color={isSelected ? colors.tint : colors.icon}
                      />
                      <View style={styles.listRowLeft}>
                        <Text style={[styles.listRowText, { color: colors.text }]}>{hit.name}</Text>
                        <Text style={[styles.listRowSub, { color: colors.icon }]}>
                          {[hit.asBatter && "打者", hit.asPitcher && "投手"].filter(Boolean).join(" / ")}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* 分析するボタン */}
          {selectedPlayers.length > 0 && (
            <TouchableOpacity
              style={[styles.analyzeBtn, { backgroundColor: colors.tint }]}
              onPress={() => setStep("analysis")}
            >
              <Text style={styles.analyzeBtnText}>分析する（{selectedPlayers.length}人）</Text>
              <Ionicons name="chevron-forward" size={16} color="white" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Step 2: 分析内容選択 ── */}
      {step === "analysis" && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {ANALYSIS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              style={[styles.analysisCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => { setSelectedAnalysis(opt.type); setStep("result"); }}
            >
              <View style={[styles.analysisIconBox, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name={opt.icon} size={26} color={colors.tint} />
              </View>
              <View style={styles.analysisTextBox}>
                <Text style={[styles.analysisLabel, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[styles.analysisDesc, { color: colors.icon }]}>{opt.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.icon} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Step 3: 結果表示 ── */}
      {step === "result" && (
        isLoadingResult ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : (
          <View style={styles.flex1}>
            <ScrollView contentContainerStyle={styles.listContent}>

              {/* 打撃成績 - 比較テーブル */}
              {selectedAnalysis === "batting" && (
                <View style={[styles.resultCard, { backgroundColor: cardBg, borderColor }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>打撃成績</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View>
                      <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: borderColor }]}>
                        {["選手名", "打席", "打数", "安打", "2塁", "3塁", "本塁", "四死", "三振", "打率"].map((col, j) => (
                          <Text key={col} style={[styles.tableCell, j === 0 ? styles.tableName : styles.tableData, { color: colors.icon }]}>
                            {col}
                          </Text>
                        ))}
                      </View>
                      {selectedPlayers.map((name, ri) => {
                        const s = battingByPlayer.get(name);
                        return (
                          <View
                            key={name}
                            style={[styles.tableRow, { borderBottomColor: borderColor, borderBottomWidth: ri < selectedPlayers.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                          >
                            <Text style={[styles.tableCell, styles.tableName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.pa ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.ab ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.hits ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.doubles || "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.triples || "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.hr || "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s ? (s.bb + s.hbp) || "—" : "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.k || "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.tint, fontWeight: "700" }]}>{s ? avg(s.hits, s.ab) : ".---"}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* 投球成績 - 比較テーブル */}
              {selectedAnalysis === "pitching" && (
                <View style={[styles.resultCard, { backgroundColor: cardBg, borderColor }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>投球成績</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View>
                      <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: borderColor }]}>
                        {["選手名", "球数", "対打者", "投球回", "奪三振", "与四死", "被安打", "被打率", "平均km", "最速km"].map((col, j) => (
                          <Text key={col} style={[styles.tableCell, j === 0 ? styles.tableName : styles.tableData, { color: colors.icon }]}>
                            {col}
                          </Text>
                        ))}
                      </View>
                      {selectedPlayers.map((name, ri) => {
                        const s = pitchingByPlayer.get(name);
                        return (
                          <View
                            key={name}
                            style={[styles.tableRow, { borderBottomColor: borderColor, borderBottomWidth: ri < selectedPlayers.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                          >
                            <Text style={[styles.tableCell, styles.tableName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.total ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.bf ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.ip ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.k ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s ? (s.bb + s.hbp) : "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.h ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.tint, fontWeight: "700" }]}>{s?.baa ?? ".---"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.avgSpeed ?? "—"}</Text>
                            <Text style={[styles.tableCell, styles.tableData, { color: colors.text }]}>{s?.maxSpeed ?? "—"}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  {/* 1人のみの場合は球種内訳を追加表示 */}
                  {selectedPlayers.length === 1 && (() => {
                    const s = pitchingByPlayer.get(selectedPlayers[0]);
                    return s && Object.keys(s.byType).length > 0 ? (
                      <PitchTypePieChart
                        byType={s.byType}
                        total={s.total}
                        textColor={colors.text}
                        subTextColor={colors.icon}
                        backgroundColor={cardBg}
                      />
                    ) : null;
                  })()}
                </View>
              )}

              {/* スプレーチャート - 選手ごとにカード */}
              {selectedAnalysis === "spray" && selectedPlayers.map((name) => {
                const playerPitches = (battingPitches ?? []).filter((p) => p.batter_name === name);
                const hasData = playerPitches.some((p) => p.hit_x != null && p.hit_y != null);
                return (
                  <View key={name} style={[styles.resultCard, { backgroundColor: cardBg, borderColor }]}>
                    {selectedPlayers.length > 1 && (
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{name}</Text>
                    )}
                    {hasData ? (
                      <SprayChart hits={playerPitches} textColor={colors.text} backgroundColor={cardBg} />
                    ) : (
                      <Text style={[styles.emptyInCard, { color: colors.icon }]}>打球データなし</Text>
                    )}
                  </View>
                );
              })}

              {/* 投球コース分布 - 選手ごとにカード */}
              {selectedAnalysis === "location" && selectedPlayers.map((name) => {
                const playerPitches = (pitchingPitches ?? []).filter((p) => p.pitcher_name === name);
                const hasData = playerPitches.some((p) => p.course_x != null && p.course_y != null);
                return (
                  <View key={name} style={[styles.resultCard, { backgroundColor: cardBg, borderColor }]}>
                    {selectedPlayers.length > 1 && (
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{name}</Text>
                    )}
                    {hasData ? (
                      <PitchLocationChart pitches={playerPitches as PitchDot[]} textColor={colors.text} subTextColor={colors.icon} backgroundColor={cardBg} />
                    ) : (
                      <Text style={[styles.emptyInCard, { color: colors.icon }]}>投球コースデータなし</Text>
                    )}
                  </View>
                );
              })}

            </ScrollView>

            {/* PDF出力ボタン */}
            <TouchableOpacity
              style={[styles.pdfBtn, { borderColor: colors.tint, backgroundColor: cardBg }]}
              onPress={handleExportPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <>
                  <Ionicons name="document-outline" size={16} color={colors.tint} />
                  <Text style={[styles.pdfBtnText, { color: colors.tint }]}>PDFで出力</Text>
                  <Ionicons name="share-outline" size={16} color={colors.tint} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  hintText: { fontSize: 14 },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 2 },
  stepHeaderText: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 17, fontWeight: "600" },
  stepSub: { fontSize: 13 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  chipsScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 52,
  },
  chipsContent: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "500", maxWidth: 100 },
  listContent: { padding: 16, gap: 10 },
  listCard: { borderRadius: 12, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  listRowLeft: { flex: 1, gap: 2 },
  listRowText: { fontSize: 16 },
  listRowSub: { fontSize: 12 },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    margin: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
  },
  analyzeBtnText: { color: "white", fontSize: 16, fontWeight: "600" },
  analysisCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  analysisIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  analysisTextBox: { flex: 1, gap: 3 },
  analysisLabel: { fontSize: 16, fontWeight: "600" },
  analysisDesc: { fontSize: 13 },
  resultCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  // 比較テーブル
  tableRow: { flexDirection: "row" },
  tableHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableCell: { paddingVertical: 9, paddingHorizontal: 4, fontSize: 13, textAlign: "center" },
  tableName: { width: 90, textAlign: "left", fontWeight: "500", paddingLeft: 0 },
  tableData: { width: 52 },
  emptyInCard: { textAlign: "center", paddingVertical: 20, fontSize: 14 },
  // フィルター
  filterToggleBtn: { padding: 4, position: "relative" },
  filterBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: { color: "white", fontSize: 9, fontWeight: "700" },
  filterPanel: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: "500", width: 42, flexShrink: 0 },
  filterOptions: { flexDirection: "row", gap: 6, flexShrink: 1 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: "500" },
  // PDF ボタン
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 16,
    marginTop: 0,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  pdfBtnText: { fontSize: 15, fontWeight: "600" },
});
