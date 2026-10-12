import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { NoteCategory, SchoolNote } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

const CATEGORY: Record<NoteCategory, { label: "noteAchievement" | "noteDiscipline" | "noteCounselling" | "noteHealth" | "noteGeneral"; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  ACHIEVEMENT: { label: "noteAchievement", icon: "ribbon-outline", color: "#15803d" },
  DISCIPLINE: { label: "noteDiscipline", icon: "alert-circle-outline", color: "#b91c1c" },
  COUNSELLING: { label: "noteCounselling", icon: "chatbubbles-outline", color: "#1d4ed8" },
  HEALTH: { label: "noteHealth", icon: "medkit-outline", color: "#b45309" },
  GENERAL: { label: "noteGeneral", icon: "document-text-outline", color: colors.muted },
};

/** Notes the school shared about the selected child: achievements, discipline, health… */
export default function NotesScreen() {
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<SchoolNote[]>(selectedChild ? `/my/children/${selectedChild.id}/notes` : null);

  return (
    <Screen title={t("notes")} subtitle={selectedChild?.fullName} onRefresh={reload} offline={offline} loading={loading && !data}>
      {!data?.length ? (
        <Card><Text style={styles.muted}>{t("noNotes")}</Text></Card>
      ) : (
        data.map((note) => {
          const category = CATEGORY[note.category];
          return (
            <Card key={note.id} style={{ gap: 6 }}>
              <View style={styles.header}>
                <Ionicons name={category.icon} size={18} color={category.color} />
                <Text style={[styles.category, { color: category.color }]}>{t(category.label)}</Text>
                <Text style={[styles.muted, { marginLeft: "auto" }]}>{note.dateBs}</Text>
              </View>
              <Text style={styles.title}>{note.title}</Text>
              {note.body && <Text style={styles.body}>{note.body}</Text>}
              <Text style={styles.muted}>{note.author}</Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  category: { fontSize: 15, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 15 },
});
