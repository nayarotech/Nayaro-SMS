import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AttachmentPicker, type Uploaded } from "@/components/Attachments";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { PostingOptions } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

/** Share notes, a worksheet photo or a video link with a class, straight from the phone. */
export default function AddMaterialScreen() {
  const { t } = useI18n();
  const { data: options, loading } = useCachedFetch<PostingOptions>("/homework/options");
  const [choice, setChoice] = useState<{ classId: string; subjectId: string } | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [notifyParents, setNotifyParents] = useState(false);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const combos = options?.classes.flatMap((c) => c.subjects.map((s) => ({ classId: c.id, className: c.name, subjectId: s.id, subjectName: s.name }))) ?? [];
  const selected = combos.find((c) => c.classId === choice?.classId && c.subjectId === choice?.subjectId);
  const sections = options?.classes.find((c) => c.id === selected?.classId)?.sections ?? [];

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/materials", {
        classId: selected!.classId,
        subjectId: selected!.subjectId,
        sectionId,
        title,
        description: description || null,
        link: link.trim() || null,
        attachments: files.map((f) => f.key),
        notifyParents,
      });
      setMessage({ text: t("saved2"), ok: true });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/home")), 700);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(selected && title.trim().length >= 2 && (files.length || link.trim() || description.trim()));
  return (
    <Screen
      title={t("addMaterial")}
      loading={loading && !options}
      footer={
        <>
          {message && <Text style={[styles.message, { color: message.ok ? "#15803d" : colors.danger }]}>{message.text}</Text>}
          <Button title={t("saveButton")} onPress={() => void save()} loading={busy} disabled={!ready} />
        </>
      }
    >
      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("whatYouTeach")}</Text>
        <View style={styles.chips}>
          {combos.map((c) => {
            const active = c.classId === choice?.classId && c.subjectId === choice?.subjectId;
            return (
              <Pressable key={`${c.classId}:${c.subjectId}`} onPress={() => { setChoice({ classId: c.classId, subjectId: c.subjectId }); setSectionId(null); }} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && { color: colors.white }]}>{c.subjectName} · {c.className}</Text>
              </Pressable>
            );
          })}
        </View>
        {selected && sections.length > 1 && (
          <>
            <Text style={styles.label}>{t("forSections")}</Text>
            <View style={styles.chips}>
              {[{ id: null, name: t("allSections") }, ...sections.map((s) => ({ id: s.id as string | null, name: `${selected.className} ${s.name}` }))].map((s) => {
                const active = sectionId === s.id;
                return (
                  <Pressable key={s.id ?? "all"} onPress={() => setSectionId(s.id)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && { color: colors.white }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <TextField label={t("titleLabel")} value={title} onChangeText={setTitle} placeholder={t("materialTitleHint")} maxLength={200} />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t("details")}</Text>
          <TextInput value={description} onChangeText={setDescription} multiline style={styles.textarea} maxLength={5000} textAlignVertical="top" />
        </View>
        <TextField label={t("link")} value={link} onChangeText={setLink} placeholder="https://" autoCapitalize="none" keyboardType="url" />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={styles.label}>{t("attachments")}</Text>
        <AttachmentPicker value={files} onChange={setFiles} purpose="material-file" onError={(text) => setMessage({ text, ok: false })} />
      </Card>

      <Pressable onPress={() => setNotifyParents(!notifyParents)} style={styles.toggle} accessibilityRole="checkbox" accessibilityState={{ checked: notifyParents }}>
        <Ionicons name={notifyParents ? "checkbox" : "square-outline"} size={26} color={colors.brand} />
        <Text style={styles.label}>{t("notifyParents")}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 15, fontWeight: "600", color: colors.text },
  textarea: { minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.white },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  message: { fontSize: 15, textAlign: "center" },
});
