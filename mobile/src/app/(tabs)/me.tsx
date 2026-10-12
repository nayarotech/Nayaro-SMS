import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, colors, confirmAction } from "@/components/ui";
import { useI18n, type Language } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ne", label: "नेपाली" },
];

/** Account, language and sign out — kept out of the way of everyday screens. */
export default function MeScreen() {
  const { t, language, setLanguage } = useI18n();
  const { me, children, signOut } = useSession();

  const askSignOut = async () => {
    if (!(await confirmAction(t("signOutConfirm"), { ok: t("signOut"), cancel: t("cancel") }))) return;
    await signOut();
    router.replace("/login");
  };

  return (
    <Screen title={t("myAccount")} tab>
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{me?.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{me?.fullName}</Text>
          {me?.phone ? <Text style={styles.muted}>{me.phone}</Text> : null}
          {me?.roles.length ? <Text style={styles.muted}>{me.roles.map((r) => r.name).join(", ")}</Text> : null}
        </View>
      </Card>

      {me?.school && (
        <Card style={{ gap: 4 }}>
          <Text style={styles.label}>{t("school")}</Text>
          <Text style={styles.value}>{me.school.name}</Text>
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("language")}</Text>
        <View style={styles.segment}>
          {LANGUAGES.map((l) => {
            const active = language === l.value;
            return (
              <Pressable key={l.value} onPress={() => setLanguage(l.value)} style={[styles.option, active && styles.optionActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
                <Text style={[styles.optionText, active && { color: colors.white }]}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {children.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>{t("myChildren")}</Text>
          {children.map((child) => (
            <View key={child.id}>
              <Text style={styles.value}>{child.fullName}</Text>
              <Text style={styles.muted}>{child.classSection ?? "—"} · {t("admissionNo")} {child.admissionNo}</Text>
            </View>
          ))}
        </Card>
      )}

      <Pressable onPress={() => void askSignOut()} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.signOutText}>{t("signOut")}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brand, fontSize: 20, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
  label: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  value: { color: colors.text, fontSize: 17, fontWeight: "600" },
  segment: { flexDirection: "row", gap: 8 },
  option: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  optionActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  optionText: { fontSize: 17, fontWeight: "700", color: colors.text },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: "#fecaca", backgroundColor: colors.white },
  signOutText: { color: colors.danger, fontSize: 17, fontWeight: "700" },
});
