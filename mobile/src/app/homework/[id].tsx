import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AttachmentList } from "@/components/Attachments";
import { Screen } from "@/components/Screen";
import { Button, Card, colors } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { HOMEWORK_STATUS } from "@/lib/homework";
import { formatBs, useI18n } from "@/lib/i18n";
import type { Attachment, HomeworkStatus } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

interface Roster {
  homework: { id: string; title: string; description: string | null; dueDate: string; subject: { name: string }; section: { className: string; name: string }; attachments: Attachment[] };
  students: { studentId: string; name: string; rollNo: number | null; status: HomeworkStatus | null; remark: string | null }[];
}

const SHORT: Record<HomeworkStatus, string> = { DONE: "✓", PARTIAL: "½", NOT_DONE: "✗" };

/** Tick who did the homework. Parents are told when it wasn't done. */
export default function CheckHomeworkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, offline, error, reload } = useCachedFetch<Roster>(`/homework/${id}/checks`);
  if (!data) {
    return (
      <Screen title="" loading={loading} offline={offline} onRefresh={reload}>
        <Card><Text style={styles.muted}>{error ?? ""}</Text></Card>
      </Screen>
    );
  }
  return <Checklist key={id} roster={data} />;
}

function Checklist({ roster }: { roster: Roster }) {
  const { t, language } = useI18n();
  const { homework } = roster;
  const [rows, setRows] = useState(() => Object.fromEntries(roster.students.map((s) => [s.studentId, { status: s.status, remark: s.remark ?? "" }])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (studentId: string, change: Partial<{ status: HomeworkStatus | null; remark: string }>) => setRows((r) => ({ ...r, [studentId]: { ...r[studentId], ...change } }));
  const unchecked = roster.students.filter((s) => !rows[s.studentId].status).length;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.put(`/homework/${homework.id}/checks`, { checks: roster.students.map((s) => ({ studentId: s.studentId, status: rows[s.studentId].status, remark: rows[s.studentId].remark || null })) });
      setMessage({ text: t("saved2"), ok: true });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/home")), 700);
    } catch (e) {
      setMessage({ text: e instanceof ApiError && e.code === "OFFLINE" ? t("noInternetKept") : e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t("checkHomework")}
      subtitle={`${homework.subject.name} · ${homework.section.className} ${homework.section.name}`}
      footer={
        <>
          {message && <Text style={[styles.message, { color: message.ok ? "#15803d" : colors.danger }]}>{message.text}</Text>}
          {unchecked > 0 && (
            <Button variant="ghost" title={`${t("markAllDone")} (${unchecked})`} onPress={() => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, status: row.status ?? "DONE" }])))} />
          )}
          <Button title={t("saveButton")} onPress={() => void save()} loading={busy} />
        </>
      }
    >
      <Card style={{ gap: 6 }}>
        <Text style={styles.title}>{homework.title}</Text>
        <Text style={styles.muted}>{t("due")} {formatBs(homework.dueDate, language)}</Text>
        {homework.description ? <Text style={styles.body}>{homework.description}</Text> : null}
        <AttachmentList files={homework.attachments} />
      </Card>

      <Card style={styles.roster}>
        {roster.students.map((s, index) => {
          const row = rows[s.studentId];
          const active = row.status ? HOMEWORK_STATUS[row.status] : null;
          const [first, ...rest] = s.name.split(" ");
          return (
            <View key={s.studentId} style={[styles.row, index > 0 && styles.divider, { borderLeftColor: active?.color ?? "transparent" }]}>
              <View style={styles.line}>
                <Text style={styles.roll}>{s.rollNo ?? "–"}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{first}</Text>
                  <Text style={[styles.surname, active && { color: active.color, fontWeight: "700" }]} numberOfLines={1}>{active ? t(active.label) : rest.join(" ")}</Text>
                </View>
                <View style={styles.choices}>
                  {(Object.keys(HOMEWORK_STATUS) as HomeworkStatus[]).map((status) => {
                    const selected = row.status === status;
                    const c = HOMEWORK_STATUS[status];
                    return (
                      <Pressable
                        key={status}
                        onPress={() => set(s.studentId, { status: selected ? null : status })}
                        style={({ pressed }) => [styles.choice, selected && { backgroundColor: c.color, borderColor: c.color }, pressed && { opacity: 0.7 }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${s.name}: ${t(c.label)}`}
                      >
                        <Text style={[styles.choiceText, { color: selected ? colors.white : c.color }]}>{SHORT[status]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {row.status && row.status !== "DONE" && (
                <TextInput value={row.remark} onChangeText={(remark) => set(s.studentId, { remark })} placeholder={t("noteForParents")} placeholderTextColor="#94a3b8" style={styles.remark} maxLength={200} />
              )}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 23 },
  message: { fontSize: 15, textAlign: "center" },
  roster: { padding: 0, overflow: "hidden" },
  row: { gap: 8, paddingVertical: 8, paddingRight: 10, paddingLeft: 8, borderLeftWidth: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  roll: { width: 32, textAlign: "center", color: colors.brand, fontWeight: "800", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  surname: { fontSize: 14, color: colors.muted },
  choices: { flexDirection: "row", gap: 6 },
  choice: { width: 48, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  choiceText: { fontSize: 20, fontWeight: "800" },
  remark: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: colors.text, marginLeft: 42 },
});
