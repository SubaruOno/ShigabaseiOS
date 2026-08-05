import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { useState, useCallback } from "react";
import { router, Redirect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "@/components/empty-state";

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "今";
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [showNewChat, setShowNewChat] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .neq("id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, user1_id, user2_id, updated_at,
          messages(content, created_at, is_read, sender_id, file_url)`
        )
        .or(`user1_id.eq.${user!.id},user2_id.eq.${user!.id}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // 全会話の相手IDを一括取得してプロフィールを1回のクエリで取得（N+1解消）
      const otherIds = data.map((conv) =>
        conv.user1_id === user!.id ? conv.user2_id : conv.user1_id
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherIds);
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.display_name])
      );

      return data.map((conv) => {
        const otherId =
          conv.user1_id === user!.id ? conv.user2_id : conv.user1_id;
        const sorted = [...(conv.messages ?? [])].sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        const last = sorted[0];
        const unread = (conv.messages ?? []).filter(
          (m: any) => !m.is_read && m.sender_id !== user!.id
        ).length;

        return {
          ...conv,
          otherUserName: profileMap.get(otherId) ?? "不明",
          otherId,
          lastMessage: last?.content ?? "メッセージがありません",
          lastMessageTime: last?.created_at,
          unreadCount: unread,
          hasAttachment: !!last?.file_url,
        };
      });
    },
    enabled: !!user,
  });

  const startConversation = useCallback(async (otherUserId: string) => {
    if (!user) return;
    const [small, large] = [user.id, otherUserId].sort();
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("user1_id", small)
      .eq("user2_id", large)
      .single();

    if (existing) {
      router.push(`/chat/${existing.id}` as any);
    } else {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ user1_id: small, user2_id: large })
        .select()
        .single();
      if (!error && newConv) {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.push(`/chat/${newConv.id}` as any);
      }
    }
    setShowNewChat(false);
  }, [user, queryClient]);

  if (!user) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              colorScheme === "dark" ? "#38383a" : "#e5e7eb",
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.tint }]}
          onPress={() => setShowNewChat(true)}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>新規</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.convItem,
                {
                  borderBottomColor:
                    colorScheme === "dark" ? "#38383a" : "#f0f0f0",
                },
              ]}
              onPress={() => router.push(`/chat/${item.id}` as any)}
            >
              <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
                <Text style={styles.avatarText}>
                  {item.otherUserName.charAt(0)}
                </Text>
              </View>
              <View style={styles.convContent}>
                <View style={styles.convTop}>
                  <Text style={[styles.convName, { color: colors.text }]}>
                    {item.otherUserName}
                  </Text>
                  {item.lastMessageTime ? (
                    <Text style={[styles.convTime, { color: colors.icon }]}>
                      {formatTime(item.lastMessageTime)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.convBottom}>
                  <View style={styles.convLastMsg}>
                    {item.hasAttachment ? (
                      <Ionicons
                        name="attach"
                        size={13}
                        color={colors.icon}
                      />
                    ) : null}
                    <Text
                      style={[styles.convPreview, { color: colors.icon }]}
                      numberOfLines={1}
                    >
                      {item.lastMessage}
                    </Text>
                  </View>
                  {item.unreadCount > 0 ? (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: colors.tint },
                      ]}
                    >
                      <Text style={styles.badgeText}>{item.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-outline"
              title="まだメッセージがありません"
              action={{ label: "新しいメッセージを開始", onPress: () => setShowNewChat(true) }}
            />
          }
        />
      )}

      <Modal visible={showNewChat} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowNewChat(false)}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor:
                colorScheme === "dark" ? "#2c2c2e" : "#fff",
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            新しいメッセージ
          </Text>
          <ScrollView>
            {profiles?.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.profileItem, { borderBottomColor: colors.icon }]}
                onPress={() => startConversation(p.id)}
              >
                <View
                  style={[styles.avatar, { backgroundColor: colors.tint }]}
                >
                  <Text style={styles.avatarText}>
                    {p.display_name.charAt(0)}
                  </Text>
                </View>
                <Text style={[styles.profileName, { color: colors.text }]}>
                  {p.display_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
    borderBottomWidth: 1,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  convItem: {
    flexDirection: "row",
    padding: 14,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  convContent: { flex: 1 },
  convTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  convName: { fontSize: 15, fontWeight: "600" },
  convTime: { fontSize: 12 },
  convBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convLastMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  convPreview: { fontSize: 13, flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  emptyContainer: { alignItems: "center", marginTop: 60, padding: 20 },
  emptyText: { fontSize: 14, marginVertical: 16 },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  modalSheet: {
    maxHeight: "60%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  profileItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  profileName: { fontSize: 15, marginLeft: 12 },
});
