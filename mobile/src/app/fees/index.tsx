import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChildSwitcher } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, ErrorText } from "@/components/ui";
import { todayInNepal } from "@/lib/dates";
import { formatFee, type ChildFees } from "@/lib/fees";
import { formatBs, useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useCachedFetch } from "@/lib/use-cached";

export default function FeesScreen() {
  const { selectedChild, me } = useSession();
  const { t } = useI18n();
  if (me?.settings?.["modules.fees"] === false || !selectedChild) return <Screen title={t("fees")}><Card><Text>{t(selectedChild ? "feeDisabled" : "noChildren")}</Text></Card></Screen>;
  // Remount on child changes so another child's balances can never flash here.
  return <ChildFeesScreen key={selectedChild.id} childId={selectedChild.id} name={selectedChild.fullName} />;
}

function ChildFeesScreen({ childId, name }: { childId: string; name: string }) {
  const [page, setPage] = useState(1);
  return <FeesPage key={page} childId={childId} name={name} page={page} onPage={setPage} />;
}

function FeesPage({ childId, name, page, onPage }: { childId: string; name: string; page: number; onPage: (page: number) => void }) {
  const { t, language } = useI18n();
  const { data, offline, loading, error, reload } = useCachedFetch<ChildFees>(`/my/children/${childId}/fees?page=${page}`);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  return <Screen title={t("fees")} subtitle={name} onRefresh={reload} offline={offline} loading={loading && !data}>
    <ChildSwitcher />
    <ErrorText message={error} />
    {error && <Button title={t("feeRetry")} onPress={() => void reload()} variant="ghost" />}
    {offline && <Text style={styles.muted}>{t("feeOfflineHint")}</Text>}
    {data && !error && <>
      <Card style={{ gap: 10 }}>
        <Text style={styles.heading}>{t("feeOutstanding")}</Text>
        <Text style={styles.balance}>{formatFee(data.summary.outstanding, language)}</Text>
        <Text style={styles.muted}>{t("feeBilled")}: {formatFee(data.summary.billed, language)} · {t("feePaid")}: {formatFee(data.summary.paid, language)}</Text>
        <Text style={styles.muted}>{t("feeSummaryHint")}</Text>
      </Card>
      {!data.items.length && <Card><Text style={styles.muted}>{t("feeNoBills")}</Text></Card>}
      {data.items.map((bill) => {
        const overdue = bill.balance > 0 && bill.dueDate.slice(0, 10) < todayInNepal();
        return <Pressable key={bill.id} accessibilityRole="button" accessibilityLabel={`${bill.title} · ${t("feeDetails")}`} onPress={() => router.push({ pathname: "/fees/[id]", params: { id: bill.id, childId } })}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.heading}>{bill.title}</Text>
            <Text style={styles.muted}>{t("feePeriod")}: {bill.period}</Text>
            <Text style={styles.muted}>{t("feeDue")}: {formatBs(bill.dueDate, language)}</Text>
            <Text style={[styles.status, { color: overdue ? colors.danger : colors.brand }]}>{t(bill.balance === 0 ? "feeSettled" : bill.paid > 0 ? "feePartial" : "feeUnpaid")}{overdue ? ` · ${t("feeOverdue")}` : ""}</Text>
            <Text>{t("feeTotal")}: {formatFee(bill.total, language)} · {t("feeOutstanding")}: {formatFee(bill.balance, language)}</Text>
            <Text style={{ color: colors.brand }}>{t("feeDetails")} →</Text>
          </Card>
        </Pressable>;
      })}
      {pages > 1 && <View style={{ gap: 8 }}>
        <Text style={styles.muted}>{t("feePage").replace("{page}", String(page)).replace("{pages}", String(pages))}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Button title={t("feePrevious")} variant="ghost" disabled={page <= 1} onPress={() => onPage(page - 1)} />
          <Button title={t("feeNext")} variant="ghost" disabled={page >= pages} onPress={() => onPage(page + 1)} />
        </View>
      </View>}
      <Text style={styles.muted}>{t("feeContactSchool")}</Text>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: "700", color: colors.text },
  balance: { fontSize: 28, fontWeight: "800", color: colors.brand },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  status: { fontSize: 14, fontWeight: "700" },
});
