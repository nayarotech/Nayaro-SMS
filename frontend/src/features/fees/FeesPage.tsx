import { Link } from "react-router";
import { FeeRemindersModal } from "./FeeRemindersModal";
import { BulkBillingModal } from "./BulkBillingModal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { DateInput } from "@/components/ui/DateInput";
import { api, ApiError, downloadFile, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, todayAd, type DateDisplay } from "@/lib/dates";
import { errorMessage } from "@/lib/forms";

type Structure = { id: string; name: string; amount: number };
type Student = { id: string; firstName: string; lastName: string; admissionNo: string };
type Bill = { id: string; title: string; period: string; dueDate: string; amount: number; discount: number; fine: number; total: number; paid: number; balance: number; student: Student };
type Payment = { id: string; amount: number; method: string; reference: string | null; createdAt: string; reversedAt: string | null; reversalReason: string | null };
const money = (value: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(value / 100);
function paisa(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Enter an amount with at most two decimal places");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function FeesPage() {
  const { t } = useTranslation();
  const { can, moduleEnabled, user } = useAuth();
  const enabled = moduleEnabled("fees");
  const dates = (user?.settings?.["localization.dateDisplay"] ?? "bs") as DateDisplay;
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ classId: "", sectionId: "", status: "all" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reminderIds, setReminderIds] = useState<string[] | null>(null);
  const filterOptions = useQuery({ queryKey: ["fees", "filterOptions"], queryFn: () => api.get<{ classes: { id: string; name: string; sections: { id: string; name: string }[] }[] }>("/fees/options"), enabled });
  const changeFilter = (next: typeof filters) => { setFilters(next); setPage(1); setChecked({}); };
  const [modal, setModal] = useState<"structure" | "bill" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const structures = useQuery({ queryKey: ["fees", "structures"], queryFn: () => api.get<Structure[]>("/fees/structures"), enabled });
  const bills = useQuery({ queryKey: ["fees", "bills", page, filters], queryFn: () => api.get<Paginated<Bill>>("/fees/bills", { page, status: filters.status, classId: filters.classId || undefined, sectionId: filters.sectionId || undefined }), enabled });
  const totals = useQuery({ queryKey: ["fees", "summary"], queryFn: () => api.get<{ billed: number; collected: number; outstanding: number }>("/fees/summary"), enabled: enabled && can("fees.report") });
  const refresh = () => client.invalidateQueries({ queryKey: ["fees"] });
  if (!enabled) return <EmptyState title={t("fees.disabled")} />;
  return <div>
    <PageHeader title={t("fees.title")} description={t("fees.description")} actions={<>{can("fees.report") && <Link to="/fees/reports" className="text-sm font-medium text-brand">{t("fees.reportsTitle")}</Link>}{can("fees.manage") && <>
      <Link to="/fees/recurring" className="text-sm font-medium text-brand">{t("fees.recurringTitle")}</Link>
      <Button variant="secondary" onClick={() => setModal("structure")}>{t("fees.newStructure")}</Button>
      <Button variant="secondary" disabled={!structures.data?.length} onClick={() => setBulkOpen(true)}>{t("fees.bulkTitle")}</Button>
      <Button disabled={!structures.data?.length} onClick={() => setModal("bill")}>{t("fees.newBill")}</Button>
    </>}</>} />
    <FormError message={[structures.error, bills.error, totals.error, filterOptions.error].filter(Boolean).map(errorMessage).join(" · ")} />
    {totals.data && <div className="mb-6 grid gap-4 sm:grid-cols-3">{(["billed", "collected", "outstanding"] as const).map((key) => <Card key={key} title={t(`fees.${key}`)}><p className="text-xl font-semibold">{money(totals.data[key])}</p></Card>)}</div>}
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label={t("fees.bulkClass")}><Select value={filters.classId} onChange={(e) => changeFilter({ ...filters, classId: e.target.value, sectionId: "" })}><option value="">{t("fees.filterAllClasses")}</option>{filterOptions.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label={t("fees.bulkSection")}><Select value={filters.sectionId} disabled={!filters.classId} onChange={(e) => changeFilter({ ...filters, sectionId: e.target.value })}><option value="">{t("fees.bulkAllSections")}</option>{filterOptions.data?.classes.find((c) => c.id === filters.classId)?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label={t("fees.filterStatus")}><Select value={filters.status} onChange={(e) => changeFilter({ ...filters, status: e.target.value })}>{["all", "outstanding", "overdue", "paid"].map((status) => <option key={status} value={status}>{t(`fees.filter_${status}`)}</option>)}</Select></Field>
      {can("fees.manage") && <Button variant="secondary" disabled={!bills.data?.items.some((b) => checked[b.id] && b.balance > 0)} onClick={() => setReminderIds(bills.data!.items.filter((b) => checked[b.id] && b.balance > 0).map((b) => b.id))}>{t("fees.remindTitle")}</Button>}
    </div>
    <Card padded={false} title={t("fees.bills")}>
      {can("fees.manage") && <div className="px-4 py-3"><Checkbox label={t("fees.remindSelectPage")} checked={!!bills.data?.items.some((b) => b.balance > 0) && bills.data!.items.filter((b) => b.balance > 0).every((b) => checked[b.id])} onChange={(e) => setChecked(Object.fromEntries((bills.data?.items ?? []).map((b) => [b.id, b.balance > 0 && e.target.checked])))} /></div>}
      <Table rows={bills.data?.items} loading={bills.isLoading} rowKey={(b) => b.id}
        empty={<EmptyState title={t("fees.noBills")} description={t("fees.startHint")} />}
        columns={[
          ...(can("fees.manage") ? [{ header: "", cell: (b: Bill) => <Checkbox label={`${b.student.admissionNo}`} disabled={b.balance <= 0} checked={!!checked[b.id]} onChange={(e) => setChecked({ ...checked, [b.id]: e.target.checked })} /> }] : []),
          { header: t("fees.student"), cell: (b) => <><p>{b.student.firstName} {b.student.lastName}</p><small>{b.student.admissionNo}</small></> },
          { header: t("fees.fee"), cell: (b) => <>{b.title}<p className="text-xs text-slate-500">{b.period}</p></> },
          { header: t("fees.due"), cell: (b) => formatDate(b.dueDate, dates) },
          { header: t("fees.total"), cell: (b) => money(b.total) },
          { header: t("fees.collected"), cell: (b) => money(b.paid) },
          { header: t("fees.outstanding"), cell: (b) => money(b.balance) },
          { header: "", cell: (b) => <Button size="sm" variant="secondary" onClick={() => setSelected(b.id)}>{t("fees.details")}</Button> },
        ]} />
      <Pagination page={page} pageSize={20} total={bills.data?.total ?? 0} onChange={(page) => { setPage(page); setChecked({}); }} />
    </Card>
    {can("fees.manage") && <Card title={t("fees.structures")} className="mt-6">
      {structures.data?.length ? structures.data.map((s) => <div key={s.id} className="flex justify-between border-b border-slate-100 py-2"><span>{s.name}</span><span>{money(s.amount)}</span></div>) : <p>{t("fees.noStructures")}</p>}
    </Card>}
    {modal && <IssueModal mode={modal} structures={structures.data ?? []} onClose={() => setModal(null)} onSaved={refresh} />}
    {reminderIds && <FeeRemindersModal billIds={reminderIds} onClose={() => { setReminderIds(null); setChecked({}); }} onSaved={refresh} />}
    {bulkOpen && <BulkBillingModal structures={structures.data ?? []} onClose={() => setBulkOpen(false)} onSaved={refresh} />}
    {selected && <BillModal id={selected} dates={dates} canCollect={can("fees.collect")} canReverse={can("fees.reverse")} onClose={() => setSelected(null)} onSaved={refresh} />}
  </div>;
}

function IssueModal({ mode, structures, onClose, onSaved }: { mode: "structure" | "bill"; structures: Structure[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [dueDate, setDueDate] = useState(todayAd());
  const [studentId, setStudentId] = useState("");
  const students = useQuery({ queryKey: ["fees", "students", search], queryFn: () => api.get<Student[]>("/fees/students", { search }), enabled: mode === "bill" });
  const save = useMutation({ mutationFn: (body: unknown) => api.post(mode === "structure" ? "/fees/structures" : "/fees/bills", body), onSuccess: async () => { await onSaved(); onClose(); } });
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setError("");
      const f = new FormData(e.currentTarget);
      if (mode === "structure") save.mutate({ name: f.get("name"), amount: paisa(String(f.get("amount"))) });
      else {
        if (!dueDate) throw new Error(t("fees.dueRequired"));
        save.mutate({ studentId, feeStructureId: f.get("feeStructureId"), period: f.get("period"), dueDate, discount: paisa(String(f.get("discount"))), fine: paisa(String(f.get("fine"))) });
      }
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Modal open onClose={onClose} title={t(mode === "structure" ? "fees.newStructure" : "fees.newBill")}>
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error || (save.error ? errorMessage(save.error) : "")} />
      {mode === "structure" ? <>
        <Field label={t("fees.name")}><Input name="name" required minLength={2} maxLength={150} /></Field>
        <Field label={t("fees.amountNpr")}><Input name="amount" required type="number" min="0.01" max="10000000" step="0.01" /></Field>
      </> : <>
        <Field label={t("fees.searchStudent")}><Input value={search} onChange={(e) => { setSearch(e.target.value); setStudentId(""); }} /></Field>
        <FormError message={students.error ? errorMessage(students.error) : ""} />
        <Field label={t("fees.student")} hint={t("fees.searchHint")}><Select required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">{t("fees.choose")}</option>{students.data?.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.admissionNo}</option>)}</Select></Field>
        <Field label={t("fees.fee")}><Select name="feeStructureId" required><option value="">{t("fees.choose")}</option>{structures.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.amount)}</option>)}</Select></Field>
        <Field label={t("fees.period")} hint={t("fees.periodHint")}><Input name="period" required maxLength={50} /></Field>
        <Field label={t("fees.due")}><DateInput value={dueDate} onChange={setDueDate} /></Field>
        <Field label={t("fees.discountNpr")}><Input name="discount" defaultValue="0" required type="number" min="0" max="10000000" step="0.01" /></Field>
        <Field label={t("fees.fineNpr")}><Input name="fine" defaultValue="0" required type="number" min="0" max="10000000" step="0.01" /></Field>
      </>}
      <Button type="submit" loading={save.isPending}>{t("fees.save")}</Button>
    </form>
  </Modal>;
}

