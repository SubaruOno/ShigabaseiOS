import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { useState, useMemo } from "react";
import { router, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type PitcherSummary = {
  name: string;
  hand: string | null;
  team: string | null;
  gameCount: number;
  pitchCount: number;
};

function TeamPicker({
  teams,
  selected,
  onSelect,
}: {
  teams: string[];
  selected: string | null;
  onSelect: (team: string | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  return (
    <>
      <TouchableOpacity
        style={[
          styles.teamPicker,
          { borderColor: colors.icon, backgroundColor: colors.cardBg },
          selected && { borderColor: colors.tint },
        ]}
        onPress={() => setVisible(true)}
      >
        <Text
          style={[styles.teamPickerText, { color: selected ? colors.tint : colors.icon }]}
          numberOfLines={1}
        >
          {selected ?? "チームで絞り込む"}
        </Text>
        {selected ? (
          <TouchableOpacity
            onPress={() => onSelect(null)}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={16} color={colors.tint} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color={colors.icon} />
        )}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setVisible(false)}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff",
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            チームを選択
          </Text>
          <ScrollView>
            {teams.map((team) => (
              <TouchableOpacity
                key={team}
                style={[
                  styles.modalItem,
                  { borderBottomColor: colors.borderColor },
                ]}
                onPress={() => {
                  onSelect(team);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalItemText,
                    {
                      color: team === selected ? colors.tint : colors.text,
                      fontWeight: team === selected ? "600" : "400",
                    },
                  ]}
                >
                  {team}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export default function OpponentPitchersScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<PitcherSummary[]>({
    queryKey: ["opponent-pitchers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_opponent_pitcher_summary");
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        name: row.pitcher_name as string,
        hand: row.pitcher_hand as string | null,
        team: row.team_name as string | null,
        gameCount: Number(row.game_count),
        pitchCount: Number(row.pitch_count),
      }));
    },
    enabled: !!user,
  });

  if (!user) return <Redirect href="/login" />;

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) {
      if (p.team) set.add(p.team);
    }
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (teamFilter) list = list.filter((p) => p.team === teamFilter);
    if (search.trim()) list = list.filter((p) => p.name.includes(search.trim()));
    return list;
  }, [data, teamFilter, search]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TeamPicker
        teams={teams}
        selected={teamFilter}
        onSelect={setTeamFilter}
      />

      <View
        style={[
          styles.searchRow,
          { borderColor: colors.icon, backgroundColor: colors.cardBg },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.icon} style={{ marginRight: 6 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="投手名で検索"
          placeholderTextColor={colors.icon}
          value={search}
          onChangeText={setSearch}
          editable={!!teamFilter || search.length > 0 || !isLoading}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 12 },
          ]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                { backgroundColor: colors.cardBg, borderColor: colors.borderColor },
              ]}
              onPress={() =>
                router.push(
                  `/opponent-pitchers/${encodeURIComponent(item.name)}` as any
                )
              }
            >
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.sub, { color: colors.icon }]}>
                  {item.team ? `${item.team}` : ""}
                  {item.team && (item.hand || item.gameCount) ? "  " : ""}
                  {item.hand ? `${item.hand}投 · ` : ""}
                  {item.gameCount}試合 · {item.pitchCount}球
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.icon} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.icon }]}>
              {teamFilter || search
                ? "該当する投手が見つかりません"
                : "投手データがありません"}
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
  teamPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  teamPickerText: { fontSize: 14, flex: 1, marginRight: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, height: 40, fontSize: 14 },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: "500" },
  sub: { fontSize: 12 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  modalSheet: {
    maxHeight: "60%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalItem: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemText: { fontSize: 15 },
});
