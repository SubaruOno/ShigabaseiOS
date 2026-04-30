import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { useState } from "react";
import { Redirect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { ContentCard } from "@/components/content-card";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

function VideoCardWithEdit({
  item,
  isAnalystOrAdmin,
  onEdit,
}: {
  item: any;
  isAnalystOrAdmin: boolean;
  onEdit: (item: any) => void;
}) {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const matchInfo =
    item.team1?.name && item.team2?.name
      ? `${item.team1.name} vs ${item.team2.name}`
      : item.team1?.name || item.team2?.name || "";

  return (
    <View>
      <ContentCard
        title={item.title}
        categoryName={item.categories?.name}
        playerName={matchInfo}
        createdAt={item.created_at ?? ""}
        type="video"
        onClick={() => Linking.openURL(item.youtube_url)}
      />
      {isAnalystOrAdmin && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)}>
            <Ionicons name="pencil-outline" size={15} color={colors.icon} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function FilterPicker({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onSelect: (val: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.id === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.picker, { borderColor: colors.icon, backgroundColor: colors.cardBg }]}
        onPress={() => setVisible(true)}
      >
        <Text style={[styles.pickerText, { color: colors.text }]} numberOfLines={1}>
          {selected?.name ?? label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.icon} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setVisible(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff", paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{label}</Text>
          <ScrollView>
            <TouchableOpacity
              style={[styles.modalItem, { borderBottomColor: colors.icon }]}
              onPress={() => { onSelect("all"); setVisible(false); }}
            >
              <Text style={[styles.modalItemText, { color: colors.text }]}>すべて</Text>
            </TouchableOpacity>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modalItem, { borderBottomColor: colors.icon }]}
                onPress={() => { onSelect(opt.id); setVisible(false); }}
              >
                <Text style={[styles.modalItemText, { color: colors.text }]}>{opt.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function EditPicker({
  label,
  value,
  options,
  onSelect,
  nullable,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onSelect: (val: string) => void;
  nullable?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.id === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.picker, { borderColor: colors.icon, backgroundColor: colors.cardBg }]}
        onPress={() => setVisible(true)}
      >
        <Text style={[styles.pickerText, { color: selected ? colors.text : colors.icon }]} numberOfLines={1}>
          {selected?.name ?? `${label}を選択`}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.icon} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setVisible(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff", paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{label}</Text>
          <ScrollView>
            {nullable && (
              <TouchableOpacity
                style={[styles.modalItem, { borderBottomColor: colors.icon }]}
                onPress={() => { onSelect(""); setVisible(false); }}
              >
                <Text style={[styles.modalItemText, { color: colors.icon }]}>選択なし</Text>
              </TouchableOpacity>
            )}
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modalItem, { borderBottomColor: colors.icon }]}
                onPress={() => { onSelect(opt.id); setVisible(false); }}
              >
                <Text style={[styles.modalItemText, { color: colors.text }]}>{opt.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export default function VideosScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [opponentFilter, setOpponentFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isAnalystOrAdmin = hasRole("analyst") || hasRole("admin");

  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTeam1, setEditTeam1] = useState("");
  const [editTeam2, setEditTeam2] = useState("");
  const [editYoutubeUrl, setEditYoutubeUrl] = useState("");

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["videos"] });
    setRefreshing(false);
  };

  const { data: categories } = useQuery({
    queryKey: ["video-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("page_type", "videos")
        .not("name", "in", "(打撃練習動画,ウェイトトレーニング,投手陣分析,打者分析)")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: opponents } = useQuery({
    queryKey: ["opponent_teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opponent_teams")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos", categoryFilter, opponentFilter, searchText],
    queryFn: async () => {
      let query = supabase
        .from("videos")
        .select(
          `id, title, youtube_url, category_id, team1_id, team2_id, uploaded_by, created_at,
          categories!inner(name, page_type),
          team1:opponent_teams!videos_team1_id_fkey(name),
          team2:opponent_teams!videos_team2_id_fkey(name)`
        )
        .eq("categories.page_type", "videos")
        .order("created_at", { ascending: false });

      if (categoryFilter !== "all")
        query = query.eq("category_id", categoryFilter);
      if (opponentFilter !== "all")
        query = query.or(`team1_id.eq.${opponentFilter},team2_id.eq.${opponentFilter}`);
      if (searchText.trim()) query = query.ilike("title", `%${searchText}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTitle.trim()) throw new Error("タイトルを入力してください");
      if (!editCategory) throw new Error("カテゴリを選択してください");
      if (!editYoutubeUrl.trim()) throw new Error("YouTube URLを入力してください");
      if (!editYoutubeUrl.includes("youtube.com") && !editYoutubeUrl.includes("youtu.be"))
        throw new Error("YouTubeのURLを入力してください");
      const { error } = await supabase
        .from("videos")
        .update({
          title: editTitle.trim(),
          category_id: editCategory,
          team1_id: editTeam1 || null,
          team2_id: editTeam2 || null,
          youtube_url: editYoutubeUrl.trim(),
        })
        .eq("id", editingVideo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert("更新しました");
      setEditingVideo(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (video: any) => {
      const { error } = await supabase.from("videos").delete().eq("id", video.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingVideo(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  function openEdit(video: any) {
    setEditingVideo(video);
    setEditTitle(video.title);
    setEditCategory(video.category_id || "");
    setEditTeam1(video.team1_id || "");
    setEditTeam2(video.team2_id || "");
    setEditYoutubeUrl(video.youtube_url || "");
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

      <View style={styles.filters}>
        <View style={styles.filterItem}>
          <FilterPicker
            label="カテゴリ"
            value={categoryFilter}
            options={categories?.map((c: any) => ({ id: c.id, name: c.name })) ?? []}
            onSelect={setCategoryFilter}
          />
        </View>
        <View style={styles.filterItem}>
          <FilterPicker
            label="対戦カード"
            value={opponentFilter}
            options={opponents?.map((o: any) => ({ id: o.id, name: o.name })) ?? []}
            onSelect={setOpponentFilter}
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <VideoCardWithEdit
              item={item}
              isAnalystOrAdmin={isAnalystOrAdmin}
              onEdit={openEdit}
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.icon }]}>
              動画がまだ登録されていません
            </Text>
          }
        />
      )}

      {/* 編集モーダル */}
      <Modal visible={!!editingVideo} animationType="slide">
        <View style={[styles.editModalContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.editModalHeader, { borderBottomColor: colors.borderColor }]}>
            <TouchableOpacity onPress={() => setEditingVideo(null)}>
              <Text style={[styles.editModalAction, { color: colors.tint }]}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={[styles.editModalTitle, { color: colors.text }]}>動画を編集</Text>
            <TouchableOpacity onPress={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.editModalAction, { color: colors.tint, fontWeight: "600" }]}>保存</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.editModalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: colors.text }]}>
                タイトル <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.editInput, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.cardBg }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="タイトルを入力"
                placeholderTextColor={colors.icon}
                maxLength={200}
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: colors.text }]}>
                カテゴリ <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <EditPicker
                label="カテゴリ"
                value={editCategory}
                options={categories?.map((c: any) => ({ id: c.id, name: c.name })) ?? []}
                onSelect={setEditCategory}
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: colors.text }]}>対戦カード：チーム1（任意）</Text>
              <EditPicker
                label="チーム1"
                value={editTeam1}
                options={opponents?.map((o: any) => ({ id: o.id, name: o.name })) ?? []}
                onSelect={setEditTeam1}
                nullable
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: colors.text }]}>対戦カード：チーム2（任意）</Text>
              <EditPicker
                label="チーム2"
                value={editTeam2}
                options={opponents?.map((o: any) => ({ id: o.id, name: o.name })) ?? []}
                onSelect={setEditTeam2}
                nullable
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: colors.text }]}>
                YouTube URL <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.editInput, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.cardBg }]}
                value={editYoutubeUrl}
                onChangeText={setEditYoutubeUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                placeholderTextColor={colors.icon}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() =>
                Alert.alert(
                  "動画を削除",
                  `「${editingVideo?.title}」を削除しますか？この操作は元に戻せません。`,
                  [
                    { text: "キャンセル", style: "cancel" },
                    { text: "削除", style: "destructive", onPress: () => deleteMutation.mutate(editingVideo) },
                  ]
                )
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={styles.deleteBtnText}>この動画を削除</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  filters: { flexDirection: "row", padding: 12, gap: 8 },
  filterItem: { flex: 1 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pickerText: { fontSize: 13, flex: 1 },
  list: { padding: 12, paddingTop: 0 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
  actionButtons: {
    position: "absolute",
    bottom: 10,
    right: 10,
  },
  actionBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  modalSheet: {
    maxHeight: "50%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  modalItemText: { fontSize: 15 },
  editModalContainer: { flex: 1 },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editModalTitle: { fontSize: 16, fontWeight: "600" },
  editModalAction: { fontSize: 15 },
  editModalContent: { padding: 16, gap: 16 },
  editField: { gap: 6 },
  editLabel: { fontSize: 13, fontWeight: "500" },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 8,
  },
  deleteBtnText: { color: "#ef4444", fontSize: 15, fontWeight: "500" },
});
