import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Table } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { todayAd } from "@/lib/dates";
import { errorMessage } from "@/lib/forms";

type Config = { classId: string; sectionId?: string; feeStructureId: string; period: string; dueDate: string; fine: number };
type Preview = { year: { id: string; name: string }; amount: number; students: { id: string; firstName: string; lastName: string; admissionNo: string; section: string; rollNo: number | null; existingBillId: string | null }[] };
const money = (value: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(value / 100);
function paisa(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Enter a valid amount with at most two decimal places");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function BulkBillingModal({ structures, onClose, onSaved }: { structures: { id: string; name: string; amount: number }[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const options = useQuery({ queryKey: ["fees", "bulkOptions"], queryFn: () => api.get<{ year: { id: string; name: string } | null; classes: { id: string; name: string; sections: { id: string; name: string }[] }[] }>("/fees/bulk/options") });
  const [classId, setClassId] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const preview = useMutation({ mutationFn: (body: Config) => api.post<Preview>("/fees/bulk/preview", body), onSuccess: (data, body) => {
    setConfig(body); setSelected(Object.fromEntries(data.students.map((s) => [s.id, !s.existingBillId]))); setDiscounts({}); setError("");
  } });
  const issue = useMutation({ mutationFn: (body: Config & { academicYearId: string; expectedAmount: number; students: { studentId: string; discount: number }[] }) => api.post<{ created: number; skipped: number; total: number }>("/fees/bulk/issue", body), onSuccess: async () => { await onSaved(); } });
  const busy = preview.isPending || issue.isPending;
  const rows = preview.data?.students.filter((s) => selected[s.id] && !s.existingBillId) ?? [];
  let total = 0;
  let valid = true;
  for (const row of rows) {
    try {
      const discount = paisa(discounts[row.id] ?? "0");
      const amount = preview.data!.amount;
      const value = amount - discount + config!.fine;
      if (discount > amount || value <= 0 || value > 1_000_000_000) valid = false;
      total += value;
    } catch { valid = false; }
  }
  function loadPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    try { preview.mutate({ classId, ...(form.get("sectionId") ? { sectionId: String(form.get("sectionId")) } : {}), feeStructureId: String(form.get("feeStructureId")), period: String(form.get("period")), dueDate: String(form.get("dueDate")), fine: paisa(String(form.get("fine"))) }); }
    catch (e) { setError(errorMessage(e)); }
  }
  function confirm() {
    if (!valid || !config || !preview.data || !rows.length) return;
    issue.mutate({ ...config, academicYearId: preview.data.year.id, expectedAmount: preview.data.amount, students: rows.map((row) => ({ studentId: row.id, discount: paisa(discounts[row.id] ?? "0") })) });
  }
  return <Modal open size="xl" title={t("fees.bulkTitle")} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4">
      <FormError message={error || [options.error, preview.error, issue.error].filter(Boolean).map(errorMessage).join(" · ")} />
      {issue.data ? <>
        <p>{t("fees.bulkResult", { created: issue.data.created, skipped: issue.data.skipped })}</p>
        <p className="font-semibold">{t("fees.total")}: {money(issue.data.total)}</p>
        <Button onClick={onClose}>{t("fees.bulkClose")}</Button>
      </> : config && preview.data ? <>
        <p className="text-sm text-slate-600">{t("fees.bulkReview", { period: config.period, date: config.dueDate, year: preview.data.year.name })}</p>
        <p className="text-sm text-slate-600">{t("fees.fee")}: {structures.find((s) => s.id === config.feeStructureId)?.name} · {t("fees.amountNpr")}: {money(preview.data.amount)} · {t("fees.fineNpr")}: {money(config.fine)}</p>
        <p className="text-sm text-slate-600">{t("fees.bulkClass")}: {options.data?.classes.find((c) => c.id === config.classId)?.name} · {t("fees.bulkSection")}: {config.sectionId ? options.data?.classes.find((c) => c.id === config.classId)?.sections.find((s) => s.id === config.sectionId)?.name : t("fees.bulkAllSections")}</p>
        <p className="text-sm text-slate-600">{t("fees.bulkSkipHint")}</p>
        <Checkbox disabled={busy} label={t("fees.bulkSelectAll")} checked={preview.data.students.some((s) => !s.existingBillId) && preview.data.students.filter((s) => !s.existingBillId).every((s) => selected[s.id])} onChange={(e) => setSelected(Object.fromEntries(preview.data!.students.map((s) => [s.id, !s.existingBillId && e.target.checked])))} />
        <Table rows={preview.data.students} rowKey={(s) => s.id} columns={[
          { header: "", cell: (s) => <Checkbox label={`${s.firstName} ${s.lastName}`} checked={!!selected[s.id]} disabled={busy || !!s.existingBillId} onChange={(e) => setSelected({ ...selected, [s.id]: e.target.checked })} /> },
          { header: t("fees.bulkAdmission"), cell: (s) => s.admissionNo },
          { header: t("fees.bulkSection"), cell: (s) => s.section },
          { header: t("fees.discountNpr"), cell: (s) => s.existingBillId ? t("fees.bulkExists") : <Input aria-label={`${t("fees.discountNpr")} ${s.admissionNo}`} type="number" min="0" max={preview.data!.amount / 100} step="0.01" value={discounts[s.id] ?? "0"} disabled={busy || !selected[s.id]} onChange={(e) => setDiscounts({ ...discounts, [s.id]: e.target.value })} /> },
          { header: t("fees.total"), cell: (s) => {
            if (s.existingBillId) return "—";
            try { const discount = paisa(discounts[s.id] ?? "0"); const total = preview.data!.amount - discount + config.fine; return discount <= preview.data!.amount && total > 0 && total <= 1_000_000_000 ? money(total) : "—"; } catch { return "—"; }
          } },
        ]} />
        {!preview.data.students.length && <p>{t("fees.bulkNoStudents")}</p>}
        <p className="font-semibold">{t("fees.bulkSelected", { count: rows.length })} · {t("fees.total")}: {valid ? money(total) : "—"}</p>
        {!valid && <FormError message={t("fees.bulkDiscountError")} />}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => { setConfig(null); preview.reset(); issue.reset(); setError(""); }}>{t("fees.bulkBack")}</Button>
          <Button loading={issue.isPending} disabled={!rows.length || !valid} onClick={confirm}>{t("fees.bulkConfirm", { count: rows.length })}</Button>
        </div>
      </> : <form onSubmit={loadPreview}>
        <fieldset disabled={busy || !options.data?.year} className="space-y-4">
          {!options.isLoading && !options.data?.year && <p>{t("fees.bulkNoYear")}</p>}
          {options.data?.year && <p>{t("fees.bulkYear")}: {options.data.year.name}</p>}
          <Field label={t("fees.bulkClass")}><Select required value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">{t("fees.choose")}</option>{options.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={t("fees.bulkSection")}><Select key={classId} name="sectionId"><option value="">{t("fees.bulkAllSections")}</option>{options.data?.classes.find((c) => c.id === classId)?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label={t("fees.fee")}><Select name="feeStructureId" required><option value="">{t("fees.choose")}</option>{structures.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.amount)}</option>)}</Select></Field>
          <Field label={t("fees.period")} hint={t("fees.periodHint")}><Input name="period" required maxLength={50} /></Field>
          <Field label={t("fees.due")} hint={t("fees.bulkAdDate")}><Input name="dueDate" type="date" defaultValue={todayAd()} required /></Field>
          <Field label={t("fees.fineNpr")}><Input name="fine" defaultValue="0" type="number" min="0" max="10000000" step="0.01" required /></Field>
          <Button type="submit" loading={preview.isPending}>{t("fees.bulkPreview")}</Button>
        </fieldset>
      </form>}
    </div>
  </Modal>;
}
