import type { ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";

/** Shared look for the app. Colours are kept here so they're easy to change. */
export const colors = {
  brand: "#2563eb",
  brandSoft: "#eff4ff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  background: "#f8fafc",
  danger: "#dc2626",
  white: "#ffffff",
};

export function Button({ title, onPress, loading, variant = "primary", disabled }: { title: string; onPress: () => void; loading?: boolean; variant?: "primary" | "ghost"; disabled?: boolean }) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonGhost, (pressed || disabled) && { opacity: 0.6 }]}
    >
      {loading ? <ActivityIndicator color={primary ? colors.white : colors.brand} /> : <Text style={[styles.buttonText, !primary && { color: colors.brand }]}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#94a3b8" style={styles.input} {...props} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>;
}

const styles = StyleSheet.create({
  button: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonGhost: { backgroundColor: "transparent" },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  label: { fontSize: 14, fontWeight: "500", color: colors.text },
  input: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, backgroundColor: colors.white, color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
});

/** Yes/no question: a native dialog on phones, the browser's confirm on web. */
export function confirmAction(message: string, labels: { ok: string; cancel: string }): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(message, undefined, [
      { text: labels.cancel, style: "cancel", onPress: () => resolve(false) },
      { text: labels.ok, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
