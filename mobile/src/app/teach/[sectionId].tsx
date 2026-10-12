import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, confirmAction } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { todayInNepal } from "@/lib/dates";
import { formatBs, useI18n } from "@/lib/i18n";
import { useCachedFetch } from "@/lib/use-cached";

type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

interface SectionDay {
  section: { id: string; name: string; className: string };
  date: string;
  dateBs: string;
  isWorkingDay: boolean;
  access: { canMark: boolean; asProxy: boolean; reason: string | null };
  taken: { by: string; asProxy: boolean; at: string } | null;
  students: { studentId: string; name: string; rollNo: number | null; photoUrl: string | null; status: Status | null; remark: string | null }[];
}

const STATUSES: { value: Status; short: "statusP" | "statusA" | "statusL" | "statusLv"; label: "present" | "absent" | "late" | "leave"; color: string; soft: string }[] = [
  { value: "PRESENT", short: "statusP", label: "present", color: "#15803d", soft: "#dcfce7" },
  { value: "ABSENT", short: "statusA", label: "absent", color: "#dc2626", soft: "#fee2e2" },
  { value: "LATE", short: "statusL", label: "late", color: "#b45309", soft: "#fef3c7" },
  { value: "LEAVE", short: "statusLv", label: "leave", color: "#1d4ed8", soft: "#dbeafe" },
];

/** Today's attendance for one section: big tap targets, "everyone else present", and a fixed Save bar. */
export default function TakeAttendanceScreen() {
  const { sectionId } = useLocalSearchParams<{ sectionId: string }>();
  // The date is part of the path so the offline copy is per day (never yesterday's list saved as today)
  const [today] = useState(todayInNepal);
  const { data, offline, loading, error, reload } = useCachedFetch<SectionDay>(`/attendance/sections/${sectionId}?date=${today}`);

  return data ? (
    // Remount when fresh data arrives so the marks start from what's saved
    <Marking key={`${data.date}:${data.taken?.at ?? "new"}`} day={data} offline={offline} reload={reload} />
  ) : (
    <Screen title="" loading={loading} onRefresh={reload} offline={offline}>
      <Card><Text style={styles.muted}>{error ?? ""}</Text></Card>
    </Screen>
  );
}

