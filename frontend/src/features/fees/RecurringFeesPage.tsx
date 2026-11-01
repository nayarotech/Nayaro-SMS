import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";

type Plan = { version: number; automationEnabled: boolean; automationAmount: number | null; automationStartDate: string | null; scheduleStates: { id: string; month: string; status: string; attempts: number; nextAttemptAt: string | null; updatedAt: string; errorMessage: string | null }[]; id: string; name: string; class: { name: string }; section: { name: string } | null; feeStructure: { name: string; amount: number }; academicYear: { name: string }; calendar: "BS" | "AD"; billingDay: number; dueDay: number; active: boolean; defaultMonth: string; runs: Run[] };
type Run = { source: string; id: string; month: string; created: number; skipped: number; total: number; createdAt: string };
type Preview = { version: number; amount: number; feeName: string; month: string; calendar: string; academicYear: string; billingDate: string; dueDate: string; fingerprint: string; completedRun: Run | null; students: { id: string; firstName: string; lastName: string; admissionNo: string; section: string; discount: number; total: number; existingBillId: string | null }[] };
const money = (n: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(n / 100);
function paisa(text: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Enter an amount with at most two decimal places");
  const [whole, fraction = ""] = text.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function RecurringFeesPage() {
  const { t } = useTranslation();
  const { moduleEnabled } = useAuth();
  const client = useQueryClient();
  const enabled = moduleEnabled("fees");
  const plans = useQuery({ queryKey: ["fees", "recurring"], queryFn: () => api.get<Plan[]>("/fees/recurring"), enabled, refetchInterval: 60000 });
  const [creating, setCreating] = useState(false);
  const [authorizing, setAuthorizing] = useState<Plan | null>(null);
  const [reviewing, setReviewing] = useState<Plan | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["fees"] });
  const status = useQuery({ queryKey: ["fees", "schedulerStatus"], queryFn: () => api.get<{ enabled: boolean }>("/fees/recurring/scheduler-status"), enabled });
  const alerts = useQuery({ queryKey: ["fees", "schedulerAlerts"], queryFn: () => api.get<{ id: string; title: string; body: string }[]>("/fees/recurring/alerts"), enabled, refetchInterval: 60000 });
  const dismiss = useMutation({ mutationFn: (id: string) => api.post("/notifications/read", { ids: [id] }), onSuccess: refresh });
  const automaticOff = useMutation({ mutationFn: (id: string) => api.post(`/fees/recurring/${id}/automation`, { enabled: false }), onSuccess: refresh });
  const retry = useMutation({ mutationFn: (id: string) => api.post<{ status: string }>(`/fees/recurring/${id}/retry`), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (p: Plan) => api.patch(`/fees/recurring/${p.id}`, { active: !p.active }), onSuccess: refresh });
  if (!enabled) return <EmptyState title={t("fees.disabled")} />;
  return <div className="space-y-5">
    <PageHeader title={t("fees.recurringTitle")} description={t("fees.recurringHint")} actions={<><Link to="/fees" className="text-sm font-medium text-brand">{t("fees.title")}</Link><Button onClick={() => setCreating(true)}>{t("fees.recurringNew")}</Button></>} />
    <FormError message={[plans.error, toggle.error, status.error, alerts.error, dismiss.error, automaticOff.error, retry.error].filter(Boolean).map(errorMessage).join(" · ")} />
    {status.data?.enabled === false && <p className="rounded bg-amber-50 p-3 text-amber-900">{t("fees.autoWorkerOff")}</p>}
    {alerts.data?.map((alert) => <Card key={alert.id} title={alert.title}><p>{alert.body}</p><Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(alert.id)}>{t("fees.autoDismiss")}</Button></Card>)}
    {retry.data && <p>{t(`fees.autoResult_${retry.data.status}`)}</p>}
    <Card padded={false}><Table loading={plans.isLoading} rows={plans.data} rowKey={(p) => p.id} columns={[
      { header: t("fees.name"), cell: (p) => <>{p.name}<p className="text-xs text-slate-500">{p.feeStructure.name} · {money(p.feeStructure.amount)}</p></> },
      { header: t("fees.bulkClass"), cell: (p) => <>{p.class.name} · {p.section?.name ?? t("fees.bulkAllSections")}<p className="text-xs">{p.academicYear.name}</p></> },
      { header: t("fees.recurringSchedule"), cell: (p) => t("fees.recurringDays", { calendar: p.calendar, billing: p.billingDay, due: p.dueDay }) },
      { header: t("fees.filterStatus"), cell: (p) => t(p.active ? "fees.paymentActive" : "fees.recurringPaused") },
      { header: t("fees.autoMode"), cell: (p) => <div className="space-y-1"><p>{t(p.automationEnabled ? "fees.autoEnabled" : "fees.autoReviewed")}</p>{p.automationEnabled && <><p className="text-xs">{t("fees.autoApproved")}: {money(p.automationAmount ?? 0)}</p><p className="text-xs">{t("fees.autoStart")}: {p.automationStartDate?.slice(0, 10)} AD</p></>}</div> },
      { header: "", cell: (p) => <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!p.active} onClick={() => setReviewing(p)}>{t("fees.recurringReview")}</Button><Button size="sm" variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate(p)}>{t(p.active ? "fees.recurringPause" : "fees.recurringResume")}</Button>
        <Button size="sm" variant="secondary" disabled={!p.active || automaticOff.isPending} onClick={() => setAuthorizing(p)}>{t(p.automationEnabled ? "fees.autoReauthorize" : "fees.autoEnable")}</Button>
        {p.automationEnabled && <Button size="sm" variant="ghost" disabled={automaticOff.isPending} onClick={() => automaticOff.mutate(p.id)}>{t("fees.autoDisable")}</Button>}
      </div> },
    ]} /></Card>
    {plans.data?.filter((p) => p.runs.length).map((p) => <Card key={p.id} title={`${p.name} · ${t("fees.recurringHistory")}`}>
      {p.runs.map((r) => <p key={r.id} className="py-1 text-sm">{r.month} {p.calendar} · {t("fees.bulkResult", { created: r.created, skipped: r.skipped })} · {money(r.total)} · {t(r.source === "AUTOMATIC" ? "fees.autoEnabled" : "fees.autoReviewed")}</p>)}
    </Card>)}
    {plans.data?.filter((p) => p.scheduleStates.length).map((p) => <Card key={`schedule-${p.id}`} title={`${p.name} · ${t("fees.autoLogs")}`}>
      {p.scheduleStates.map((log) => <div key={log.id} className="space-y-1 border-b border-slate-100 py-3">
        <p className="font-medium">{log.month} {p.calendar} · {t(`fees.autoState_${log.status}`)} · {t("fees.autoAttempts", { count: log.attempts })}</p>
        {log.errorMessage && <p className="text-sm text-slate-600">{t("fees.autoLastError")}: {log.errorMessage}</p>}
        {log.nextAttemptAt && log.status === "FAILED" && <p className="text-sm text-slate-500">{t("fees.autoNextRetry")}: {new Date(log.nextAttemptAt).toLocaleString()}</p>}
        {log.status === "FAILED" && log.month === p.defaultMonth && p.active && p.automationEnabled && <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === p.id} disabled={retry.isPending} onClick={() => retry.mutate(p.id)}>{t("fees.autoRetry")}</Button>}
      </div>)}
    </Card>)}
    {authorizing && <AutomationApproval plan={authorizing} onClose={() => setAuthorizing(null)} onSaved={refresh} />}
    {creating && <NewPlan onClose={() => setCreating(false)} onSaved={refresh} />}
    {reviewing && <ReviewPlan plan={reviewing} onClose={() => setReviewing(null)} onSaved={refresh} />}
  </div>;
}

