import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Pagination, Table } from "@/components/ui/Table";
import { api, downloadFile, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";

type Payment = { id: string; createdAt: string; admissionNo: string; name: string; classSection: string | null; fee: string; period: string; amount: number; method: string; collector: string; reference: string | null; reversedAt: string | null; reversalReason: string | null; effectiveAmount: number };
type Unpaid = { id: string; admissionNo: string; name: string; classSection: string | null; fee: string; period: string; dueDate: string; total: number; paid: number; balance: number };
const money = (n: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(n / 100);
const today = new Date(Date.now() + 345 * 60000).toISOString().slice(0, 10);
const initial = { start: today.slice(0, 8) + "01", end: today, classId: "", sectionId: "", method: "", collectorId: "" };

export function FeeReportsPage() {
  const { t } = useTranslation();
  const { moduleEnabled } = useAuth();
  const enabled = moduleEnabled("fees");
  const [mode, setMode] = useState<"payments" | "unpaid">("payments");
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const query = { start: filters.start, end: filters.end, classId: filters.classId || undefined, sectionId: filters.sectionId || undefined, ...(mode === "payments" ? { method: filters.method || undefined, collectorId: filters.collectorId || undefined } : {}) };
  const options = useQuery({ queryKey: ["fees", "reportOptions"], queryFn: () => api.get<{ classes: { id: string; name: string; sections: { id: string; name: string }[] }[]; collectors: { id: string; name: string }[] }>("/fees/reports/options"), enabled });
  const payments = useQuery({ queryKey: ["fees", "collections", query, page], queryFn: () => api.get<Paginated<Payment> & { collected: number; grossCollected: number; reversedAmount: number; daily: { day: string; total: number; count: number }[] }>("/fees/reports/collections", { ...query, page }), enabled: enabled && mode === "payments" });
  const unpaid = useQuery({ queryKey: ["fees", "unpaidReport", query, page], queryFn: () => api.get<Paginated<Unpaid> & { outstanding: number }>("/fees/reports/unpaid", { ...query, page }), enabled: enabled && mode === "unpaid" });
  const download = useMutation({ mutationFn: () => downloadFile("/fees/reports/export", { ...query, mode }) });
  const active = mode === "payments" ? payments : unpaid;
  function apply(event: FormEvent) { event.preventDefault(); setFilters({ ...draft }); setPage(1); }
  if (!enabled) return <EmptyState title={t("fees.disabled")} />;
  return <div className="space-y-5">
    <PageHeader title={t("fees.reportsTitle")} description={t("fees.reportsHint")} actions={<Link to="/fees" className="text-sm font-medium text-brand">{t("fees.title")}</Link>} />
    <div className="flex flex-wrap gap-2">{(["payments", "unpaid"] as const).map((tab) => <Button key={tab} variant={mode === tab ? "primary" : "secondary"} onClick={() => { setMode(tab); setPage(1); download.reset(); }}>{t(`fees.report_${tab}`)}</Button>)}</div>
    <p className="text-sm text-slate-600">{t(mode === "payments" ? "fees.reportPaymentDates" : "fees.reportUnpaidDates")}</p>
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
      <Field label={t("fees.reportStart")}><Input type="date" required value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
      <Field label={t("fees.reportEnd")}><Input type="date" required min={draft.start} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
      <Field label={t("fees.bulkClass")}><Select value={draft.classId} onChange={(e) => setDraft({ ...draft, classId: e.target.value, sectionId: "" })}><option value="">{t("fees.filterAllClasses")}</option>{options.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label={t("fees.bulkSection")}><Select value={draft.sectionId} disabled={!draft.classId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}><option value="">{t("fees.bulkAllSections")}</option>{options.data?.classes.find((c) => c.id === draft.classId)?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      {mode === "payments" && <>
        <Field label={t("fees.method")}><Select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}><option value="">{t("fees.reportAllMethods")}</option>{["CASH", "BANK", "OTHER"].map((m) => <option key={m} value={m}>{t(`fees.${m}`)}</option>)}</Select></Field>
        <Field label={t("fees.reportCollector")}><Select value={draft.collectorId} onChange={(e) => setDraft({ ...draft, collectorId: e.target.value })}><option value="">{t("fees.reportAllCollectors")}</option>{options.data?.collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      </>}
      <Button type="submit">{t("fees.reportApply")}</Button>
    </form>
    {dirty && <p className="text-sm text-amber-800">{t("fees.reportApplyFirst")}</p>}
    <FormError message={[active.error, options.error, download.error].filter(Boolean).map(errorMessage).join(" · ")} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{t("fees.reportApplied", { start: filters.start, end: filters.end })}</p>
      <Button variant="secondary" disabled={dirty || active.isFetching || !!active.error || !active.data} loading={download.isPending} onClick={() => download.mutate()}>{t("fees.reportExport")}</Button>
    </div>
    {active.data && !active.error && <Card title={t(mode === "payments" ? "fees.netCollected" : "fees.outstanding")}><p className="text-xl font-semibold">{money(mode === "payments" ? payments.data?.collected ?? 0 : unpaid.data?.outstanding ?? 0)}</p>{mode === "payments" && payments.data && <p className="text-sm text-slate-500">{t("fees.grossCollected")}: {money(payments.data.grossCollected)} · {t("fees.reversedAmount")}: {money(payments.data.reversedAmount)}</p>}<p className="text-sm text-slate-500">{t("fees.reportCount", { count: active.data.total })}</p></Card>}
    {mode === "payments" ? <>
      <Card title={t("fees.reportDaily")} padded={false}>
        <Table rows={payments.data?.daily} loading={payments.isLoading} rowKey={(d) => d.day} columns={[
          { header: t("fees.reportDay"), cell: (d) => d.day }, { header: t("fees.report_payments"), cell: (d) => d.count }, { header: t("fees.netCollected"), cell: (d) => money(d.total) },
        ]} />
      </Card>
      <Card title={t("fees.report_payments")} padded={false}>
        <Table rows={payments.data?.items} loading={payments.isLoading} rowKey={(p) => p.id} columns={[
          { header: t("fees.receipt"), cell: (p) => <span className="break-all font-mono text-xs">{p.id}</span> },
          { header: t("fees.reportTime"), cell: (p) => new Date(p.createdAt).toLocaleString("en-NP", { timeZone: "Asia/Kathmandu" }) },
          { header: t("fees.student"), cell: (p) => <>{p.name}<p className="text-xs">{p.admissionNo} · {p.classSection ?? "—"}</p></> },
          { header: t("fees.fee"), cell: (p) => <>{p.fee}<p className="text-xs">{p.period}</p></> },
          { header: t("fees.method"), cell: (p) => t(`fees.${p.method}`) },
          { header: t("fees.reportCollector"), cell: (p) => p.collector },
          { header: t("fees.reference"), cell: (p) => p.reference ?? "—" },
          { header: t("fees.originalAmount"), cell: (p) => money(p.amount) },
          { header: t("fees.netCollected"), cell: (p) => money(p.effectiveAmount) },
          { header: t("fees.filterStatus"), cell: (p) => p.reversedAt ? <span className="text-red-700">{t("fees.reversed")}<p className="text-xs">{p.reversalReason}</p></span> : t("fees.paymentActive") },
        ]} />
      </Card>
    </> : <Card title={t("fees.report_unpaid")} padded={false}>
      <Table rows={unpaid.data?.items} loading={unpaid.isLoading} rowKey={(b) => b.id} columns={[
        { header: t("fees.student"), cell: (b) => <>{b.name}<p className="text-xs">{b.admissionNo} · {b.classSection ?? "—"}</p></> },
        { header: t("fees.fee"), cell: (b) => <>{b.fee}<p className="text-xs">{b.period}</p></> },
        { header: t("fees.due"), cell: (b) => b.dueDate.slice(0, 10) },
        { header: t("fees.total"), cell: (b) => money(b.total) }, { header: t("fees.collected"), cell: (b) => money(b.paid) }, { header: t("fees.outstanding"), cell: (b) => money(b.balance) },
      ]} />
    </Card>}
    <Pagination page={page} pageSize={20} total={active.data?.total ?? 0} onChange={setPage} />
  </div>;
}
