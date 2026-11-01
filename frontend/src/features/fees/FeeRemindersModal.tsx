import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormError, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

type Preview = { id: string; title: string; period: string; studentName: string; balance: number; simulated?: boolean; smsConfigured?: boolean; recipients: { userId: string; name: string; lastSentAt: string | null; sentToday: boolean; phone?: string | null; message?: string }[] };
const money = (n: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(n / 100);

export function FeeRemindersModal({ billIds, onClose, onSaved }: { billIds: string[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<"IN_APP" | "SMS">("IN_APP");
  const preview = useQuery({ queryKey: ["fees", "reminderPreview", billIds, channel], queryFn: () => api.post<Preview[]>("/fees/reminders/preview", { billIds, channel }), staleTime: 0 });
  const send = useMutation({ mutationFn: (items: { billId: string; expectedBalance: number; userIds: string[]; expectedPhones?: Record<string, string> }[]) => api.post<{ sent: number; remindedBills: number; skippedRecipients: number; accepted?: number; simulated?: number; failed?: number; unknown?: number }>("/fees/reminders/send", { items, channel }), onSuccess: async () => { await onSaved(); } });
  const items = (preview.data ?? []).filter((b) => b.balance > 0).map((b) => ({ billId: b.id, expectedBalance: b.balance, userIds: b.recipients.filter((r) => !r.sentToday && (channel !== "SMS" || !!r.phone)).map((r) => r.userId), ...(channel === "SMS" ? { expectedPhones: Object.fromEntries(b.recipients.filter((r) => !!r.phone).map((r) => [r.userId, r.phone!])) } : {}) })).filter((b) => b.userIds.length);
  const recipients = items.reduce((sum, b) => sum + b.userIds.length, 0);
  return <Modal open size="lg" title={t("fees.remindTitle")} onClose={() => { if (!send.isPending) onClose(); }}>
    <div className="space-y-4">
      <FormError message={[preview.error, send.error].filter(Boolean).map(errorMessage).join(" · ")} />
      {send.data ? <>
        <p>{t(channel === "SMS" ? "fees.smsResult" : "fees.remindResult", send.data)}</p>
        <Button onClick={onClose}>{t("fees.bulkClose")}</Button>
      </> : <>
        <Field label={t("fees.reminderChannel")}><Select disabled={send.isPending} value={channel} onChange={(e) => { setChannel(e.target.value as "IN_APP" | "SMS"); send.reset(); }}><option value="IN_APP">{t("fees.channelInApp")}</option><option value="SMS">SMS</option></Select></Field>
        <p className="text-sm text-slate-600">{t(channel === "SMS" ? "fees.smsHint" : "fees.remindHint")}</p>
        {channel === "SMS" && preview.data?.[0]?.simulated && <p className="text-sm font-semibold text-amber-800">{t("fees.smsSimulation")}</p>}
        {channel === "SMS" && preview.data?.[0]?.smsConfigured === false && <FormError message={t("fees.smsNotConfigured")} />}
        {preview.isLoading && <p>{t("fees.remindLoading")}</p>}
        {preview.data?.map((bill) => <section key={bill.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="font-semibold">{bill.studentName} · {bill.title} · {bill.period}</p>
          <p>{t("fees.outstanding")}: {money(bill.balance)}</p>
          {bill.balance <= 0 ? <p>{t("fees.remindSettled")}</p> : !bill.recipients.length ? <p>{t("fees.remindNoParents")}</p> : bill.recipients.map((r) => <div key={r.userId} className="space-y-1 text-sm text-slate-600">
            {r.name} - {channel === "SMS" && !r.phone ? t("fees.smsNoPhone") : r.sentToday ? t(channel === "SMS" ? "fees.smsAttemptToday" : "fees.remindToday") : t(channel === "SMS" ? "fees.smsReady" : "fees.remindReady")}
            {channel === "SMS" && r.phone && <p>{r.phone}</p>}
            {channel === "SMS" && r.message && <p className="whitespace-pre-wrap rounded bg-slate-50 p-2">{r.message}</p>}
            {r.lastSentAt && <> · {t("fees.remindLast")}: {new Date(r.lastSentAt).toLocaleString()}</>}
          </div>)}
        </section>)}
        <p className="font-semibold">{t(channel === "SMS" ? "fees.smsCount" : "fees.remindCount", { count: recipients })}</p>
        <Button disabled={!recipients || preview.isFetching || !!preview.error || (channel === "SMS" && (recipients > 50 || preview.data?.[0]?.smsConfigured === false))} loading={send.isPending} onClick={() => send.mutate(items)}>{t(channel === "SMS" ? "fees.smsConfirm" : "fees.remindConfirm")}</Button>
      </>}
    </div>
  </Modal>;
}