function NewPlan({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState("");
  const options = useQuery({ queryKey: ["fees", "bulkOptions"], queryFn: () => api.get<{ year: { name: string } | null; classes: { id: string; name: string; sections: { id: string; name: string }[] }[] }>("/fees/bulk/options") });
  const structures = useQuery({ queryKey: ["fees", "structures"], queryFn: () => api.get<{ id: string; name: string; amount: number }[]>("/fees/structures") });
  const save = useMutation({ mutationFn: (body: unknown) => api.post("/fees/recurring", body), onSuccess: async () => { await onSaved(); onClose(); } });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    save.mutate({ name: f.get("name"), classId, ...(f.get("sectionId") ? { sectionId: f.get("sectionId") } : {}), feeStructureId: f.get("feeStructureId"), calendar: f.get("calendar"), billingDay: Number(f.get("billingDay")), dueDay: Number(f.get("dueDay")) });
  }
  return <Modal open title={t("fees.recurringNew")} onClose={() => { if (!save.isPending) onClose(); }}>
    <form onSubmit={submit} className="space-y-4">
      <FormError message={[options.error, structures.error, save.error].filter(Boolean).map(errorMessage).join(" · ")} />
      {!options.isLoading && !options.data?.year && <p>{t("fees.bulkNoYear")}</p>}
      <fieldset disabled={save.isPending || !options.data?.year} className="space-y-4">
        <p>{t("fees.bulkYear")}: {options.data?.year?.name}</p>
        <Field label={t("fees.name")}><Input name="name" required minLength={2} maxLength={150} /></Field>
        <Field label={t("fees.bulkClass")}><Select required value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">{t("fees.choose")}</option>{options.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t("fees.bulkSection")}><Select key={classId} name="sectionId"><option value="">{t("fees.bulkAllSections")}</option>{options.data?.classes.find((c) => c.id === classId)?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={t("fees.fee")}><Select name="feeStructureId" required><option value="">{t("fees.choose")}</option>{structures.data?.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.amount)}</option>)}</Select></Field>
        <Field label={t("fees.recurringCalendar")}><Select name="calendar" defaultValue="BS"><option>BS</option><option>AD</option></Select></Field>
        <Field label={t("fees.recurringBillingDay")}><Input name="billingDay" type="number" min="1" max="28" defaultValue="1" required /></Field>
        <Field label={t("fees.recurringDueDay")} hint={t("fees.recurringDayHint")}><Input name="dueDay" type="number" min="1" max="28" defaultValue="10" required /></Field>
        <Button type="submit" loading={save.isPending}>{t("fees.save")}</Button>
      </fieldset>
    </form>
  </Modal>;
}

