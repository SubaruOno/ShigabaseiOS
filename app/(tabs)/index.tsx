import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { router, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { verticalScale } from "@/lib/scale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/hooks/use-auth";
import { Colors } from "@/constants/theme";

const CALENDAR_ID = "shigauni.bbc@gmail.com";
const CALENDAR_URL = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(CALENDAR_ID)}&ctz=Asia%2FTokyo&hl=ja&mode=AGENDA&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0`;

const categoryCards = [
  { title: "資料", subtitle: "対策資料・試合レポート", icon: "document-text", path: "/(tabs)/documents", color: "#3b82f6" },
  { title: "試合映像", subtitle: "試合・練習映像", icon: "play-circle", path: "/(tabs)/videos", color: "#8b5cf6" },
  { title: "ウエイト記録", subtitle: "トレーニング記録・チーム分析", icon: "barbell", path: "/(tabs)/weight", color: "#f59e0b" },
  { title: "練習映像", subtitle: "打撃・守備・ウエイト", icon: "trending-up", path: "/scores", color: "#10b981" },
  { title: "試合結果", subtitle: "投球・打撃データ分析", icon: "stats-chart", path: "/game-analysis", color: "#ef4444" },
  { title: "データ分析", subtitle: "打撃・投球 チーム分析", icon: "analytics", path: "/analytics", color: "#6366f1" },
] as const;

function HeroHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.heroWrapper}>
      <Image
        source={require("@/assets/images/header.png")}
        style={styles.heroBg}
        resizeMode="cover"
      />
      {/* ステータスバー分の余白 */}
      <View style={{ height: insets.top }} />
    </View>
  );
}

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <HeroHeader />

      <View style={styles.body}>
        {/* カテゴリカード */}
        <View style={[styles.menuCard, { backgroundColor: cardBg }]}>
          {categoryCards.map((card, index) => (
            <TouchableOpacity
              key={card.title}
              style={[
                styles.menuRow,
                index < categoryCards.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: borderColor,
                },
              ]}
              onPress={() => router.push(card.path as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, { backgroundColor: card.color }]}>
                <Ionicons name={card.icon as any} size={20} color="#fff" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{card.title}</Text>
                <Text style={[styles.menuSubtitle, { color: colors.icon }]}>{card.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.icon} />
            </TouchableOpacity>
          ))}
        </View>

        {/* カレンダー */}
        <View style={styles.calendarSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={18} color={colors.tint} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              チームカレンダー
            </Text>
          </View>

          <View style={[styles.calCard, { borderColor }]}>
            <WebView
              source={{ uri: CALENDAR_URL }}
              style={styles.webview}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.calLoading}>
                  <ActivityIndicator size="small" color={colors.tint} />
                </View>
              )}
              scrollEnabled
              javaScriptEnabled
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { paddingBottom: 32 },

  /* ヒーローヘッダー */
  heroWrapper: {
    width: "100%",
    aspectRatio: 2.36,
    overflow: "hidden",
  },
  heroBg: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },

  /* コンテンツ */
  body: { padding: 16, gap: 16 },

  /* リスト型カード */
  menuCard: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: { flex: 1, gap: 2 },
  menuTitle: { fontSize: 15, fontWeight: "600" },
  menuSubtitle: { fontSize: 12 },
  calendarSection: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  calLoading: { paddingVertical: 24, alignItems: "center" },
  calCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    height: verticalScale(450),
  },
  webview: { flex: 1 },
});