function BillModal({ id, dates, canCollect, canReverse, onClose, onSaved }: { id: string; dates: DateDisplay; canCollect: boolean; canReverse: boolean; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const history = useQuery({ queryKey: ["fees", "reminderHistory", id], queryFn: () => api.get<{ id: string; recipientName: string; balance: number; createdAt: string; channel: string; deliveryStatus: string; errorCode: string | null; phone: string | null }[]>(`/fees/bills/${id}/reminders`) });
  const bill = useQuery({ queryKey: ["fees", "bill", id], queryFn: () => api.get<Bill & { payments: Payment[] }>(`/fees/bills/${id}`) });
  // Retain the exact payload for retries after a connection failure.
  const [pending, setPending] = useState<{ requestId: string; amount: number; method: string; reference?: string } | null>(null);
  const [error, setError] = useState("");
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const reverse = useMutation({ mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => api.post(`/fees/payments/${paymentId}/reverse`, { reason }), onSuccess: async () => { setReversing(null); setReason(""); await onSaved(); } });
  const receipt = useMutation({ mutationFn: (paymentId: string) => downloadFile(`/fees/payments/${paymentId}/receipt`) });
  const save = useMutation({ mutationFn: (body: NonNullable<typeof pending>) => api.post(`/fees/bills/${id}/payments`, body), onError: (e) => { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 409) setPending(null); }, onSuccess: async () => { setPending(null); await onSaved(); } });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setError("");
      const f = new FormData(e.currentTarget);
      const body = pending ?? { requestId: crypto.randomUUID(), amount: paisa(String(f.get("amount"))), method: String(f.get("method")), ...(f.get("reference") ? { reference: String(f.get("reference")) } : {}) };
      setPending(body);
      save.mutate(body);
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Modal open onClose={onClose} title={t("fees.details")} >
    <FormError message={bill.error ? errorMessage(bill.error) : ""} />
    {bill.data && <div className="space-y-4">
      <p className="font-medium">{bill.data.student.firstName} {bill.data.student.lastName} · {bill.data.student.admissionNo}</p>
      <p>{bill.data.title} · {bill.data.period} · {formatDate(bill.data.dueDate, dates)}</p>
      <p>{t("fees.amountNpr")}: {money(bill.data.amount)} · {t("fees.discountNpr")}: {money(bill.data.discount)} · {t("fees.fineNpr")}: {money(bill.data.fine)}</p>
      <p>{t("fees.total")}: {money(bill.data.total)} · {t("fees.outstanding")}: <strong>{money(bill.data.balance)}</strong></p>
      {canCollect && (bill.data.balance > 0 || pending) && <form onSubmit={submit} className="space-y-3 border-t border-slate-200 pt-4">
        <FormError message={error || (save.error ? errorMessage(save.error) : "")} />
        <Field label={t("fees.amountNpr")}><Input name="amount" type="number" required min="0.01" max={bill.data.balance / 100} step="0.01" defaultValue={bill.data.balance / 100} disabled={!!pending} /></Field>
        <Field label={t("fees.method")}><Select name="method" disabled={!!pending}>{["CASH", "BANK", "OTHER"].map((m) => <option key={m} value={m}>{t(`fees.${m}`)}</option>)}</Select></Field>
        <Field label={t("fees.reference")}><Input name="reference" maxLength={150} disabled={!!pending} /></Field>
        <Button type="submit" loading={save.isPending}>{t(pending ? "fees.retryPayment" : "fees.collect")}</Button>
      </form>}
      <h3 className="font-medium">{t("fees.receipts")}</h3>
      <FormError message={receipt.error ? errorMessage(receipt.error) : ""} />
      {bill.data.payments.length === 0 && <p>{t("fees.noPayments")}</p>}
      {bill.data.payments.map((p) => <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm">
        {p.reversedAt && <div className="rounded border border-red-200 bg-red-50 p-2 text-red-800"><strong>{t("fees.reversed")}</strong> · {formatDate(p.reversedAt, dates)}<p>{p.reversalReason}</p></div>}
        <p>{money(p.amount)} · {t(`fees.${p.method}`)} · {formatDate(p.createdAt, dates)}</p>
        <p className="break-all text-xs text-slate-500">{t("fees.receipt")}: {p.id}</p>
        {p.reference && <p>{t("fees.reference")}: {p.reference}</p>}
        <Button size="sm" variant="secondary" loading={receipt.isPending && receipt.variables === p.id} disabled={receipt.isPending} onClick={() => receipt.mutate(p.id)}>{t("fees.downloadReceipt")}</Button>
        {canReverse && !p.reversedAt && <Button size="sm" variant="ghost" onClick={() => { setReversing(p); setReason(""); reverse.reset(); }}>{t("fees.reversePayment")}</Button>}
      </div>)}
      {reversing && <form className="space-y-3 rounded-lg border border-red-200 p-4" onSubmit={(e) => { e.preventDefault(); reverse.mutate({ paymentId: reversing.id, reason: reason.trim() }); }}>
        <h3 className="font-semibold">{t("fees.reversePayment")}: {money(reversing.amount)}</h3>
        <p className="break-all text-xs">{t("fees.receipt")}: {reversing.id}</p>
        <p className="text-sm text-slate-600">{t("fees.reverseHint")}</p>
        <FormError message={reverse.error ? errorMessage(reverse.error) : ""} />
        <Field label={t("fees.reverseReason")}><Textarea required minLength={5} maxLength={500} value={reason} disabled={reverse.isPending} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex gap-2"><Button type="submit" variant="danger" disabled={reason.trim().length < 5} loading={reverse.isPending}>{t("fees.reverseConfirm")}</Button><Button variant="secondary" disabled={reverse.isPending} onClick={() => setReversing(null)}>{t("fees.reverseCancel")}</Button></div>
      </form>}
      <h3 className="font-medium">{t("fees.remindHistory")}</h3>
      <FormError message={history.error ? errorMessage(history.error) : ""} />
      {!history.isLoading && !history.error && !history.data?.length && <p>{t("fees.remindNoHistory")}</p>}
      {history.data?.map((r) => <p key={r.id} className="text-sm text-slate-600">{new Date(r.createdAt).toLocaleString()} · {r.recipientName} - {money(r.balance)} - {r.channel === "SMS" ? "SMS" : t("fees.channelInApp")} - {t(`fees.delivery_${r.deliveryStatus}`)}{r.phone ? ` - ${r.phone}` : ""}{r.errorCode ? ` - ${r.errorCode}` : ""}</p>)}
    </div>}
  </Modal>;
}
