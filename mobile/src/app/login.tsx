import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, colors, ErrorText, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { LoginResult } from "@/lib/types";

/**
 * Sign in with school code + email/phone + password (teachers and parents).
 * The school code means a parent with children in two schools signs in to the right one.
 * Signing in with an SMS code is offered as a fallback.
 */

const SCHOOL_CODE_KEY = "sms.schoolCode";

type Step = { name: "password" } | { name: "otpPhone" } | { name: "otpCode"; devCode?: string } | { name: "school"; result: Extract<LoginResult, { status: "select_school" }> };

export default function LoginScreen() {
  const { t, language, setLanguage } = useI18n();
  const { signIn } = useSession();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [schoolCode, setSchoolCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember the school code from last time
  useEffect(() => {
    AsyncStorage.getItem(SCHOOL_CODE_KEY).then((saved) => saved && setSchoolCode(saved)).catch(() => undefined);
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const school = () => schoolCode.trim().toUpperCase();

  const finish = async (result: LoginResult) => {
    if (result.status !== "ok") return setStep({ name: "school", result });
    await AsyncStorage.setItem(SCHOOL_CODE_KEY, school()).catch(() => undefined);
    await signIn(result);
    router.replace("/home");
  };

  const signInWithPassword = () =>
    run(async () => finish(await api.post<LoginResult>("/auth/login", { schoolCode: school(), identifier: identifier.trim(), password })));

  const sendCode = () =>
    run(async () => {
      const result = await api.post<{ sent: boolean; devCode?: string }>("/auth/otp/request", { phone: identifier.trim(), schoolCode: school() });
      setCode("");
      setStep({ name: "otpCode", devCode: result.devCode });
    });

  const verifyCode = () => run(async () => finish(await api.post<LoginResult>("/auth/otp/verify", { phone: identifier.trim(), code, schoolCode: school() })));

  const chooseSchool = (userId: string) =>
    run(async () => {
      if (step.name !== "school") return;
      await finish({ status: "ok", ...(await api.post<{ accessToken: string; refreshToken: string }>("/auth/select-school", { selectionToken: step.result.selectionToken, userId })) });
    });

  const schoolField = <TextField label={t("schoolCode")} value={schoolCode} onChangeText={(v) => setSchoolCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. DEMO" maxLength={12} />;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setLanguage(language === "en" ? "ne" : "en")} style={styles.language}>
            <Text style={{ color: colors.brand, fontWeight: "600" }}>{language === "en" ? "नेपाली" : "English"}</Text>
          </Pressable>

          <View style={styles.logo}>
            <Text style={{ fontSize: 28 }}>🎓</Text>
          </View>
          <Text style={styles.title}>{t("appName")}</Text>
          <Text style={styles.subtitle}>{t("signInHint")}</Text>

          <Card style={{ gap: 16, marginTop: 24 }}>
            {step.name === "password" && (
              <>
                {schoolField}
                <TextField label={t("emailOrPhone")} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" />
                <TextField label={t("password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={() => void signInWithPassword()} />
                <ErrorText message={error} />
                <Button title={t("signIn")} onPress={() => void signInWithPassword()} loading={busy} disabled={!schoolCode.trim() || !identifier.trim() || !password} />
                <Button variant="ghost" title={t("useSmsCode")} onPress={() => (setError(null), setStep({ name: "otpPhone" }))} />
              </>
            )}

            {step.name === "otpPhone" && (
              <>
                {schoolField}
                <TextField label={t("phone")} value={identifier} onChangeText={setIdentifier} keyboardType="phone-pad" placeholder="98XXXXXXXX" maxLength={14} />
                <ErrorText message={error} />
                <Button title={t("sendCode")} onPress={() => void sendCode()} loading={busy} disabled={!schoolCode.trim() || identifier.length < 10} />
                <Button variant="ghost" title={t("usePassword")} onPress={() => (setError(null), setStep({ name: "password" }))} />
              </>
            )}

            {step.name === "otpCode" && (
              <>
                <Text style={{ color: colors.muted }}>
                  {t("codeSent")} <Text style={{ color: colors.text, fontWeight: "600" }}>{identifier}</Text>
                </Text>
                {step.devCode && <Text style={styles.devCode}>Development code: {step.devCode}</Text>}
                <TextField
                  label={t("code")}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  style={styles.codeInput}
                />
                <ErrorText message={error} />
                <Button title={t("verify")} onPress={() => void verifyCode()} loading={busy} disabled={code.length !== 6} />
                <View style={styles.row}>
                  <Button variant="ghost" title={t("changeNumber")} onPress={() => setStep({ name: "otpPhone" })} />
                  <Button variant="ghost" title={t("resend")} onPress={() => void sendCode()} />
                </View>
              </>
            )}

            {step.name === "school" && (
              <>
                <Text style={styles.sectionTitle}>{t("chooseSchool")}</Text>
                {step.result.accounts.map((account) => (
                  <Pressable key={account.userId} onPress={() => void chooseSchool(account.userId)} style={({ pressed }) => [styles.school, pressed && { backgroundColor: colors.brandSoft }]}>
                    <Text style={{ fontWeight: "600", color: colors.text }}>{account.schoolName}</Text>
                    <Text style={{ color: colors.muted, fontSize: 15 }}>{account.schoolCode}</Text>
                  </Pressable>
                ))}
                <ErrorText message={error} />
              </>
            )}
          </Card>
          <Text style={styles.help}>{t("loginHelp")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 32, maxWidth: 480, width: "100%", alignSelf: "center" },
  language: { alignSelf: "flex-end", padding: 8 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginTop: 16, color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 6 },
  devCode: { backgroundColor: "#fffbeb", color: "#92400e", padding: 10, borderRadius: 8, fontSize: 15 },
  codeInput: { textAlign: "center", fontSize: 24, letterSpacing: 8, height: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  row: { flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "600", color: colors.text },
  school: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  help: { textAlign: "center", color: colors.muted, fontSize: 15, marginTop: 16 },
});
