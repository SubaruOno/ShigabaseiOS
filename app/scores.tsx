import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Redirect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { ContentCard } from "@/components/content-card";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type Tab = "batting" | "weight" | "fielding" | "pitching";

const TABS: { key: Tab; label: string }[] = [
  { key: "batting", label: "打撃練習" },
  { key: "weight", label: "ウェイト" },
  { key: "fielding", label: "守備練習" },
  { key: "pitching", label: "投手記録" },
];

export default function ScoresScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("batting");
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["scores-videos"] });
    await queryClient.invalidateQueries({ queryKey: ["weight-documents"] });
    setRefreshing(false);
  };

  const { data: scoresVideos, isLoading: loadingScoresVideos } = useQuery({
    queryKey: ["scores-videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(
          `id, title, youtube_url, category_id, team1_id, team2_id, uploaded_by, created_at,
          categories!inner(name, page_type),
          team1:opponent_teams!videos_team1_id_fkey(name),
          team2:opponent_teams!videos_team2_id_fkey(name)`
        )
        .eq("categories.page_type", "scores")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const battingVideos = scoresVideos?.filter((v) =>
    v.categories?.name?.includes("打撃")
  );
  const fieldingVideos = scoresVideos?.filter((v) =>
    v.categories?.name?.includes("守備")
  );
  const pitchingVideos = scoresVideos?.filter((v) =>
    v.categories?.name?.includes("投手")
  );

  const { data: weightDocuments, isLoading: loadingWeight } = useQuery({
    queryKey: ["weight-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          `id, title, file_url, category_id, team1_id, team2_id, uploaded_by, created_at,
          categories!inner(name, page_type),
          players(name),
          team1:opponent_teams!documents_team1_id_fkey(name)`
        )
        .eq("categories.page_type", "scores")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  if (!user) return <Redirect href="/login" />;

  const isLoading =
    activeTab === "weight" ? loadingWeight : loadingScoresVideos;

  const rawData =
    activeTab === "batting"
      ? battingVideos
      : activeTab === "fielding"
      ? fieldingVideos
      : activeTab === "pitching"
      ? pitchingVideos
      : weightDocuments;

  const data = searchText.trim()
    ? rawData?.filter((item) =>
        item.title?.toLowerCase().includes(searchText.toLowerCase())
      )
    : rawData;

  const emptyMessage =
    activeTab === "batting"
      ? "打撃練習動画がまだ登録されていません"
      : activeTab === "fielding"
      ? "守備練習動画がまだ登録されていません"
      : activeTab === "pitching"
      ? "投手記録動画がまだ登録されていません"
      : "ウェイトトレーニング記録がまだ登録されていません";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.tabBar,
          {
            borderBottomColor:
              colorScheme === "dark" ? "#38383a" : "#e5e7eb",
          },
        ]}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && {
                borderBottomColor: colors.tint,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === tab.key ? colors.tint : colors.icon,
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.searchRow, { borderColor: colors.icon, backgroundColor: colors.cardBg }]}>
        <Ionicons name="search" size={18} color={colors.icon} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="タイトルで検索"
          placeholderTextColor={colors.icon}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 12 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => {
            const isVideo = activeTab !== "weight";
            const matchInfo =
              item.team1?.name && item.team2?.name
                ? `${item.team1.name} vs ${item.team2.name}`
                : item.team1?.name || item.players?.name || "";
            return (
              <ContentCard
                title={item.title}
                categoryName={item.categories?.name}
                playerName={matchInfo}
                createdAt={item.created_at ?? ""}
                type={isVideo ? "video" : "document"}
                onClick={() =>
                  Linking.openURL(isVideo ? item.youtube_url : item.file_url)
                }
              />
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.icon }]}>
              {emptyMessage}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "500" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, height: 40, fontSize: 14 },
  list: { padding: 12 },
  // paddingBottom applied dynamically via insets
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
});
