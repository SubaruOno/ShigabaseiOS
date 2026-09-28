import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { scale, moderateScale } from "@/lib/scale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { signIn, user } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) {
      Alert.alert("エラー", "メールアドレスを入力してください");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
    setResetLoading(false);
    if (error) {
      Alert.alert("エラー", "メールの送信に失敗しました。メールアドレスを確認してください。");
    } else {
      setResetSent(true);
    }
  };

  const closeResetModal = () => {
    setResetModalVisible(false);
    setResetEmail("");
    setResetSent(false);
  };

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogin = async () => {
    setError("");
    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (!password) {
      setError("パスワードを入力してください");
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      // signIn 内で Alert 表示済み
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          滋賀大学野球部
        </Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          SHIGABASE
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>メールアドレス</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
            placeholder="example@email.com"
            placeholderTextColor={colors.icon}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCorrect={false}
            spellCheck={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>パスワード</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
            placeholder="パスワード"
            placeholderTextColor={colors.icon}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>ログイン</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={() => setResetModalVisible(true)}
        >
          <Text style={[styles.subLinkText, { color: colors.icon }]}>
            パスワードをお忘れですか？
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerLink}
          onPress={() => router.push("/register")}
        >
          <Text style={[styles.registerLinkText, { color: colors.tint }]}>
            招待コードをお持ちの方はこちら
          </Text>
        </TouchableOpacity>
      </View>

      {/* パスワードリセットモーダル */}
      <Modal visible={resetModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            {resetSent ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  メールを送信しました
                </Text>
                <Text style={[styles.modalDesc, { color: colors.icon }]}>
                  {resetEmail} にパスワード再設定用のリンクを送りました。メールをご確認ください。
                </Text>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.tint }]}
                  onPress={closeResetModal}
                >
                  <Text style={styles.modalButtonText}>閉じる</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  パスワードをリセット
                </Text>
                <Text style={[styles.modalDesc, { color: colors.icon }]}>
                  登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      color: colors.text,
                      borderColor: colors.icon,
                      backgroundColor: colors.background,
                    },
                  ]}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.icon}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.tint }]}
                  onPress={handleResetPassword}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>送信</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={closeResetModal}
                >
                  <Text style={[styles.subLinkText, { color: colors.icon }]}>
                    キャンセル
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: scale(20),
  },
  card: {
    // iPadやブラウザで横に伸びすぎないようにする
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: scale(24),
    borderRadius: scale(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: moderateScale(24),
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: moderateScale(13),
    textAlign: "center",
    marginBottom: scale(24),
    letterSpacing: 2,
  },
  inputGroup: {
    marginBottom: scale(16),
  },
  label: {
    fontSize: moderateScale(14),
    fontWeight: "600",
    marginBottom: scale(6),
  },
  input: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(12),
    fontSize: moderateScale(16),
  },
  errorText: {
    color: "#ef4444",
    fontSize: moderateScale(13),
    marginBottom: scale(12),
    textAlign: "center",
  },
  button: {
    padding: scale(14),
    borderRadius: scale(8),
    alignItems: "center",
    marginTop: scale(8),
  },
  buttonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  forgotLink: {
    marginTop: scale(12),
    alignItems: "center",
  },
  registerLink: {
    marginTop: scale(8),
    alignItems: "center",
  },
  registerLinkText: {
    fontSize: moderateScale(14),
  },
  subLinkText: {
    fontSize: moderateScale(13),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: scale(24),
  },
  modalCard: {
    borderRadius: scale(16),
    padding: scale(24),
  },
  modalTitle: {
    fontSize: moderateScale(17),
    fontWeight: "600",
    marginBottom: scale(8),
    textAlign: "center",
  },
  modalDesc: {
    fontSize: moderateScale(13),
    lineHeight: 20,
    marginBottom: scale(16),
    textAlign: "center",
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(12),
    fontSize: moderateScale(15),
    marginBottom: scale(12),
  },
  modalButton: {
    padding: scale(13),
    borderRadius: scale(8),
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
  modalCancel: {
    marginTop: scale(12),
    alignItems: "center",
  },
});
