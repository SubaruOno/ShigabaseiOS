import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { Redirect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type InviteCode = {
  id: string;
  code: string;
  player_name: string;
  uniform_number: number | null;
  role: "player" | "admin" | "analyst";
  used: boolean;
  created_at: string;
  expires_at: string;
};

type Player = {
  id: string;
  name: string;
  excel_name: string | null;
  display_order: number | null;
};

type TabType = "player" | "staff";
type StaffRole = "admin" | "analyst";
type PlayerMode = "existing" | "new";

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function isExpired(expiresAt: string) {
  return new Date(expiresAt) < new Date();
}

function roleLabel(role: "player" | "admin" | "analyst") {
  if (role === "admin") return "[監督]";
  if (role === "analyst") return "[アナリスト]";
  return null;
}

function codeDisplayName(c: InviteCode) {
  const label = roleLabel(c.role);
  if (label) return `${c.player_name}　${label}`;
  return `${c.player_name}　#${c.uniform_number}`;
}

export default function AdminInviteScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
    await queryClient.invalidateQueries({ queryKey: ["players_list"] });
    setRefreshing(false);
  };

  const [activeTab, setActiveTab] = useState<TabType>("player");
  const [playerMode, setPlayerMode] = useState<PlayerMode>("existing");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExcelName, setNewExcelName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("admin");

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  const { data: players, isLoading: loadingPlayers, error: playersError } = useQuery<Player[]>({
    queryKey: ["players_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, excel_name, display_order")
        .order("display_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: codes, isLoading } = useQuery<InviteCode[]>({
    queryKey: ["invite_codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      let body: Record<string, unknown>;

      if (activeTab === "player" && playerMode === "new") {
        if (!newName.trim()) throw new Error("選手名を入力してください");
        const { data: newPlayer, error: insertError } = await supabase
          .from("players")
          .insert({
            name: newName.trim(),
            excel_name: newExcelName.trim() || null,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        body = { playerId: newPlayer.id };
      } else if (activeTab === "player") {
        body = { playerId: selectedPlayer!.id };
      } else {
        body = { staffName: staffName.trim(), role: staffRole };
      }

      const { data, error } = await supabase.functions.invoke("generate-invite-code", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { code: string; expiresAt: string };
    },
    onSuccess: (data) => {
      setSelectedPlayer(null);
      setNewName("");
      setNewExcelName("");
      setStaffName("");
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      queryClient.invalidateQueries({ queryKey: ["players_list"] });
      Alert.alert(
        "招待コード発行完了",
        `コード: ${data.code}\n\n共有してください。`,
        [
          { text: "閉じる", style: "cancel" },
          {
            text: "共有",
            onPress: () =>
              Share.share({
                message: `SHIGABASEへの招待コード\n\nコード: ${data.code}\n\nアプリを開いて「招待コードをお持ちの方はこちら」から登録してください。`,
              }),
          },
        ]
      );
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invite_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invite_codes"] }),
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const confirmDelete = (code: InviteCode) => {
    Alert.alert(
      "削除確認",
      `${codeDisplayName(code)} の招待コードを削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: () => deleteMutation.mutate(code.id) },
      ]
    );
  };

  if (!user || !hasRole("admin")) return <Redirect href="/(tabs)" />;

  const activeCodes = codes?.filter((c) => !c.used && !isExpired(c.expires_at)) ?? [];
  const usedOrExpiredCodes = codes?.filter((c) => c.used || isExpired(c.expires_at)) ?? [];

  const selectedDisplayName = selectedPlayer
    ? (selectedPlayer.excel_name ?? selectedPlayer.name)
    : null;

  const isGenerateDisabled =
    generateMutation.isPending ||
    (activeTab === "player"
      ? playerMode === "new" ? !newName.trim() : !selectedPlayer
      : !staffName.trim());

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 招待コード発行フォーム */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>招待コードを発行</Text>

          {/* タブ切り替え */}
          <View style={[styles.tabRow, { borderColor }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "player" && { backgroundColor: colors.tint },
              ]}
              onPress={() => setActiveTab("player")}
            >
              <Text style={[styles.tabText, { color: activeTab === "player" ? "#fff" : colors.icon }]}>
                選手
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "staff" && { backgroundColor: colors.tint },
              ]}
              onPress={() => setActiveTab("staff")}
            >
              <Text style={[styles.tabText, { color: activeTab === "staff" ? "#fff" : colors.icon }]}>
                スタッフ
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "player" ? (
            <View style={{ gap: 10 }}>
              {/* 既存/新規 切り替え */}
              <View style={[styles.segmentRow, { borderColor }]}>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    playerMode === "existing" && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setPlayerMode("existing")}
                >
                  <Text style={[styles.segmentText, { color: playerMode === "existing" ? "#fff" : colors.icon }]}>
                    既存の選手
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    playerMode === "new" && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setPlayerMode("new")}
                >
                  <Text style={[styles.segmentText, { color: playerMode === "new" ? "#fff" : colors.icon }]}>
                    新規選手を追加
                  </Text>
                </TouchableOpacity>
              </View>

              {playerMode === "existing" ? (
                <TouchableOpacity
                  style={[styles.playerSelect, { borderColor, backgroundColor: colors.background }]}
                  onPress={() => setPickerVisible(true)}
                >
                  {selectedPlayer ? (
                    <Text style={[styles.playerSelectText, { color: colors.text }]}>
                      {selectedDisplayName}
                    </Text>
                  ) : (
                    <Text style={[styles.playerSelectPlaceholder, { color: colors.icon }]}>
                      選手を選択してください
                    </Text>
                  )}
                  <Ionicons name="chevron-down" size={18} color={colors.icon} />
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={[styles.textInput, { borderColor, color: colors.text, backgroundColor: colors.background }]}
                    placeholder="選手名（漢字）*"
                    placeholderTextColor={colors.icon}
                    value={newName}
                    onChangeText={setNewName}
                  />
                  <TextInput
                    style={[styles.textInput, { borderColor, color: colors.text, backgroundColor: colors.background }]}
                    placeholder="Excel名（カナ）任意"
                    placeholderTextColor={colors.icon}
                    value={newExcelName}
                    onChangeText={setNewExcelName}
                  />
                </View>
              )}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput
                style={[styles.textInput, { borderColor, color: colors.text, backgroundColor: colors.background }]}
                placeholder="表示名を入力"
                placeholderTextColor={colors.icon}
                value={staffName}
                onChangeText={setStaffName}
              />
              <View style={[styles.segmentRow, { borderColor }]}>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    staffRole === "admin" && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setStaffRole("admin")}
                >
                  <Text style={[styles.segmentText, { color: staffRole === "admin" ? "#fff" : colors.icon }]}>
                    監督
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    staffRole === "analyst" && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setStaffRole("analyst")}
                >
                  <Text style={[styles.segmentText, { color: staffRole === "analyst" ? "#fff" : colors.icon }]}>
                    アナリスト
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.generateBtn,
              { backgroundColor: colors.tint },
              isGenerateDisabled && { opacity: 0.5 },
            ]}
            onPress={() => generateMutation.mutate()}
            disabled={isGenerateDisabled}
          >
            {generateMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.generateBtnText}>コードを発行</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 有効なコード一覧 */}
        {isLoading ? (
          <ActivityIndicator color={colors.tint} style={{ marginTop: 24 }} />
        ) : (
          <>
            {activeCodes.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  有効なコード（{activeCodes.length}）
                </Text>
                {activeCodes.map((c, i) => (
                  <View
                    key={c.id}
                    style={[
                      styles.codeRow,
                      { borderTopColor: borderColor },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <View style={styles.codeLeft}>
                      <Text style={[styles.codeBadge, { color: colors.tint, backgroundColor: colors.tint + "15" }]}>
                        {c.code}
                      </Text>
                      <View style={styles.codeInfo}>
                        <Text style={[styles.codeName, { color: colors.text }]}>
                          {codeDisplayName(c)}
                        </Text>
                        <Text style={[styles.codeExpiry, { color: colors.icon }]}>
                          期限: {formatDate(c.expires_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.codeActions}>
                      <TouchableOpacity
                        onPress={() =>
                          Share.share({
                            message: `SHIGABASEへの招待コード\n\nコード: ${c.code}\n\nアプリを開いて「招待コードをお持ちの方はこちら」から登録してください。`,
                          })
                        }
                        hitSlop={8}
                      >
                        <Ionicons name="share-outline" size={20} color={colors.tint} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDelete(c)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {usedOrExpiredCodes.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: colors.icon }]}>
                  使用済み / 期限切れ（{usedOrExpiredCodes.length}）
                </Text>
                {usedOrExpiredCodes.map((c, i) => (
                  <View
                    key={c.id}
                    style={[
                      styles.codeRow,
                      { borderTopColor: borderColor },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                      { opacity: 0.5 },
                    ]}
                  >
                    <View style={styles.codeLeft}>
                      <Text style={[styles.codeBadge, { color: colors.icon, backgroundColor: colors.icon + "15" }]}>
                        {c.code}
                      </Text>
                      <View style={styles.codeInfo}>
                        <Text style={[styles.codeName, { color: colors.text }]}>
                          {codeDisplayName(c)}
                        </Text>
                        <Text style={[styles.codeExpiry, { color: colors.icon }]}>
                          {c.used ? "使用済み" : "期限切れ"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => confirmDelete(c)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={colors.icon} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {(codes?.length ?? 0) === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="ticket-outline" size={40} color={colors.icon} />
                <Text style={[styles.emptyText, { color: colors.icon }]}>
                  招待コードはまだありません
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 選手選択モーダル */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: cardBg, paddingBottom: insets.bottom }]}>
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>選手を選択</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList} bounces={false}>
              {loadingPlayers ? (
                <ActivityIndicator color={colors.tint} style={{ marginTop: 32 }} />
              ) : playersError ? (
                <Text style={[styles.emptyText, { color: "#ef4444", padding: 20, textAlign: "center" }]}>
                  {(playersError as Error).message}
                </Text>
              ) : (players ?? []).length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.icon, padding: 20, textAlign: "center" }]}>
                  選手データがありません
                </Text>
              ) : (
                (players ?? []).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.playerRow,
                      { borderBottomColor: borderColor },
                      selectedPlayer?.id === p.id && { backgroundColor: colors.tint + "15" },
                    ]}
                    onPress={() => { setSelectedPlayer(p); setPickerVisible(false); }}
                  >
                    <Text style={[styles.playerName, { color: colors.text }]}>
                      {p.excel_name ?? p.name}
                    </Text>
                    {selectedPlayer?.id === p.id && (
                      <Ionicons name="checkmark" size={18} color={colors.tint} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  tabRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  segmentRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  segmentText: { fontSize: 14, fontWeight: "600" },
  playerSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  playerSelectText: { fontSize: 15, fontWeight: "500" },
  playerSelectPlaceholder: { fontSize: 15 },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    borderRadius: 8,
  },
  generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    gap: 8,
  },
  codeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  codeBadge: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeInfo: { gap: 2 },
  codeName: { fontSize: 14, fontWeight: "500" },
  codeExpiry: { fontSize: 12 },
  codeActions: { flexDirection: "row", gap: 14 },
  emptyBox: { alignItems: "center", paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: "65%",
  },
  modalList: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 16, fontWeight: "600" },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playerNum: { fontSize: 13, width: 36 },
  playerName: { fontSize: 15, flex: 1 },
});
