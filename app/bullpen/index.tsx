import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { EmptyState } from "@/components/empty-state";

type Player = { id: string; name: string; uniform_number: number | null };
type Session = { id: string; player_id: string; date: string };

export default function BullpenIndex() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const canRecord = hasRole("analyst") || hasRole("admin");
  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  const { data, isLoading } = useQuery<{ players: Player[]; sessions: Session[] }>({
    queryKey: ["bullpen_index"],
    queryFn: async () => {
      const [{ data: playerRoles, error: re }, { data: sessions, error: se }] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "player"),
        supabase
          .from("bullpen_sessions")
          .select("id, player_id, date")
          .order("date", { ascending: false }),
      ]);
      if (re) throw re;
      if (se) throw se;

      const playerIds = (playerRoles ?? []).map((r) => r.user_id);
      let players: Player[] = [];
      if (playerIds.length > 0) {
        const { data: profileData, error: pe } = await supabase
          .from("profiles")
          .select("id, display_name, uniform_number")
          .in("id", playerIds)
          .order("uniform_number");
        if (pe) throw pe;
        players = (profileData ?? []).map((p) => ({
          id: p.id,
          name: p.display_name as string,
          uniform_number: p.uniform_number as number | null,
        }));
      }
      return { players, sessions: sessions ?? [] };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  if (!user) return <Redirect href="/login" />;

  const latestByPlayer = new Map<string, string>();
  for (const s of data?.sessions ?? []) {
    if (!latestByPlayer.has(s.player_id)) latestByPlayer.set(s.player_id, s.date);
  }
  const players = data?.players ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : players.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="選手データがありません"
          subtitle="管理者が選手を登録すると表示されます"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            {players.map((player, i) => {
              const latestDate = latestByPlayer.get(player.id);
              return (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.row,
                    { borderBottomColor: borderColor },
                    i === players.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => router.push(`/bullpen/${player.id}` as any)}
                >
                  <View style={styles.numBox}>
                    <Text style={[styles.num, { color: colors.icon }]}>
                      {player.uniform_number ?? "—"}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.name, { color: colors.text }]}>{player.name}</Text>
                    <Text style={[styles.sub, { color: colors.icon }]}>
                      {latestDate ? `最終: ${latestDate.replace(/-/g, "/")}` : "記録なし"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.icon} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {canRecord && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.tint }]}
          onPress={() => router.push("/bullpen/record" as any)}
        >
          <Ionicons name="add" size={28} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  card: { borderRadius: 12, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  numBox: { width: 28, alignItems: "center" },
  num: { fontSize: 13, fontWeight: "600" },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "500" },
  sub: { fontSize: 12 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
