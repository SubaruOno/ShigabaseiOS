import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from "react-native";
import { router, Redirect } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { EmptyState } from "@/components/empty-state";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// クライアント側で抽出する列インデックス（元の Excel 列番号）
// Edge Function 側の compact column mapping と対応
const COMPACT_COLS = [
  0, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  21, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 54, 56, 181, 182,
] as const;

const EXCLUDED_SHEETS = new Set([
  "出場選手", "Sheet1", "データ概要", "作戦分析_攻撃", "投手個人成績",
]);

// compact[7]=play_number, compact[8]=inning, compact[10]=先攻累積, compact[11]=後攻累積
function computeLinescoreFromRows(rows: any[][]): Array<{
  game_date: string;
  game_number: number;
  away_runs: number[];
  home_runs: number[];
}> {
  // play_number が 1 にリセットされる箇所でゲームを分割
  const games: any[][][] = [];
  let current: any[][] = [];
  for (const row of rows) {
    if (row[7] === 1 && current.length > 0) {
      games.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) games.push(current);

  return games.map((gameRows) => {
    const firstRow = gameRows[0];
    const awayInningRuns: Record<number, number> = {};
    const homeInningRuns: Record<number, number> = {};

    for (let i = 0; i < gameRows.length - 1; i++) {
      const curr = gameRows[i];
      const next = gameRows[i + 1];
      const inning = curr[8] as number;
      const awayDelta = ((next[10] as number) ?? 0) - ((curr[10] as number) ?? 0);
      const homeDelta = ((next[11] as number) ?? 0) - ((curr[11] as number) ?? 0);
      if (awayDelta > 0 && inning != null) {
        awayInningRuns[inning] = (awayInningRuns[inning] ?? 0) + awayDelta;
      }
      if (homeDelta > 0 && inning != null) {
        homeInningRuns[inning] = (homeInningRuns[inning] ?? 0) + homeDelta;
      }
    }

    const keys = [
      ...Object.keys(awayInningRuns),
      ...Object.keys(homeInningRuns),
    ].map(Number);
    const maxInning = keys.length > 0 ? Math.max(...keys, 9) : 9;
    const away_runs = Array.from({ length: maxInning }, (_, i) => awayInningRuns[i + 1] ?? 0);
    const home_runs = Array.from({ length: maxInning }, (_, i) => homeInningRuns[i + 1] ?? 0);

    const dateVal = firstRow[0];
    const game_date = dateVal instanceof Date
      ? `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, "0")}-${String(dateVal.getDate()).padStart(2, "0")}`
      : String(dateVal).slice(0, 10);
    const game_number = firstRow[4] as number;

    return { game_date, game_number, away_runs, home_runs };
  });
}

type Game = {
  id: string;
  date: string | null;
  season: string | null;
  kind: string | null;
  away_team: string | null;
  home_team: string | null;
  away_score: number | null;
  home_score: number | null;
};


export default function GameAnalysisScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isAdmin = hasRole("admin") || hasRole("analyst");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const { data: games, isLoading, isError } = useQuery<Game[]>({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id, date, season, kind, away_team, home_team, away_score, home_score")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ゲームデータから年リストを生成（降順）
  const years = useMemo(() => {
    if (!games) return [];
    const set = new Set<number>();
    for (const g of games) {
      if (g.date) set.add(new Date(g.date).getFullYear());
    }
    return [...set].sort((a, b) => b - a);
  }, [games]);

  const filteredGames = useMemo(() => {
    if (!games) return [];
    let result = games;
    if (yearFilter) {
      result = result.filter(
        (g) => g.date && new Date(g.date).getFullYear() === yearFilter
      );
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (g) =>
          (g.away_team ?? "").toLowerCase().includes(q) ||
          (g.home_team ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [games, yearFilter, searchText]);

  const importMutation = useMutation({
    mutationFn: async (file: DocumentPicker.DocumentPickerAsset) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("未ログイン状態です");

      // ── ① ファイルを Uint8Array として読み込む ──
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: "base64",
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // ── ② Excel をクライアント側でパース (Edge Function の CPU 制限を回避) ──
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });

      // ── ③ play_number (col 9) を持つデータ行を含むシートを探す ──
      // 除外シートを飛ばしつつ、実際に投球データ行が最も多いシートを選択
      let bestSheet = "";
      let rows: any[][] = [];

      for (const name of workbook.SheetNames) {
        if (EXCLUDED_SHEETS.has(name)) continue;
        const s = workbook.Sheets[name];
        if (!s) continue; // チャートシート等
        const ref = s["!ref"];
        if (!ref) continue;
        const allRows: any[][] = XLSX.utils.sheet_to_json(s, { header: 1 });
        if (allRows.length < 3) continue;
        const dataRows = allRows
          .slice(2)
          .filter((r) => r[9])
          .map((r) => COMPACT_COLS.map((i) => r[i] ?? null));
        if (dataRows.length > rows.length) {
          bestSheet = name;
          rows = dataRows;
        }
      }

      if (rows.length === 0) {
        throw new Error(
          "投球データが見つかりません。\n" +
          "このファイルは試合一覧や集計ファイルの可能性があります。\n" +
          "1球ごとの投球記録が入った個別試合ファイルを選択してください。"
        );
      }

      // ── ④ イニング別得点を事前計算 ──
      const linescoreUpdates = computeLinescoreFromRows(rows);

      // ── ⑤ Edge Function へ送信（DB 挿入のみ担当） ──
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/import-game-excel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file_name: file.name, rows }),
        }
      );
      const text = await response.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("サーバーエラーが発生しました（タイムアウトまたは空レスポンス）");
      }
      if (!response.ok) throw new Error(result.error ?? "取り込みに失敗しました");

      // ── ⑥ イニングスコアを DB に保存 ──
      if (linescoreUpdates.length > 0) {
        const lsPayload = {
          updates: linescoreUpdates.map((u) => ({
            game_date: u.game_date,
            game_number: u.game_number ?? null,
            away_runs: u.away_runs,
            home_runs: u.home_runs,
          })),
        };
        const res = await fetch(`${SUPABASE_URL}/functions/v1/update-linescore`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(lsPayload),
        });
        const lsText = await res.text();
        if (!res.ok) {
          Alert.alert(
            "イニングスコア更新エラー",
            "試合データの取り込みは完了しましたが、イニング別スコアの更新に失敗しました。試合詳細画面から手動で編集できます。"
          );
        } else {
          const lsResult = JSON.parse(lsText);
          if (lsResult.updated === 0) {
            Alert.alert(
              "イニングスコア更新スキップ",
              "試合データの取り込みは完了しましたが、対応する試合が見つからずイニング別スコアを設定できませんでした。試合詳細画面から手動で編集できます。"
            );
          }
        }
      }

      return result as { inserted_games: number; skipped_games: number; pitches_count: number };
    },
    onSuccess: (data) => {
      const msg = data.skipped_games > 0
        ? `${data.inserted_games}試合・${data.pitches_count}球を取り込みました（${data.skipped_games}試合は登録済みのためスキップ）`
        : `${data.inserted_games}試合・${data.pitches_count}球を取り込みました`;
      Alert.alert("完了", msg);
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["game"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("未ログイン状態です");

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/delete-game`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ game_id: gameId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "削除に失敗しました");
    },
    onSuccess: () => {
      Alert.alert("完了", "試合データを削除しました");
      queryClient.invalidateQueries({ queryKey: ["games"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const confirmDelete = (game: Game) => {
    const label = `${formatDate(game.date)} ${game.away_team ?? "?"} vs ${game.home_team ?? "?"}`;
    Alert.alert(
      "試合データを削除",
      `${label}\n\nこの試合の全投球データも削除されます。元に戻せません。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: () => deleteMutation.mutate(game.id),
        },
      ]
    );
  };

  const pickAndImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
      ],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      importMutation.mutate(result.assets[0]);
    }
  };

  useLayoutEffect(() => {
    if (!isAdmin) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={pickAndImport}
          hitSlop={8}
          style={{ marginRight: 4 }}
          disabled={importMutation.isPending}
        >
          <Ionicons
            name="cloud-upload-outline"
            size={24}
            color={importMutation.isPending ? "#999" : "#0a7ea4"}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isAdmin, importMutation.isPending]);

  if (!user) return <Redirect href="/login" />;


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {importMutation.isPending && (
        <View style={styles.importingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.importingText}>データを取り込み中...</Text>
        </View>
      )}

      {/* 年度フィルター */}
      {years.length > 1 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              !yearFilter && { backgroundColor: colors.tint },
            ]}
            onPress={() => setYearFilter(null)}
          >
            <Text
              style={[
                styles.filterBtnText,
                { color: !yearFilter ? "#fff" : colors.text },
              ]}
            >
              全
            </Text>
          </TouchableOpacity>
          {years.map((y) => (
            <TouchableOpacity
              key={y}
              style={[
                styles.filterBtn,
                yearFilter === y && { backgroundColor: colors.tint },
              ]}
              onPress={() => setYearFilter(y)}
            >
              <Text
                style={[
                  styles.filterBtnText,
                  { color: yearFilter === y ? "#fff" : colors.text },
                ]}
              >
                {y}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 検索バー */}
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor:
              colorScheme === "dark" ? "#2c2c2e" : "#f0f0f0",
            borderColor: colors.borderColor,
          },
        ]}
      >
        <Ionicons name="search" size={16} color={colors.icon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="チーム名で検索..."
          placeholderTextColor={colors.icon}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.icon} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={40} color={colors.icon} />
          <Text style={[styles.emptyText, { color: colors.icon }]}>読み込みに失敗しました</Text>
          <TouchableOpacity onPress={() => queryClient.invalidateQueries({ queryKey: ["games"] })} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.tint, fontSize: 14 }}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredGames}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            filteredGames.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() =>
                queryClient.invalidateQueries({ queryKey: ["games"] })
              }
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
              onPress={() =>
                router.push(`/game-analysis/${item.id}` as any)
              }
              onLongPress={() => isAdmin && confirmDelete(item)}
              delayLongPress={600}
              activeOpacity={0.7}
            >
              <Text style={[styles.metaText, { color: colors.icon }]}>
                {formatDate(item.date)}
                {item.season ? `　${item.season}` : ""}
                {item.kind ? `　${item.kind}` : ""}
              </Text>
              <View style={styles.scoreRow}>
                <Text
                  style={[styles.teamText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.away_team ?? "—"}
                </Text>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: colors.tint + "20" },
                  ]}
                >
                  <Text style={[styles.scoreText, { color: colors.tint }]}>
                    {item.away_score ?? "—"} - {item.home_score ?? "—"}
                  </Text>
                </View>
                <Text
                  style={[styles.teamText, { color: colors.text, textAlign: "right" }]}
                  numberOfLines={1}
                >
                  {item.home_team ?? "—"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.icon}
                style={styles.chevron}
              />
            </TouchableOpacity>
          )}
          ListFooterComponent={
            isAdmin && filteredGames.length > 0 ? (
              <Text style={[styles.footerHint, { color: colors.icon }]}>
                長押しで試合データを削除
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="baseball-outline"
              title="試合データがありません"
              subtitle={isAdmin ? "右上のアイコンからExcelを取り込んでください" : undefined}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  filterBtnText: { fontSize: 13, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  importingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0a7ea4",
    paddingVertical: 10,
  },
  importingText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  metaText: { fontSize: 12 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamText: { fontSize: 15, fontWeight: "600", flex: 1 },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreText: { fontSize: 16, fontWeight: "700" },
  chevron: { position: "absolute", right: 14, bottom: 18 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingTop: 80,
  },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  footerHint: { fontSize: 12, textAlign: "center", paddingVertical: 12, opacity: 0.5 },
});
