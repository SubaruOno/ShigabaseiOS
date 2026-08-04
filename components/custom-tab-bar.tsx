import { View, TouchableOpacity, StyleSheet, Text, Alert } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scale } from "@/lib/scale";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type TabItem = {
  name: string;
  icon: IoniconName;
  activeIcon: IoniconName;
  label: string;
};

const TAB_ITEMS: TabItem[] = [
  { name: "index", icon: "home-outline", activeIcon: "home", label: "ホーム" },
  { name: "documents", icon: "document-text-outline", activeIcon: "document-text", label: "資料" },
  { name: "videos", icon: "play-circle-outline", activeIcon: "play-circle", label: "映像" },
  { name: "menu", icon: "menu-outline", activeIcon: "menu", label: "メニュー" },
];

const ACTIVE_COLOR = "#0a7ea4";
const INACTIVE_COLOR = "rgba(255,255,255,0.55)";

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasRole, user } = useAuth();
  const currentRouteName = state.routes[state.index]?.name;

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

  // 左2・中央アクション・右2 で投稿を中央に配置
  const leftTabs = TAB_ITEMS.slice(0, 2);
  const rightTabs = TAB_ITEMS.slice(2);

  const renderTab = (item: TabItem) => {
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
        accessibilityLabel={item.label}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
      >
        <Ionicons
          name={isFocused ? item.activeIcon : item.icon}
          size={scale(24)}
          color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
        />
        <Text style={[styles.label, isFocused && styles.labelActive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: (insets.bottom || 8) + 4 }]}>
      {leftTabs.map(renderTab)}

      {/* 中央スロット */}
      {isAnalystOrAdmin ? (
        // analyst/admin: 丸い投稿ボタン
        <TouchableOpacity
          style={styles.tab}
          onPress={() => router.push("/upload")}
          activeOpacity={0.8}
          accessibilityLabel="投稿"
        >
          <View style={styles.actionBtn}>
            <Ionicons name="add" size={scale(26)} color="#fff" />
          </View>
          <Text style={styles.label}>投稿</Text>
        </TouchableOpacity>
      ) : isPlayer ? (
        // player: 普通のタブとして成績
        <TouchableOpacity
          style={styles.tab}
          onPress={handleMyStats}
          activeOpacity={0.7}
          accessibilityLabel="成績"
        >
          <Ionicons name="stats-chart-outline" size={scale(24)} color={INACTIVE_COLOR} />
          <Text style={styles.label}>成績</Text>
        </TouchableOpacity>
      ) : null /* OB・その他: 中央スロットなし（4タブ構成） */}

      {rightTabs.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#1c2333",
    flexDirection: "row",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "500",
    color: INACTIVE_COLOR,
  },
  labelActive: {
    color: ACTIVE_COLOR,
    fontWeight: "600",
  },
  actionBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: ACTIVE_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
});
