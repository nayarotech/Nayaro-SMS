import { useState } from "react";
import { api } from "@/lib/api";
import { useLocalSearchParams } from "expo-router";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, ErrorText } from "@/components/ui";
import { formatFee, type ChildFeeDetail } from "@/lib/fees";
import { formatBs, useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useCachedFetch } from "@/lib/use-cached";

export default function BillScreen() {
  const { id, childId } = useLocalSearchParams<{ id: string; childId: string }>();
  const { me, children } = useSession();
  const { t } = useI18n();
  const child = children.find((c) => c.id === childId);
  if (me?.settings?.["modules.fees"] === false || !child || !id) return <Screen title={t("feeDetails")}><Card><Text>{t(child ? "feeDisabled" : "noChildren")}</Text></Card></Screen>;
  return <BillDetail key={`${childId}/${id}`} id={id} childId={child.id} name={child.fullName} />;
}

function BillDetail({ id, childId, name }: { id: string; childId: string; name: string }) {
  const { t, language } = useI18n();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  async function openReceipt(paymentId: string) {
    // Reserve the web tab before awaiting the API to avoid popup blockers.
    const tab = Platform.OS === "web" ? window.open("about:blank", "_blank") : null;
    setDownloading(paymentId);
    setDownloadError(null);
    try {
      const { url } = await api.post<{ url: string }>(`/my/children/${childId}/fees/${id}/payments/${paymentId}/receipt-link`);
      if (tab) tab.location.href = url;
      else await Linking.openURL(url);
    } catch (error) {
      tab?.close();
      setDownloadError(error instanceof Error ? error.message : t("feeReceiptFailed"));
    } finally { setDownloading(null); }
  }
  const { data, offline, loading, error, reload } = useCachedFetch<ChildFeeDetail>(`/my/children/${encodeURIComponent(childId)}/fees/${encodeURIComponent(id)}`);
  return <Screen title={t("feeDetails")} subtitle={name} offline={offline} onRefresh={reload} loading={loading && !data}>
    <ErrorText message={error} />
    {error && <Button title={t("feeRetry")} onPress={() => void reload()} variant="ghost" />}
    {offline && <Text style={styles.muted}>{t("feeOfflineHint")}</Text>}
    {data && !error && <>
      <Card style={{ gap: 10 }}>
        <Text style={styles.heading}>{data.title}</Text>
        <Text style={styles.muted}>{t("feePeriod")}: {data.period}</Text>
        <Text style={styles.muted}>{t("feeDue")}: {formatBs(data.dueDate, language)}</Text>
        {([ ["feeAmount", data.amount], ["feeDiscount", data.discount], ["feeFine", data.fine], ["feeTotal", data.total], ["feePaid", data.paid], ["feeOutstanding", data.balance] ] as const).map(([label, value]) => <View key={label} style={styles.row}><Text>{t(label)}</Text><Text style={styles.value}>{formatFee(value, language)}</Text></View>)}
      </Card>
      <Text style={styles.heading}>{t("feePayments")}</Text>
      <ErrorText message={downloadError} />
      {!data.payments.length && <Card><Text style={styles.muted}>{t("feeNoPayments")}</Text></Card>}
      {data.payments.map((payment) => <Card key={payment.id} style={{ gap: 8 }}>
        {payment.reversedAt && <View style={{ gap: 4 }}><Text style={{ color: colors.danger, fontWeight: "700" }}>{t("feeReversed")} · {formatBs(payment.reversedAt, language)}</Text><Text style={styles.muted}>{payment.reversalReason}</Text></View>}
        <Text style={styles.heading}>{formatFee(payment.amount, language)}</Text>
        <Text style={styles.muted}>{formatBs(payment.createdAt, language)} · {t(payment.method === "CASH" ? "feeCash" : payment.method === "BANK" ? "feeBank" : "feeOther")}</Text>
        <Text selectable style={styles.muted}>{t("feeReceipt")}: {payment.id}</Text>
        {payment.reference && <Text selectable style={styles.muted}>{t("feeReference")}: {payment.reference}</Text>}
        <Button title={t("feeDownloadReceipt")} variant="ghost" loading={downloading === payment.id} disabled={offline || downloading !== null} onPress={() => void openReceipt(payment.id)} />
      </Card>)}
      {data.balance > 0 && <Text style={styles.muted}>{t("feeContactSchool")}</Text>}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: "700", color: colors.text },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  value: { fontWeight: "600", color: colors.text },
});
