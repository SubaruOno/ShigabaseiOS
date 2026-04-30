import { View, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scale } from "@/lib/scale";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type TabItem =
  | { type: "tab"; name: string; icon: IoniconName }
  | { type: "action"; key: string; icon: IoniconName; onPress: () => void };

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasRole, user } = useAuth();

  const isAnalystOrAdmin = hasRole("analyst") || hasRole("admin");
  const isPlayer = hasRole("player");

  const handleMyStats = async () => {
    const { data: player } = await supabase
      .from("players")
      .select("name, excel_name")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (player) {
      const name = (player.excel_name as string | null) ?? (player.name as string);
      router.push(`/player-stats/${encodeURIComponent(name)}` as any);
    } else {
      Alert.alert("エラー", "選手データが見つかりません");
    }
  };

  const tabItems: TabItem[] = [
    { type: "tab", name: "index", icon: "home" },
    { type: "tab", name: "messages", icon: "chatbubble" },
    ...(isAnalystOrAdmin
      ? [
          {
            type: "action" as const,
            key: "upload-action",
            icon: "add-circle" as IoniconName,
            onPress: () => router.push("/upload"),
          },
        ]
      : []),
    ...(isPlayer
      ? [
          {
            type: "action" as const,
            key: "stats-action",
            icon: "stats-chart" as IoniconName,
            onPress: handleMyStats,
          },
        ]
      : []),
    { type: "tab", name: "menu", icon: "menu" },
  ];

  const currentRouteName = state.routes[state.index]?.name;

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.pill}>
        {tabItems.map((item, i) => {
          if (item.type === "action") {
            return (
              <TouchableOpacity
                key={item.key}
                onPress={item.onPress}
                style={styles.tab}
                activeOpacity={0.7}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={item.icon} size={scale(22)} color="#fff" />
                </View>
              </TouchableOpacity>
            );
          }

          const isFocused = currentRouteName === item.name;

          const onPress = () => {
            const route = state.routes.find((r) => r.name === item.name);
            if (!route) return;
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(item.name);
            }
          };

          return (
            <TouchableOpacity
              key={item.name}
              onPress={onPress}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <View
                style={[styles.iconWrap, isFocused && styles.iconWrapActive]}
              >
                <Ionicons name={item.icon} size={scale(22)} color="#fff" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "transparent",
  },
  pill: {
    backgroundColor: "#3a4556",
    borderRadius: 999,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
  },
  iconWrap: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: "#4a5566",
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapActive: {
    backgroundColor: "#0a7ea4",
  },
});
