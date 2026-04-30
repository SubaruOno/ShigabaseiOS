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
  ScrollView,
  Alert,
} from "react-native";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/use-auth";
import { scale, verticalScale, moderateScale } from "@/lib/scale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type Step = "code" | "account";

export default function RegisterScreen() {
  const { user, signUp } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  const cardBg = colors.cardBg;

  const handleVerifyCode = async () => {
    setError("");
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError("招待コードを入力してください");
      return;
    }
    setIsLoading(true);
    try {
      let data: any = null;
      let fnError: any = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1200));
        }
        const result = await supabase.functions.invoke("verify-invite-code", {
          body: { code: trimmedCode },
        });
        data = result.data;
        fnError = result.error;

        // コード自体が無効な場合（サーバーは正常）はリトライしない
        if (!fnError && data !== null) break;
      }

      if (fnError || !data?.valid) {
        setError(data?.error ?? "招待コードが無効です");
        return;
      }
      setPlayerName(data.playerName);
      setStep("account");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError("");
    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    setIsLoading(true);
    try {
      await signUp(code.trim().toUpperCase(), email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? "登録に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.tint} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>新規登録</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* ステップインジケーター */}
        <View style={styles.stepRow}>
          {(["code", "account"] as Step[]).map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                { backgroundColor: step === s || (s === "code" && step === "account") ? colors.tint : colors.icon + "40" },
              ]}>
                {s === "code" && step === "account" ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={styles.stepDotText}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, { color: step === s ? colors.text : colors.icon }]}>
                {s === "code" ? "招待コード" : "アカウント設定"}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {step === "code" ? (
            <>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                招待コードを入力
              </Text>
              <Text style={[styles.stepDesc, { color: colors.icon }]}>
                管理者から受け取った招待コードを入力してください
              </Text>

              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.codeInput, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
                  placeholder="XXXXXXXX"
                  placeholderTextColor={colors.icon}
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleVerifyCode}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>確認する</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                アカウントを設定
              </Text>
              <View style={styles.playerNameBadge}>
                <Ionicons name="person-circle-outline" size={18} color={colors.tint} />
                <Text style={[styles.playerNameText, { color: colors.tint }]}>
                  {playerName}
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>メールアドレス</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.icon}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>パスワード（8文字以上）</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
                  placeholder="パスワード"
                  placeholderTextColor={colors.icon}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="off"
                  textContentType="oneTimeCode"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>パスワード（確認）</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
                  placeholder="パスワードを再入力"
                  placeholderTextColor={colors.icon}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoComplete="off"
                  textContentType="oneTimeCode"
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>登録する</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setStep("code"); setError(""); }}
              >
                <Text style={[styles.backLinkText, { color: colors.icon }]}>
                  招待コードの入力に戻る
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: scale(20), paddingTop: verticalScale(60) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: scale(24),
  },
  headerTitle: { fontSize: moderateScale(18), fontWeight: "600" },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: scale(32),
    marginBottom: scale(24),
  },
  stepItem: { alignItems: "center", gap: scale(6) },
  stepDot: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "700" },
  stepLabel: { fontSize: moderateScale(11) },
  card: {
    padding: scale(24),
    borderRadius: scale(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: 4,
  },
  stepTitle: { fontSize: moderateScale(18), fontWeight: "700", marginBottom: 4 },
  stepDesc: { fontSize: moderateScale(13), marginBottom: scale(16), lineHeight: 18 },
  playerNameBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    marginBottom: scale(16),
  },
  playerNameText: { fontSize: moderateScale(15), fontWeight: "600" },
  inputGroup: { marginBottom: scale(14) },
  label: { fontSize: moderateScale(14), fontWeight: "600", marginBottom: scale(6) },
  input: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(12),
    fontSize: moderateScale(16),
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(14),
    fontSize: moderateScale(24),
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 6,
    marginTop: scale(8),
  },
  errorText: {
    color: "#ef4444",
    fontSize: moderateScale(13),
    marginBottom: scale(8),
    textAlign: "center",
  },
  button: {
    padding: scale(14),
    borderRadius: scale(8),
    alignItems: "center",
    marginTop: scale(8),
  },
  buttonText: { color: "#fff", fontSize: moderateScale(16), fontWeight: "600" },
  backLink: { marginTop: scale(12), alignItems: "center" },
  backLinkText: { fontSize: moderateScale(13) },
});