function ReviewPlan({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(plan.defaultMonth);
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const preview = useMutation({ mutationFn: (month: string) => api.post<Preview>(`/fees/recurring/${plan.id}/preview`, { month }), onSuccess: (data) => { setDiscounts(Object.fromEntries(data.students.map((s) => [s.id, (s.discount / 100).toFixed(2)]))); setError(""); } });
  const issue = useMutation({ mutationFn: () => api.post<Run>(`/fees/recurring/${plan.id}/issue`, { month: preview.data!.month, fingerprint: preview.data!.fingerprint }), onSuccess: async () => { await onSaved(); } });
  const save = useMutation({ mutationFn: (students: { studentId: string; discount: number }[]) => api.put(`/fees/recurring/${plan.id}/discounts`, { students, version: preview.data!.version, expectedAmount: preview.data!.amount }), onSuccess: async () => { await onSaved(); preview.mutate(preview.data!.month); } });
  const busy = preview.isPending || save.isPending || issue.isPending;
  let dirty = false; let valid = true;
  for (const s of preview.data?.students ?? []) { try { const value = paisa(discounts[s.id] ?? "0"); if (value !== s.discount) dirty = true; if (value >= preview.data!.amount) valid = false; } catch { dirty = true; valid = false; } }
  const fresh = preview.data?.students.filter((s) => !s.existingBillId) ?? [];
  const completed = issue.data ?? preview.data?.completedRun;
  function storeDiscounts() { try { setError(""); save.mutate(preview.data!.students.map((s) => ({ studentId: s.id, discount: paisa(discounts[s.id] ?? "0") }))); } catch (e) { setError(errorMessage(e)); } }
  return <Modal open size="xl" title={`${plan.name} · ${t("fees.recurringReview")}`} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4">
      <FormError message={error || [preview.error, save.error, issue.error].filter(Boolean).map(errorMessage).join(" · ")} />
      <p className="text-sm text-slate-600">{t("fees.recurringHint")}</p>
      <form onSubmit={(e) => { e.preventDefault(); issue.reset(); save.reset(); preview.mutate(month); }} className="flex items-end gap-3">
        <Field label={`${t("fees.recurringMonth")} (${plan.calendar})`}><Input value={month} pattern="\d{4}-(0[1-9]|1[0-2])" maxLength={7} required disabled={busy} onChange={(e) => { setMonth(e.target.value); preview.reset(); issue.reset(); }} /></Field>
        <Button type="submit" loading={preview.isPending} disabled={busy}>{t("fees.bulkPreview")}</Button>
      </form>
      {preview.data && !preview.error && <>
        <p>{t("fees.recurringDates", { billing: preview.data.billingDate, due: preview.data.dueDate, year: preview.data.academicYear })}</p>
        <p>{preview.data.feeName} · {money(preview.data.amount)}</p>
        {completed && <p className="rounded bg-green-50 p-3 text-green-800">{t("fees.recurringCompleted")} {t("fees.bulkResult", { created: completed.created, skipped: completed.skipped })} · {money(completed.total)}</p>}
        <p className="text-sm text-slate-500">{t("fees.recurringDiscountHint")}</p>
        <Table rows={preview.data.students} rowKey={(s) => s.id} columns={[
          { header: t("fees.student"), cell: (s) => <>{s.firstName} {s.lastName}<p className="text-xs">{s.admissionNo} · {s.section}</p></> },
          { header: t("fees.discountNpr"), cell: (s) => <Input aria-label={`${t("fees.discountNpr")} ${s.admissionNo}`} type="number" min="0" max={(preview.data!.amount - 1) / 100} step="0.01" value={discounts[s.id] ?? "0"} disabled={busy || !!completed} onChange={(e) => setDiscounts({ ...discounts, [s.id]: e.target.value })} /> },
          { header: t("fees.total"), cell: (s) => money(s.total) },
          { header: t("fees.filterStatus"), cell: (s) => s.existingBillId ? t("fees.bulkExists") : t("fees.recurringReady") },
        ]} />
        {!preview.data.students.length && <p>{t("fees.bulkNoStudents")}</p>}
        {dirty && <p className="text-sm text-amber-800">{t("fees.recurringSaveFirst")}</p>}
        {!valid && <FormError message={t("fees.bulkDiscountError")} />}
        {!completed && <div className="space-y-3">
          <Button variant="secondary" loading={save.isPending} disabled={!dirty || !valid || busy} onClick={storeDiscounts}>{t("fees.recurringSaveDiscounts")}</Button>
          <p className="font-semibold">{t("fees.bulkSelected", { count: fresh.length })} · {t("fees.total")}: {money(fresh.reduce((n, s) => n + s.total, 0))}</p>
          <Button loading={issue.isPending} disabled={dirty || !valid || busy || !preview.data.students.length} onClick={() => issue.mutate()}>{t("fees.bulkConfirm", { count: fresh.length })}</Button>
        </div>}
      </>}
    </div>
  </Modal>;
}


function AutomationApproval({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);
  const save = useMutation({ mutationFn: () => api.post(`/fees/recurring/${plan.id}/automation`, { enabled: true, expectedVersion: plan.version, expectedAmount: plan.feeStructure.amount }), onSuccess: async () => { await onSaved(); onClose(); } });
  return <Modal open title={t("fees.autoEnable")} onClose={() => { if (!save.isPending) onClose(); }}>
    <div className="space-y-4">
      <p className="font-semibold">{plan.name} · {plan.class.name} · {plan.section?.name ?? t("fees.bulkAllSections")}</p>
      <p>{plan.feeStructure.name} · {t("fees.autoApproved")}: {money(plan.feeStructure.amount)}</p>
      <p>{t("fees.recurringDays", { calendar: plan.calendar, billing: plan.billingDay, due: plan.dueDay })} · {plan.academicYear.name}</p>
      <p className="text-sm text-slate-600">{t("fees.autoApprovalHint")}</p>
      {plan.automationEnabled && <p className="text-sm text-amber-900">{t("fees.autoReapprovalHint")}</p>}
      <FormError message={save.error ? errorMessage(save.error) : ""} />
      <Checkbox disabled={save.isPending} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} label={t("fees.autoConfirmLabel")} />
      <Button loading={save.isPending} disabled={!confirmed} onClick={() => save.mutate()}>{t("fees.autoConfirm")}</Button>
    </div>
  </Modal>;
}
