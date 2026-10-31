import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { AttachmentList } from "@/components/Attachments";
import { ChildSwitcher } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { StudyMaterial } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

/** Notes, worksheets and videos for the selected child's class, grouped by subject. */
export default function MaterialsScreen() {
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<StudyMaterial[]>(selectedChild ? `/my/children/${selectedChild.id}/materials` : null);
  const bySubject = new Map<string, StudyMaterial[]>();
  for (const m of data ?? []) bySubject.set(m.subject.name, [...(bySubject.get(m.subject.name) ?? []), m]);

  return (
    <Screen title={t("materials")} subtitle={selectedChild?.fullName} onRefresh={reload} offline={offline} loading={loading && !data}>
      <ChildSwitcher />
      {!bySubject.size ? (
        <Card><Text style={styles.muted}>{t("noMaterials")}</Text></Card>
      ) : (
        [...bySubject].map(([subject, items]) => (
          <View key={subject} style={{ gap: 10 }}>
            <Text style={styles.subject}>{subject}</Text>
            {items.map((m) => (
              <Card key={m.id} style={{ gap: 8 }}>
                <Text style={styles.title}>{m.title}</Text>
                {m.description ? <Text style={styles.body}>{m.description}</Text> : null}
                {m.link ? (
                  <Pressable onPress={() => void Linking.openURL(m.link!)} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]} accessibilityRole="link">
                    <Ionicons name={/youtu/.test(m.link) ? "logo-youtube" : "link-outline"} size={22} color={/youtu/.test(m.link) ? "#dc2626" : colors.brand} />
                    <Text style={styles.linkText} numberOfLines={1}>{m.link.replace(/^https?:\/\//, "")}</Text>
                  </Pressable>
                ) : null}
                <AttachmentList files={m.attachments} />
                <Text style={styles.muted}>{m.postedBy.fullName}</Text>
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subject: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 4 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 23 },
  link: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  linkText: { flex: 1, fontSize: 15, color: colors.brand },
  muted: { color: colors.muted, fontSize: 15 },
});
