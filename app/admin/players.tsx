import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { useState } from "react";
import { Redirect, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

type AppRole = "player" | "analyst" | "admin" | "ob";
type Tab = "players" | "roles" | "teams";

const ROLE_LABELS: Record<AppRole, string> = {
  player: "選手",
  analyst: "アナリスト",
  admin: "管理者",
  ob: "OB",
};

const ALL_ROLES: AppRole[] = ["player", "analyst", "admin", "ob"];

export default function AdminPlayersScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<Tab>("players");

  // Tab1: 選手管理 state
  const [displayName, setDisplayName] = useState("");
  const [uniformNumber, setUniformNumber] = useState("");
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [bulkResults, setBulkResults] = useState<{
    totalPlayers: number;
    successCount: number;
    failCount: number;
    results: { player: string; uniformNumber: number; success: boolean; email?: string; temporaryPassword?: string; error?: string }[];
  } | null>(null);

  // Tab2: ロール管理 state
  const [roleModalUserId, setRoleModalUserId] = useState<string | null>(null);

  // Tab3: 対戦チーム state
  const [teamName, setTeamName] = useState("");
  const [teamDisplayOrder, setTeamDisplayOrder] = useState("");

  // --- Queries ---
  const { data: usersWithRoles, isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users_with_roles"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, uniform_number");
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      return profiles.map((profile) => ({
        ...profile,
        roles: roles
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role as AppRole),
      }));
    },
    enabled: !!user && activeTab === "roles",
    staleTime: 5 * 60 * 1000,
  });

  const { data: opponentTeams, isLoading: teamsLoading } = useQuery({
    queryKey: ["admin_opponent_teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opponent_teams")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && activeTab === "teams",
    staleTime: 5 * 60 * 1000,
  });

  // --- Mutations ---
  const createPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!displayName.trim()) throw new Error("選手名を入力してください");
      if (!uniformNumber.trim()) throw new Error("背番号を入力してください");
      const num = parseInt(uniformNumber);
      if (isNaN(num) || num < 0 || num > 99)
        throw new Error("背番号は0〜99の数字を入力してください");

      const { data, error } = await supabase.functions.invoke(
        "create-player-account",
        { body: { displayName: displayName.trim(), uniformNumber: num } }
      );
      if (error) throw error;
      return data as { email: string; temporaryPassword: string };
    },
    onSuccess: (data) => {
      setCreatedAccount({ email: data.email, password: data.temporaryPassword });
      setDisplayName("");
      setUniformNumber("");
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } =
        await supabase.functions.invoke("bulk-create-player-accounts");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setBulkResults(data);
      Alert.alert(
        "一括登録完了",
        `${data.successCount}件成功、${data.failCount}件失敗`
      );
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert([{ user_id: userId, role }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setRoleModalUserId(null);
      queryClient.invalidateQueries({ queryKey: ["admin_users_with_roles"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_with_roles"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      if (!teamName.trim()) throw new Error("チーム名を入力してください");
      const displayOrder = parseInt(teamDisplayOrder) || 0;
      const { error } = await supabase
        .from("opponent_teams")
        .insert([{ name: teamName.trim(), display_order: displayOrder }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setTeamName("");
      setTeamDisplayOrder("");
      queryClient.invalidateQueries({ queryKey: ["admin_opponent_teams"] });
      queryClient.invalidateQueries({ queryKey: ["opponent_teams"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("opponent_teams")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_opponent_teams"] });
      queryClient.invalidateQueries({ queryKey: ["opponent_teams"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  if (!user) return <Redirect href="/login" />;

  if (!hasRole("admin")) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.icon} />
        <Text style={[styles.noPermText, { color: colors.icon }]}>
          管理者権限が必要です
        </Text>
      </View>
    );
  }

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;
  const inputBg = colorScheme === "dark" ? "#2c2c2e" : "#f9fafb";

  // Role modal: ユーザーが持っていないロールのみ表示
  const roleModalUser = usersWithRoles?.find((u) => u.id === roleModalUserId);
  const availableRoles = roleModalUser
    ? ALL_ROLES.filter((r) => !roleModalUser.roles.includes(r))
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.tint} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          選手・チーム管理
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor:
              colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6",
            borderBottomColor: borderColor,
          },
        ]}
      >
        {(["players", "roles", "teams"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && {
                backgroundColor:
                  colorScheme === "dark" ? "#3a3a3c" : "#fff",
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
              {tab === "players"
                ? "選手管理"
                : tab === "roles"
                ? "ロール管理"
                : "チーム管理"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== Tab 1: 選手管理 ===== */}
        {activeTab === "players" && (
          <>
            {/* 一括登録 */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="people-outline" size={20} color={colors.tint} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  選手一括登録
                </Text>
              </View>
              <Text style={[styles.cardDesc, { color: colors.icon }]}>
                playersテーブルの全選手のアカウントを一括作成します
              </Text>
              <View style={[styles.infoBox, { backgroundColor: colors.tint + "15", borderColor: colors.tint + "40" }]}>
                <Text style={[styles.infoText, { color: colors.icon }]}>
                  メール: player[背番号]@shiga-baseball.internal{"\n"}
                  パスワード: shiga[背番号]
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity: bulkCreateMutation.isPending ? 0.7 : 1,
                  },
                ]}
                onPress={() => {
                  Alert.alert(
                    "一括登録",
                    "全選手のアカウントを一括登録しますか？",
                    [
                      { text: "キャンセル", style: "cancel" },
                      {
                        text: "登録する",
                        onPress: () => bulkCreateMutation.mutate(),
                      },
                    ]
                  );
                }}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="people" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>全選手を一括登録</Text>
                  </>
                )}
              </TouchableOpacity>

              {bulkResults && (
                <View style={{ marginTop: 8, gap: 8 }}>
                  <View style={[styles.resultSummary, { backgroundColor: inputBg, borderColor }]}>
                    <Text style={[styles.resultTitle, { color: colors.text }]}>
                      登録結果
                    </Text>
                    <Text style={[styles.resultItem, { color: colors.text }]}>
                      総選手数: {bulkResults.totalPlayers}
                    </Text>
                    <Text style={[styles.resultItem, { color: "#16a34a" }]}>
                      成功: {bulkResults.successCount}
                    </Text>
                    <Text style={[styles.resultItem, { color: "#dc2626" }]}>
                      失敗: {bulkResults.failCount}
                    </Text>
                  </View>
                  {bulkResults.results?.map((result, index) => (
                    <View
                      key={index}
                      style={[
                        styles.resultRow,
                        {
                          backgroundColor: result.success
                            ? "#dcfce7"
                            : "#fee2e2",
                          borderColor: result.success ? "#86efac" : "#fca5a5",
                        },
                      ]}
                    >
                      <Text style={[styles.resultRowName, { color: result.success ? "#166534" : "#991b1b" }]}>
                        {result.player}（背番号{result.uniformNumber}）
                      </Text>
                      {result.success ? (
                        <>
                          <Text style={styles.resultRowDetail}>
                            メール: {result.email}
                          </Text>
                          <Text style={styles.resultRowDetail}>
                            パスワード: {result.temporaryPassword}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.resultRowError}>{result.error}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 個別アカウント作成 */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-add-outline" size={20} color={colors.tint} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  個別アカウント作成
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>
                  選手名 <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor, backgroundColor: inputBg }]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="例：山田太郎"
                  placeholderTextColor={colors.icon}
                  maxLength={50}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>
                  背番号 <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor, backgroundColor: inputBg }]}
                  value={uniformNumber}
                  onChangeText={setUniformNumber}
                  placeholder="例：10"
                  placeholderTextColor={colors.icon}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity: createPlayerMutation.isPending ? 0.7 : 1,
                  },
                ]}
                onPress={() => createPlayerMutation.mutate()}
                disabled={createPlayerMutation.isPending}
              >
                {createPlayerMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>アカウント作成</Text>
                  </>
                )}
              </TouchableOpacity>

              {createdAccount && (
                <View style={[styles.resultSummary, { backgroundColor: "#dcfce7", borderColor: "#86efac" }]}>
                  <Text style={[styles.resultTitle, { color: "#166534" }]}>
                    作成されたアカウント情報
                  </Text>
                  <Text style={[styles.resultItem, { color: "#166534" }]}>
                    メール: {createdAccount.email}
                  </Text>
                  <Text style={[styles.resultItem, { color: "#166534" }]}>
                    パスワード: {createdAccount.password}
                  </Text>
                  <Text style={[styles.infoText, { color: "#16a34a", marginTop: 4 }]}>
                    ※ 選手には名前と背番号でログインできることを伝えてください
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ===== Tab 2: ロール管理 ===== */}
        {activeTab === "roles" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-outline" size={20} color={colors.tint} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                ユーザーロール管理
              </Text>
            </View>
            <Text style={[styles.cardDesc, { color: colors.icon }]}>
              各ユーザーのロール（権限）を管理します
            </Text>

            {usersLoading ? (
              <ActivityIndicator color={colors.tint} style={{ marginTop: 16 }} />
            ) : usersWithRoles && usersWithRoles.length > 0 ? (
              usersWithRoles.map((u) => (
                <View
                  key={u.id}
                  style={[styles.userRow, { borderColor }]}
                >
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: colors.text }]}>
                      {u.display_name ?? "（名前なし）"}
                    </Text>
                    {u.uniform_number != null && (
                      <Text style={[styles.userSub, { color: colors.icon }]}>
                        背番号: {u.uniform_number}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rolesRow}>
                    {u.roles.map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleBadge, { backgroundColor: colors.tint + "20" }]}
                        onPress={() =>
                          Alert.alert(
                            "ロール削除",
                            `${u.display_name} から「${ROLE_LABELS[role]}」を削除しますか？`,
                            [
                              { text: "キャンセル", style: "cancel" },
                              {
                                text: "削除",
                                style: "destructive",
                                onPress: () =>
                                  removeRoleMutation.mutate({
                                    userId: u.id,
                                    role,
                                  }),
                              },
                            ]
                          )
                        }
                      >
                        <Text style={[styles.roleBadgeText, { color: colors.tint }]}>
                          {ROLE_LABELS[role]}
                        </Text>
                        <Ionicons name="close" size={12} color={colors.tint} />
                      </TouchableOpacity>
                    ))}
                    {u.roles.length < ALL_ROLES.length && (
                      <TouchableOpacity
                        style={[styles.addRoleBtn, { borderColor: colors.icon }]}
                        onPress={() => setRoleModalUserId(u.id)}
                      >
                        <Ionicons name="add" size={14} color={colors.icon} />
                        <Text style={[styles.addRoleBtnText, { color: colors.icon }]}>
                          追加
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                ユーザーが登録されていません
              </Text>
            )}
          </View>
        )}

        {/* ===== Tab 3: 対戦チーム管理 ===== */}
        {activeTab === "teams" && (
          <>
            {/* 新規登録フォーム */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="add-circle-outline" size={20} color={colors.tint} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  対戦チーム登録
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>
                  チーム名 <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor, backgroundColor: inputBg }]}
                  value={teamName}
                  onChangeText={setTeamName}
                  placeholder="例：京都大学"
                  placeholderTextColor={colors.icon}
                  maxLength={100}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>
                  表示順（任意）
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor, backgroundColor: inputBg }]}
                  value={teamDisplayOrder}
                  onChangeText={setTeamDisplayOrder}
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity: createTeamMutation.isPending ? 0.7 : 1,
                  },
                ]}
                onPress={() => createTeamMutation.mutate()}
                disabled={createTeamMutation.isPending}
              >
                {createTeamMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>チーム登録</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 登録済みチーム一覧 */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="list-outline" size={20} color={colors.tint} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  登録済みチーム一覧
                </Text>
              </View>

              {teamsLoading ? (
                <ActivityIndicator color={colors.tint} style={{ marginTop: 8 }} />
              ) : opponentTeams && opponentTeams.length > 0 ? (
                opponentTeams.map((team) => (
                  <View
                    key={team.id}
                    style={[styles.teamRow, { borderColor }]}
                  >
                    <View>
                      <Text style={[styles.teamName, { color: colors.text }]}>
                        {team.name}
                      </Text>
                      <Text style={[styles.teamOrder, { color: colors.icon }]}>
                        表示順: {team.display_order}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() =>
                        Alert.alert(
                          "削除確認",
                          `「${team.name}」を削除しますか？`,
                          [
                            { text: "キャンセル", style: "cancel" },
                            {
                              text: "削除",
                              style: "destructive",
                              onPress: () => deleteTeamMutation.mutate(team.id),
                            },
                          ]
                        )
                      }
                      disabled={deleteTeamMutation.isPending}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={[styles.emptyText, { color: colors.icon }]}>
                  登録されているチームがありません
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ロール追加 Modal */}
      <Modal
        visible={roleModalUserId !== null}
        transparent
        animationType="slide"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setRoleModalUserId(null)}
        />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff", paddingBottom: insets.bottom + 16 },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            ロールを追加
          </Text>
          {availableRoles.length > 0 ? (
            availableRoles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.modalItem, { borderBottomColor: borderColor }]}
                onPress={() => {
                  if (roleModalUserId) {
                    addRoleMutation.mutate({ userId: roleModalUserId, role });
                  }
                }}
              >
                <Text style={[styles.modalItemText, { color: colors.text }]}>
                  {ROLE_LABELS[role]}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.icon }]}>
              追加できるロールがありません
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  noPermText: { fontSize: 15 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8, width: 40 },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    padding: 4,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabText: { fontSize: 12, fontWeight: "600" },
  container: { padding: 16, gap: 16, paddingBottom: 40 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardDesc: { fontSize: 13 },
  infoBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  infoText: { fontSize: 12, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    marginTop: 4,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  resultSummary: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  resultTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  resultItem: { fontSize: 13 },
  resultRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  resultRowName: { fontSize: 13, fontWeight: "600" },
  resultRowDetail: { fontSize: 12, color: "#166534" },
  resultRowError: { fontSize: 12, color: "#991b1b" },
  userRow: {
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  userInfo: { gap: 2 },
  userName: { fontSize: 15, fontWeight: "600" },
  userSub: { fontSize: 12 },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: { fontSize: 13, fontWeight: "500" },
  addRoleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  addRoleBtnText: { fontSize: 13 },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 16 },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  teamName: { fontSize: 15, fontWeight: "500" },
  teamOrder: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemText: { fontSize: 15 },
});
