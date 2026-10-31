import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AttachmentPicker, type Uploaded } from "@/components/Attachments";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { todayInNepal } from "@/lib/dates";
import { addDays } from "@/lib/homework";
import { formatBs, useI18n } from "@/lib/i18n";
import type { PostingOptions } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

/** Post homework from the phone: pick the class, write it, attach a photo of the page, choose the due date. */
export default function PostHomeworkScreen() {
  const { t, language } = useI18n();
  const { data: options, loading } = useCachedFetch<PostingOptions>("/homework/options");
  const [today] = useState(todayInNepal);
  const [choice, setChoice] = useState<{ classId: string; subjectId: string } | null>(null);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(() => addDays(todayInNepal(), 1));
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Every subject the teacher teaches, per class ("Maths · Grade 6")
  const combos = options?.classes.flatMap((c) => c.subjects.map((s) => ({ classId: c.id, className: c.name, subjectId: s.id, subjectName: s.name, sectionIds: s.sectionIds }))) ?? [];
  const selected = combos.find((c) => c.classId === choice?.classId && c.subjectId === choice?.subjectId);
  const sections = options?.classes.find((c) => c.id === selected?.classId)?.sections.filter((s) => selected?.sectionIds.includes(s.id)) ?? [];
  const pick = (combo: (typeof combos)[number]) => {
    setChoice({ classId: combo.classId, subjectId: combo.subjectId });
    setSectionIds(combo.sectionIds);
  };

  const post = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/homework", { sectionIds, subjectId: selected!.subjectId, title, description: description || null, dueDate, attachments: files.map((f) => f.key) });
      setMessage({ text: t("posted"), ok: true });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/home")), 900);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(selected && sectionIds.length && title.trim().length >= 2 && dueDate);
  const QUICK = [
    { label: t("tomorrow"), days: 1 },
    { label: t("inDays").replace("{n}", "2"), days: 2 },
    { label: t("inDays").replace("{n}", "3"), days: 3 },
    { label: t("nextWeek"), days: 7 },
  ];

  return (
    <Screen
      title={t("postHomework")}
      loading={loading && !options}
      footer={
        <>
          {message && <Text style={[styles.message, { color: message.ok ? "#15803d" : colors.danger }]}>{message.text}</Text>}
          <Button title={t("post")} onPress={() => void post()} loading={busy} disabled={!ready} />
        </>
      }
    >
      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("whatYouTeach")}</Text>
        <View style={styles.chips}>
          {combos.map((c) => {
            const active = c.classId === choice?.classId && c.subjectId === choice?.subjectId;
            return (
              <Pressable key={`${c.classId}:${c.subjectId}`} onPress={() => pick(c)} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
                <Text style={[styles.chipText, active && { color: colors.white }]}>{c.subjectName} · {c.className}</Text>
              </Pressable>
            );
          })}
        </View>
        {sections.length > 1 && (
          <>
            <Text style={styles.label}>{t("sectionsLabel")}</Text>
            <View style={styles.chips}>
              {sections.map((s) => {
                const active = sectionIds.includes(s.id);
                return (
                  <Pressable key={s.id} onPress={() => setSectionIds(active ? sectionIds.filter((id) => id !== s.id) : [...sectionIds, s.id])} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
                    <Text style={[styles.chipText, active && { color: colors.white }]}>{selected?.className} {s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <TextField label={t("homeworkTitle")} value={title} onChangeText={setTitle} placeholder={t("homeworkTitleHint")} maxLength={200} />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t("details")}</Text>
          <TextInput value={description} onChangeText={setDescription} multiline style={styles.textarea} placeholderTextColor="#94a3b8" maxLength={5000} textAlignVertical="top" />
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("dueDate")}</Text>
        <View style={styles.chips}>
          {QUICK.map((q) => {
            const value = addDays(today, q.days);
            const active = dueDate === value;
            return (
              <Pressable key={q.days} onPress={() => setDueDate(value)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && { color: colors.white }]}>{q.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.stepper}>
          <Pressable onPress={() => dueDate > today && setDueDate(addDays(dueDate, -1))} style={styles.step} hitSlop={6} accessibilityLabel="Previous day">
            <Text style={styles.stepText}>‹</Text>
          </Pressable>
          <Text style={styles.date}>{formatBs(dueDate, language)}</Text>
          <Pressable onPress={() => setDueDate(addDays(dueDate, 1))} style={styles.step} hitSlop={6} accessibilityLabel="Next day">
            <Text style={styles.stepText}>›</Text>
          </Pressable>
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("attachments")}</Text>
        <AttachmentPicker value={files} onChange={setFiles} purpose="homework-file" onError={(text) => setMessage({ text, ok: false })} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 15, fontWeight: "600", color: colors.text },
  textarea: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.white },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 6 },
  step: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 30, color: colors.brand, lineHeight: 34 },
  date: { fontSize: 18, fontWeight: "700", color: colors.text },
  message: { fontSize: 15, textAlign: "center" },
});