function Marking({ day, offline, reload }: { day: SectionDay; offline: boolean; reload: () => Promise<void> }) {
  const { t, language } = useI18n();
  const [marks, setMarks] = useState<Record<string, Status | null>>(() => Object.fromEntries(day.students.map((s) => [s.studentId, s.status])));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const editable = day.access.canMark;

  const set = (studentId: string, status: Status) => {
    setMessage(null);
    setMarks((m) => ({ ...m, [studentId]: status }));
  };
  const unmarked = day.students.filter((s) => !marks[s.studentId]).length;
  const changed = day.students.some((s) => marks[s.studentId] !== s.status);
  const counts = Object.fromEntries(STATUSES.map((s) => [s.value, day.students.filter((x) => marks[x.studentId] === s.value).length])) as Record<Status, number>;

  /** Review before saving: who is absent or on leave (their parents get a message). */
  const review = async () => {
    const names = (status: Status) => day.students.filter((x) => marks[x.studentId] === status).map((x) => x.name);
    const absent = names("ABSENT");
    const leave = names("LEAVE");
    const lines = [
      absent.length ? t("reviewAbsent").replace("{count}", String(absent.length)).replace("{names}", absent.join(", ")) : t("reviewAllPresent"),
      leave.length ? t("reviewLeave").replace("{names}", leave.join(", ")) : "",
    ].filter(Boolean);
    const title = t("reviewTitle").replace("{section}", `${day.section.className} ${day.section.name}`);
    if (await confirmAction(`${title}\n\n${lines.join("\n")}`, { ok: day.taken ? t("saveChanges") : t("save"), cancel: t("cancel") })) await save();
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/attendance/sections/${day.section.id}`, {
        date: day.date,
        records: day.students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId]!, remark: s.remark })),
      });
      setMessage({ text: t("attendanceSaved"), ok: true });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/home")), 900);
    } catch (e) {
      setMessage({ text: e instanceof ApiError && e.code === "OFFLINE" ? t("noInternetKept") : e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const footer = editable ? (
    <>
      {message && <Text style={[styles.message, { color: message.ok ? "#15803d" : colors.danger }]}>{message.text}</Text>}
      {unmarked > 0 && (
        <Button variant="ghost" title={`${t("markAllPresent")} (${unmarked})`} onPress={() => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, s]) => [id, s ?? "PRESENT"])))} />
      )}
      <Button
        title={unmarked > 0 ? t("markAllToSave") : day.taken ? t("saveChanges") : t("save")}
        onPress={() => void review()}
        loading={saving}
        disabled={unmarked > 0 || (Boolean(day.taken) && !changed)}
      />
    </>
  ) : null;

  return (
    <Screen
      title={`${day.section.className} ${day.section.name}`}
      subtitle={`${formatBs(day.date, language)}${day.access.asProxy ? ` · ${t("proxy")}` : ""}`}
      onRefresh={reload}
      offline={offline}
      footer={footer}
    >
      {!day.isWorkingDay && <Banner icon="sunny-outline" text={t("holiday")} tone="amber" />}
      {!editable && <Banner icon="lock-closed-outline" text={`${t("readOnly")}${day.access.reason ? ` — ${day.access.reason}` : ""}`} tone="gray" />}
      {day.taken && <Banner icon="checkmark-circle-outline" text={`${t("takenBy")} ${day.taken.by}${day.taken.asProxy ? ` (${t("proxy")})` : ""}`} tone="green" />}

      <Card style={styles.summary}>
        {STATUSES.map((s) => (
          <View key={s.value} style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: s.color }]}>{counts[s.value]}</Text>
            <Text style={styles.muted}>{t(s.label)}</Text>
          </View>
        ))}
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: unmarked ? colors.text : colors.muted }]}>{unmarked}</Text>
          <Text style={styles.muted}>{t("toMark")}</Text>
        </View>
      </Card>
      {editable && !day.taken && <Text style={styles.hint}>{t("markHint")}</Text>}

      <Card style={styles.roster}>
        {day.students.map((student, index) => {
          const current = marks[student.studentId];
          const active = STATUSES.find((x) => x.value === current);
          const [first, ...rest] = student.name.split(" ");
          return (
            <View key={student.studentId} style={[styles.row, index > 0 && styles.divider, { borderLeftColor: active?.color ?? "transparent" }, active && active.value !== "PRESENT" && { backgroundColor: active.soft }]}>
              {student.photoUrl ? (
                <Image source={{ uri: student.photoUrl }} style={styles.avatar} />
              ) : (
                <Text style={styles.rollText}>{student.rollNo ?? "–"}</Text>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{first}</Text>
                <Text style={[styles.surname, active && active.value !== "PRESENT" && { color: active.color, fontWeight: "700" }]} numberOfLines={1}>
                  {active && active.value !== "PRESENT" ? t(active.label) : rest.join(" ") || (active ? "" : t("notMarked"))}
                </Text>
              </View>
              {editable ? (
                <View style={styles.choices}>
                  {STATUSES.map((x) => {
                    const selected = current === x.value;
                    return (
                      <Pressable
                        key={x.value}
                        onPress={() => set(student.studentId, x.value)}
                        style={({ pressed }) => [styles.choice, selected && { backgroundColor: x.color, borderColor: x.color }, pressed && { opacity: 0.7 }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${student.name}: ${t(x.label)}`}
                      >
                        <Text style={[styles.choiceText, { color: selected ? colors.white : x.color }]}>{t(x.short)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.readOnlyStatus, { color: active?.color ?? colors.muted }]}>{active ? t(active.label) : "—"}</Text>
              )}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

function Banner({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone: "amber" | "gray" | "green" }) {
  const palette = { amber: ["#fffbeb", "#92400e"], gray: ["#f1f5f9", "#334155"], green: ["#f0fdf4", "#166534"] }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette[0] }]}>
      <Ionicons name={icon} size={18} color={palette[1]} />
      <Text style={{ color: palette[1], flex: 1, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 15 },
  hint: { color: colors.muted, fontSize: 15, textAlign: "center" },
  message: { fontSize: 15, textAlign: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryValue: { fontSize: 22, fontWeight: "800" },
  roster: { padding: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingRight: 10, paddingLeft: 8, borderLeftWidth: 4, minHeight: 64 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  rollText: { width: 32, textAlign: "center", color: colors.brand, fontWeight: "800", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  surname: { fontSize: 14, color: colors.muted },
  choices: { flexDirection: "row", gap: 6 },
  choice: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  choiceText: { fontSize: 16, fontWeight: "800" },
  readOnlyStatus: { fontWeight: "700", fontSize: 15 },
});
