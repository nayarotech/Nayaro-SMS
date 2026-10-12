import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

type Status = "NEW" | "CONTACTED" | "CLOSED";

interface Enquiry {
  id: string;
  kind: "contact" | "admission";
  name: string;
  phone: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  status: Status;
  notes: string | null;
  createdAt: string;
}

const STATUS: Record<Status, { label: string; tone: "red" | "blue" | "gray" }> = {
  NEW: { label: "New", tone: "red" },
  CONTACTED: { label: "Contacted", tone: "blue" },
  CLOSED: { label: "Closed", tone: "gray" },
};

/** Messages from the website's contact and admission forms. */
export function EnquiriesPage() {
  const [status, setStatus] = useState<Status | "">("NEW");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Enquiry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["website-enquiries", status, kind, page],
    queryFn: () => api.get<Paginated<Enquiry>>("/website/enquiries", { status, kind, page, pageSize: 25 }),
  });

  return (
    <div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Select value={status} onChange={(e) => (setStatus(e.target.value as Status | ""), setPage(1))} className="w-40">
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="CLOSED">Closed</option>
            <option value="">All</option>
          </Select>
          <Select value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))} className="w-48">
            <option value="">Admission & contact</option>
            <option value="admission">Admission enquiries</option>
            <option value="contact">Contact messages</option>
          </Select>
        </div>
        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(e) => e.id}
          onRowClick={setOpen}
          empty={<EmptyState icon={<Inbox className="size-8" />} title="No enquiries here" description="Messages sent from your website's forms appear here." />}
          columns={[
            { header: "Received", cell: (e) => <span className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</span> },
            {
              header: "From",
              cell: (e) => (
                <div>
                  <p className="font-medium text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.phone}</p>
                </div>
              ),
            },
            { header: "Type", cell: (e) => (e.kind === "admission" ? <Badge tone="brand">Admission{e.subject ? ` · ${e.subject}` : ""}</Badge> : <Badge>Contact</Badge>) },
            { header: "Message", cell: (e) => <span className="line-clamp-1 max-w-sm text-sm text-slate-600">{e.message}</span> },
            { header: "Status", cell: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      {open && <EnquiryModal enquiry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EnquiryModal({ enquiry, onClose }: { enquiry: Enquiry; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<Status>(enquiry.status === "NEW" ? "CONTACTED" : enquiry.status);
  const [notes, setNotes] = useState(enquiry.notes ?? "");

  const save = useMutation({
    mutationFn: () => api.patch(`/website/enquiries/${enquiry.id}`, { status, notes: notes || null }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["website-enquiries"] }), queryClient.invalidateQueries({ queryKey: ["website"] })]);
      toast.success("Saved");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={enquiry.name}
      description={`${enquiry.kind === "admission" ? "Admission enquiry" : "Message"} · ${new Date(enquiry.createdAt).toLocaleString()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {enquiry.phone && (
            <a href={`tel:${enquiry.phone}`}>
              <Button size="sm" variant="secondary" icon={<Phone className="size-3.5" />}>{enquiry.phone}</Button>
            </a>
          )}
          {enquiry.email && (
            <a href={`mailto:${enquiry.email}`}>
              <Button size="sm" variant="secondary" icon={<Mail className="size-3.5" />}>{enquiry.email}</Button>
            </a>
          )}
        </div>
        {enquiry.subject && (
          <p className="text-sm">
            <span className="text-slate-500">{enquiry.kind === "admission" ? "Class: " : "Subject: "}</span>
            <b>{enquiry.subject}</b>
          </p>
        )}
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{enquiry.message}</p>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>
        <Field label="Notes (only staff see these)">
          <Textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called on 26 Aswin, visiting on Sunday" />
        </Field>
      </div>
    </Modal>
  );
}
