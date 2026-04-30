import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  useColorScheme,
} from "react-native";

const APP_STORE_URL = "https://apps.apple.com/app/id6759908821";

interface Props {
  visible: boolean;
}

export function ForceUpdateModal({ visible }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Text style={[styles.title, isDark && styles.titleDark]}>
          アップデートが必要です
        </Text>
        <Text style={[styles.message, isDark && styles.messageDark]}>
          このバージョンはサポートが終了しました。{"\n"}
          最新バージョンにアップデートしてください。
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL(APP_STORE_URL)}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>App Storeで更新する</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  containerDark: {
    backgroundColor: "#1c1c1e",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 16,
    textAlign: "center",
  },
  titleDark: {
    color: "#ffffff",
  },
  message: {
    fontSize: 15,
    color: "#3c3c43",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },
  messageDark: {
    color: "#ebebf5",
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
