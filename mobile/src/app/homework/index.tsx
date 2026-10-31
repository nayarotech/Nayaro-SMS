import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AttachmentList } from "@/components/Attachments";
import { ChildSwitcher } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { todayInNepal } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { addDays, HOMEWORK_STATUS } from "@/lib/homework";
import type { ChildHomework } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

/** The selected child's homework: what's due next, and what was done. */
export default function HomeworkScreen() {
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const { data, offline, loading, reload } = useCachedFetch<ChildHomework[]>(selectedChild ? `/my/children/${selectedChild.id}/homework?when=${when}` : null);
  const [today] = useState(todayInNepal);
  const tomorrow = addDays(today, 1);

  return (
    <Screen title={t("homework")} subtitle={selectedChild?.fullName} onRefresh={reload} offline={offline} loading={loading && !data}>
      <ChildSwitcher />
      <View style={styles.segment}>
        {(["upcoming", "past"] as const).map((w) => (
          <Pressable key={w} onPress={() => setWhen(w)} style={[styles.option, when === w && styles.optionActive]} accessibilityRole="tab" accessibilityState={{ selected: when === w }}>
            <Text style={[styles.optionText, when === w && { color: colors.text }]}>{t(w)}</Text>
          </Pressable>
        ))}
      </View>

      {!data?.length ? (
        <Card><Text style={styles.muted}>{t("noHomework")}</Text></Card>
      ) : (
        data.map((h) => {
          const status = h.status ? HOMEWORK_STATUS[h.status] : null;
          const due = h.dueDate === today ? t("dueToday") : h.dueDate === tomorrow ? t("dueTomorrow") : `${t("due")} ${h.dueDateBs}`;
          return (
            <Card key={h.id} style={{ gap: 8 }}>
              <View style={styles.header}>
                <Text style={styles.subject}>{h.subject.name}</Text>
                <Text style={[styles.due, h.dueDate === today && { color: "#b45309" }]}>{due}</Text>
              </View>
              <Text style={styles.title}>{h.title}</Text>
              {h.description ? <Text style={styles.body}>{h.description}</Text> : null}
              <AttachmentList files={h.attachments} />
              <View style={styles.footer}>
                <Text style={styles.muted}>{h.teacher}</Text>
                {status ? (
                  <Text style={[styles.badge, { color: status.color, backgroundColor: status.soft }]}>{t(status.label)}</Text>
                ) : when === "past" ? (
                  <Text style={styles.muted}>{t("notChecked")}</Text>
                ) : null}
              </View>
              {h.remark ? <Text style={[styles.body, { color: "#b91c1c" }]}>{h.remark}</Text> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", backgroundColor: colors.border, borderRadius: 12, padding: 3 },
  option: { flex: 1, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionActive: { backgroundColor: colors.white },
  optionText: { fontSize: 16, fontWeight: "600", color: colors.muted },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  subject: { fontSize: 14, fontWeight: "700", color: colors.brand, backgroundColor: colors.brandSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: "hidden" },
  due: { fontSize: 15, fontWeight: "600", color: colors.text },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 23 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  badge: { fontSize: 14, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: "hidden" },
  muted: { color: colors.muted, fontSize: 15 },
});
