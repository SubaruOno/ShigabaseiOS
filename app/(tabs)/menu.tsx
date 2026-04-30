import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";


export default function MenuScreen() {
  const { user, roles, signOut, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const { data: myProfile } = useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("uniform_number")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data as { uniform_number: number | null };
    },
    enabled: !!user && hasRole("player"),
  });

  const handleMyStats = async () => {
    // まず user_id で直接紐付けされた players レコードを探す（新フロー）
    const { data: playerByUserId } = await supabase
      .from("players")
      .select("name, excel_name")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (playerByUserId) {
      const playerName = (playerByUserId.excel_name as string | null) ?? (playerByUserId.name as string);
      router.push(`/player-stats/${encodeURIComponent(playerName)}` as any);
      return;
    }

    // フォールバック: uniform_number で検索（旧フロー）
    if (!myProfile?.uniform_number) {
      Alert.alert("エラー", "管理者に選手データの登録を依頼してください");
      return;
    }
    const { data } = await supabase
      .from("players")
      .select("name, excel_name")
      .eq("uniform_number", myProfile.uniform_number)
      .maybeSingle();
    if (!data) {
      Alert.alert("エラー", "管理者に選手データの登録を依頼してください");
      return;
    }
    const playerName = (data.excel_name as string | null) ?? (data.name as string);
    router.push(`/player-stats/${encodeURIComponent(playerName)}` as any);
  };

  if (!user) return <Redirect href="/login" />;

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  const roleLabel = (role: string) => {
    if (role === "admin") return "管理者";
    if (role === "analyst") return "アナリスト";
    return "選手";
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* ユーザー情報 */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="person-circle-outline" size={20} color={colors.tint} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>ユーザー情報</Text>
        </View>
        <Text style={[styles.label, { color: colors.icon }]}>メールアドレス</Text>
        <Text style={[styles.value, { color: colors.text }]}>{user.email}</Text>
        <Text style={[styles.label, { color: colors.icon }]}>ロール</Text>
        <View style={styles.roleRow}>
          {roles.map((role) => (
            <View key={role} style={[styles.roleBadge, { backgroundColor: colors.tint + "20" }]}>
              <Ionicons name="shield-outline" size={12} color={colors.tint} />
              <Text style={[styles.roleText, { color: colors.tint }]}>
                {roleLabel(role)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* アナリスト以上: コンテンツ投稿 */}
      {(hasRole("analyst") || hasRole("admin")) && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>コンテンツ投稿</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            資料や動画をアップロード
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.tint }]}
            onPress={() => router.push("/upload")}
          >
            <Text style={[styles.outlineBtnText, { color: colors.tint }]}>
              投稿フォームを開く
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.tint} />
          </TouchableOpacity>
        </View>
      )}

      {/* 選手: 自分の成績 */}
      {hasRole("player") && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart-outline" size={20} color="#ef4444" />
            <Text style={[styles.cardTitle, { color: colors.text }]}>自分の成績</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            打撃・投球の通算・試合別成績を確認
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: "#ef4444" }]}
            onPress={handleMyStats}
          >
            <Text style={[styles.outlineBtnText, { color: "#ef4444" }]}>
              自分の成績を見る
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* 管理者: 招待コード管理 */}
      {hasRole("admin") && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="ticket-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>招待コード管理</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            部員へのアカウント招待コードを発行・管理
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.tint }]}
            onPress={() => router.push("/admin/invite")}
          >
            <Text style={[styles.outlineBtnText, { color: colors.tint }]}>
              招待コード管理を開く
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.tint} />
          </TouchableOpacity>
        </View>
      )}

      {/* 管理者: 選手管理 */}
      {hasRole("admin") && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>選手管理</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            ロール管理・対戦チーム管理
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.tint }]}
            onPress={() => router.push("/admin/players")}
          >
            <Text style={[styles.outlineBtnText, { color: colors.tint }]}>
              選手管理を開く
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.tint} />
          </TouchableOpacity>
        </View>
      )}

      {/* その他 */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle-outline" size={20} color={colors.tint} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>その他</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push("/privacy-policy")}
        >
          <Text style={[styles.linkText, { color: colors.text }]}>プライバシーポリシー</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {/* ログアウト */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={signOut}
      >
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.logoutText}>ログアウト</Text>
      </TouchableOpacity>

      {/* アカウント削除 */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => {
          Alert.alert(
            "アカウント削除",
            "アカウントを削除すると、メッセージや記録などすべてのデータが完全に削除されます。この操作は取り消せません。",
            [
              { text: "キャンセル", style: "cancel" },
              {
                text: "削除する",
                style: "destructive",
                onPress: async () => {
                  try {
                    const { error } = await supabase.functions.invoke(
                      "delete-account"
                    );
                    if (error) throw error;
                    await supabase.auth.signOut();
                    router.replace("/login");
                  } catch {
                    Alert.alert(
                      "エラー",
                      "アカウントの削除に失敗しました。管理者にお問い合わせください。"
                    );
                  }
                },
              },
            ]
          );
        }}
      >
        <Text style={styles.deleteBtnText}>アカウントを削除する</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardDesc: { fontSize: 13 },
  label: { fontSize: 12, marginTop: 4 },
  value: { fontSize: 14, fontWeight: "500" },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: { fontSize: 13, fontWeight: "500" },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  outlineBtnText: { fontSize: 14, fontWeight: "500" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  linkText: { fontSize: 14 },
  deleteBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  deleteBtnText: { color: "#ef4444", fontSize: 14 },
});
