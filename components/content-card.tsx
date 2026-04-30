import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

interface ContentCardProps {
  title: string;
  categoryName?: string;
  playerName?: string;
  createdAt: string;
  type: "document" | "video";
  onClick: () => void;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ContentCard({
  title,
  categoryName,
  playerName,
  createdAt,
  type,
  onClick,
}: ContentCardProps) {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
      onPress={onClick}
      activeOpacity={0.7}
    >
      <View style={styles.leftBadge}>
        <View style={[styles.typeBadge, { backgroundColor: type === "video" ? "#3b82f6" : "#10b981" }]}>
          <Text style={styles.typeBadgeText}>{type === "video" ? "動画" : "資料"}</Text>
        </View>
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.meta}>
          {categoryName ? (
            <Text style={[styles.metaText, { color: colors.icon }]}>{categoryName}</Text>
          ) : null}
          {playerName ? (
            <Text style={[styles.metaText, { color: colors.icon }]}>{playerName}</Text>
          ) : null}
          {createdAt ? (
            <Text style={[styles.metaText, { color: colors.icon }]}>{formatDate(createdAt)}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  leftBadge: {
    marginRight: 12,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
});
