import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { uploadFile, type PickedFile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";
import { colors } from "./ui";


const iconFor = (mimeType: string): keyof typeof Ionicons.glyphMap =>
  mimeType.startsWith("image/") ? "image-outline" : mimeType === "application/pdf" ? "document-text-outline" : "document-outline";

/** Files on a homework or material; tap to open in the browser or viewer. */
export function AttachmentList({ files }: { files: Pick<Attachment, "key" | "name" | "mimeType" | "url">[] }) {
  if (!files.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {files.map((f) => (
        <Pressable key={f.key} onPress={() => void Linking.openURL(f.url)} style={({ pressed }) => [styles.file, pressed && { opacity: 0.7 }]} accessibilityRole="link" accessibilityLabel={f.name}>
          <Ionicons name={iconFor(f.mimeType)} size={22} color={colors.brand} />
          <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
          <Ionicons name="open-outline" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

export interface Uploaded {
  key: string;
  name: string;
  mimeType: string;
}

/** Camera, photo library or a document from the phone. Files upload as soon as they're picked. */
export function AttachmentPicker({ value, onChange, purpose, onError }: { value: Uploaded[]; onChange: (files: Uploaded[]) => void; purpose: "homework-file" | "material-file"; onError: (message: string) => void }) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(0);

  const upload = async (picked: PickedFile[]) => {
    if (!picked.length) return;
    setUploading((n) => n + picked.length);
    const added: Uploaded[] = [];
    for (const file of picked) {
      try {
        const result = await uploadFile(file, purpose);
        added.push({ key: result.key, name: file.name, mimeType: file.mimeType });
      } catch (e) {
        onError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onChange([...value, ...added]);
  };

  const fromImages = (assets: ImagePicker.ImagePickerAsset[]) =>
    assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}-${i + 1}.jpg`, mimeType: a.mimeType ?? "image/jpeg", file: a.file }));

  const camera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled) await upload(fromImages(result.assets));
  };
  const photos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.7 });
    if (!result.canceled) await upload(fromImages(result.assets));
  };
  const document = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ["application/pdf", "image/*", "application/msword", "application/vnd.*", "application/vnd.openxmlformats-officedocument.*"] });
    if (!result.canceled) await upload(result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", file: a.file })));
  };

  return (
    <View style={{ gap: 10 }}>
      {value.map((f) => (
        <View key={f.key} style={styles.file}>
          <Ionicons name={iconFor(f.mimeType)} size={22} color={colors.brand} />
          <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
          <Pressable onPress={() => onChange(value.filter((x) => x.key !== f.key))} hitSlop={10} accessibilityLabel={`Remove ${f.name}`}>
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ))}
      {uploading > 0 && (
        <View style={styles.uploading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={{ color: colors.muted, fontSize: 15 }}>{t("uploading")}</Text>
        </View>
      )}
      <View style={styles.buttons}>
        <PickButton icon="camera-outline" label={t("camera")} onPress={() => void camera()} />
        <PickButton icon="images-outline" label={t("photos")} onPress={() => void photos()} />
        <PickButton icon="document-attach-outline" label={t("file")} onPress={() => void document()} />
      </View>
    </View>
  );
}

function PickButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pick, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={styles.pickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  file: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  fileName: { flex: 1, fontSize: 15, color: colors.text },
  uploading: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttons: { flexDirection: "row", gap: 8 },
  pick: { flex: 1, height: 64, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", gap: 2 },
  pickText: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
