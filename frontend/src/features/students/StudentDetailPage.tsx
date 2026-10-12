import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, MessageCircle, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Avatar, Badge, Card, EmptyState, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/toast";
import { api, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { useClasses } from "../academic/academic.api";
import { GuardianPicker } from "./GuardianPicker";
import { StudentAttendanceTab } from "./StudentAttendanceTab";
import { StudentNotesTab } from "./StudentNotesTab";
import { StudentRecordTab } from "./StudentRecordTab";
import { NOTE_CATEGORY, RELATIONS, RESULT_TONE, STATUS_LABEL, YEAR_STATUS, relationLabel, useStudentRecord, type NoteCategory, type Relation, type StudentDetail, type StudentStatus } from "./students.api";

type Tab = "overview" | "record" | "attendance" | "notes" | "parents" | "documents" | "history";

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<"edit" | "enrollment" | null>(null);

  const { data: student } = useQuery({ queryKey: ["student", id], queryFn: () => api.get<StudentDetail>(`/students/${id}`) });

  const onSaved = (updated: StudentDetail) => {
    queryClient.setQueryData(["student", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["students"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const exportData = async () => {
    try {
      const data = await api.get(`/students/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `student-${student?.admissionNo}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = useMutation({
    mutationFn: () => api.delete(`/students/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("Student data deleted");
      navigate("/students");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!student) return <Spinner />;
  const enrollment = student.currentEnrollment;

  return (
    <div>
      <Link to="/students" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Students
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {can("student.edit") ? (
            <ImageUpload
              purpose="student-photo"
              url={student.photoUrl}
              label="Add photo"
              onUploaded={async (file) => {
                try {
                  onSaved(await api.patch<StudentDetail>(`/students/${student.id}`, { photoKey: file.key }));
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            />
          ) : (
            <Avatar name={student.fullName} url={student.photoUrl} size={72} />
          )}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{student.fullName}</h1>
            <p className="text-sm text-slate-500">
              {student.admissionNo}
              {enrollment && ` · ${enrollment.class.name} ${enrollment.section.name} · Roll ${enrollment.rollNo ?? "—"} · ${enrollment.academicYear.name}`}
            </p>
            <div className="mt-1.5 flex gap-1">
              <Badge tone={student.status === "ACTIVE" ? "green" : "amber"}>{STATUS_LABEL[student.status]}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("student.edit") && (
            <>
              <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setModal("edit")}>
                Edit details
              </Button>
              {enrollment && (
                <Button variant="secondary" size="sm" onClick={() => setModal("enrollment")}>
                  Section / roll no.
                </Button>
              )}
            </>
          )}
          {can("student.record.view") && (
            <Button variant="ghost" size="sm" icon={<Download className="size-3.5" />} onClick={() => void exportData()}>
              Export data
            </Button>
          )}
          {can("student.delete") && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-3.5" />}
              onClick={() =>
                prompt(`This permanently deletes ${student.fullName}'s data and documents. Type the admission number to confirm:`) === student.admissionNo &&
                remove.mutate()
              }
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "record", label: "Academic record", hidden: !student.access.record },
          { key: "attendance", label: "Attendance", hidden: !can(["attendance.view", "attendance.report", "student.record.view"]) },
          { key: "notes", label: "Notes", hidden: !student.access.notes },
          { key: "parents", label: `Parents (${student.guardians.length})` },
          { key: "documents", label: "Documents", hidden: !student.canSeeFullRecord },
          { key: "history", label: "Class history", hidden: !student.canSeeFullRecord },
        ]}
      />

      {tab === "overview" && student.access.record && <RecordSummary studentId={student.id} onOpen={setTab} />}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card title="Personal details">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Item label="Gender">{student.gender === "MALE" ? "Male" : student.gender === "FEMALE" ? "Female" : "Other"}</Item>
              <Item label="Date of birth">{formatDate(student.dateOfBirth)}</Item>
              <Item label="Blood group">{student.bloodGroup}</Item>
              <Item label="Religion">{student.religion}</Item>
              <Item label="Nationality">{student.nationality}</Item>
              <Item label="Admitted on">{formatDate(student.admissionDate)}</Item>
              <Item label="Permanent address">{student.address}</Item>
              <Item label="Temporary address">{student.temporaryAddress}</Item>
              <Item label="Previous school">{student.previousSchool}</Item>
              <Item label="Phone">{student.phone}</Item>
              <Item label="Email">{student.email}</Item>
            </dl>
            {student.medicalNotes && (
              <div className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="font-medium">Medical notes: </span>
                {student.medicalNotes}
              </div>
            )}
          </Card>
          <Card title="Parents">
            <ul className="space-y-3">
              {student.guardians.map((g) => (
                <li key={g.id} className="text-sm">
                  <p className="font-medium text-slate-900">
                    {g.fullName} {g.isPrimary && <Star className="inline size-3.5 fill-amber-400 text-amber-400" />}
                  </p>
                  <p className="text-slate-500">
                    {relationLabel(g.relation)} · {g.phone ?? "no phone"}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "record" && <StudentRecordTab studentId={student.id} />}
      {tab === "attendance" && <StudentAttendanceTab studentId={student.id} />}
      {tab === "notes" && <StudentNotesTab studentId={student.id} studentName={student.firstName} />}
      {tab === "parents" && <ParentsTab student={student} onSaved={onSaved} />}
      {tab === "documents" && <DocumentsTab student={student} onSaved={onSaved} />}
      {tab === "history" && (
        <Card padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5 font-medium">Academic year</th>
                <th className="px-4 py-2.5 font-medium">Class</th>
                <th className="px-4 py-2.5 font-medium">Roll</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {student.history?.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3 font-medium">{h.academicYear}</td>
                  <td className="px-4 py-3">{h.classSection}</td>
                  <td className="px-4 py-3">{h.rollNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={YEAR_STATUS[h.status]?.tone ?? "gray"}>{YEAR_STATUS[h.status]?.label ?? h.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{h.remarks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modal === "edit" && <EditStudentModal student={student} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal === "enrollment" && enrollment && <EnrollmentModal student={student} onClose={() => setModal(null)} onSaved={onSaved} />}
    </div>
  );
}

/** Headline numbers from the 360° record: this year's attendance, latest result, rank and notes. */
function RecordSummary({ studentId, onOpen }: { studentId: string; onOpen: (tab: Tab) => void }) {
  const { data } = useStudentRecord(studentId);
  if (!data) return null;
  const year = data.years[0];
  const latest = data.years.flatMap((y) => [...y.exams].reverse()).find((e) => e.gpa !== null || e.result === "FAIL");
  const noteCount = Object.values(data.notes).reduce((sum, n) => sum + (n ?? 0), 0);
  const lastPromotion = data.promotions[data.promotions.length - 1];

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label={`Attendance ${year?.academicYear.name ?? ""}`} onClick={() => onOpen("attendance")}>
        <span className={(year?.attendance.percent ?? 100) < 75 ? "text-red-600" : undefined}>{year?.attendance.percent != null ? `${year.attendance.percent}%` : "—"}</span>
        {year && year.attendance.total > 0 && <small>{year.attendance.absent} days absent</small>}
      </Tile>
      <Tile label={latest ? latest.name : "Latest result"} onClick={() => onOpen("record")}>
        {latest ? (
          <>
            <span className="flex items-center gap-2">GPA {latest.gpa ?? "—"} <Badge tone={RESULT_TONE[latest.result]}>{latest.grade}</Badge></span>
            <small>{latest.sectionRank ? `Rank ${latest.sectionRank} in section` : latest.result === "FAIL" ? "Not ranked (failed a subject)" : "Not ranked yet"}</small>
          </>
        ) : (
          <span>—</span>
        )}
      </Tile>
      <Tile label="School career" onClick={() => onOpen("history")}>
        <span>{data.years.length} {data.years.length === 1 ? "year" : "years"}</span>
        <small>{lastPromotion ? `${YEAR_STATUS[lastPromotion.outcome === "PROMOTE" ? "PROMOTED" : lastPromotion.outcome === "DETAIN" ? "DETAINED" : lastPromotion.outcome === "GRADUATE" ? "GRADUATED" : "COMPLETED"].label} in ${lastPromotion.fromYear}` : "First year here"}</small>
      </Tile>
      <Tile label="Notes" onClick={() => onOpen("notes")}>
        <span>{noteCount}</span>
        <small className="flex flex-wrap gap-1">
          {(Object.keys(data.notes) as NoteCategory[]).map((c) => <Badge key={c} tone={NOTE_CATEGORY[c].tone}>{data.notes[c]} {NOTE_CATEGORY[c].label.toLowerCase()}</Badge>)}
        </small>
      </Tile>
    </div>
  );
}

function Tile({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand/40 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-500">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex flex-col gap-1 text-xl font-semibold text-slate-900">{children}</span>
    </button>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

function ParentsTab({ student, onSaved }: { student: StudentDetail; onSaved: (s: StudentDetail) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const editable = can("guardian.manage");

  const run = async (action: () => Promise<StudentDetail>) => {
    try {
      onSaved(await action());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card
      title="Parents & guardians"
      actions={editable && <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add</Button>}
    >
      <ul className="divide-y divide-slate-100">
        {student.guardians.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <Link to={`/guardians?search=${encodeURIComponent(g.phone ?? g.fullName)}`} className="font-medium text-slate-900 hover:text-brand">
                {g.fullName}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {relationLabel(g.relation)} · {g.phone ?? "no phone"} {g.occupation && `· ${g.occupation}`}
                {g.isPrimary && <Badge tone="amber">Primary contact</Badge>}
                {g.whatsappOptIn ? (
                  <Badge tone="green">
                    <MessageCircle className="mr-1 size-3" /> WhatsApp opted in
                  </Badge>
                ) : (
                  <Badge>No WhatsApp consent</Badge>
                )}
                {g.hasPassword ? <Badge tone="green">App password set</Badge> : <Badge>No app password</Badge>}
                {g.hasLoggedIn && <Badge tone="blue">Uses the app</Badge>}
              </div>
            </div>
            {editable && (
              <div className="flex gap-1">
                {!g.isPrimary && (
                  <Button size="sm" variant="ghost" onClick={() => void run(() => api.patch(`/students/${student.id}/guardians/${g.id}`, { isPrimary: true }))}>
                    Make primary
                  </Button>
                )}
                {student.guardians.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-3.5" />}
                    onClick={() => confirm(`Unlink ${g.fullName} from ${student.fullName}?`) && void run(() => api.delete(`/students/${student.id}/guardians/${g.id}`))}
                  >
                    Unlink
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && <AddGuardianModal student={student} onClose={() => setAdding(false)} onSaved={onSaved} />}
    </Card>
  );
}

function AddGuardianModal({ student, onClose, onSaved }: { student: StudentDetail; onClose: () => void; onSaved: (s: StudentDetail) => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [relation, setRelation] = useState<Relation>("GUARDIAN");
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm({ defaultValues: { fullName: "", phone: "", email: "", occupation: "", whatsappOptIn: false } });

  const add = async (body: object) => {
    try {
      onSaved(await api.post<StudentDetail>(`/students/${student.id}/guardians`, { relation, ...body }));
      onClose();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const submitNew = handleSubmit(async (values) => {
    try {
      onSaved(
        await api.post<StudentDetail>(`/students/${student.id}/guardians`, {
          relation,
          guardian: { ...values, phone: values.phone || null, email: values.email || null, occupation: values.occupation || null },
        }),
      );
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add a parent for ${student.firstName}`}
      footer={
        mode === "new" && (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={formState.isSubmitting} onClick={() => void submitNew()}>Add</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <FormError message={formError} />
        <div className="flex gap-3">
          <Select value={relation} onChange={(e) => setRelation(e.target.value as Relation)} className="w-40">
            {RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
          <Select value={mode} onChange={(e) => setMode(e.target.value as "new" | "existing")}>
            <option value="new">New person</option>
            <option value="existing">Existing parent at this school</option>
          </Select>
        </div>
        {mode === "existing" ? (
          <GuardianPicker onPick={(g) => void add({ guardianId: g.id })} />
        ) : (
          <form onSubmit={submitNew} className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required error={formState.errors.fullName?.message}>
              <Input {...register("fullName", { required: "Required" })} />
            </Field>
            <Field label="Mobile" error={formState.errors.phone?.message}>
              <Input {...register("phone")} />
            </Field>
            <Field label="Email">
              <Input {...register("email")} />
            </Field>
            <Field label="Occupation">
              <Input {...register("occupation")} />
            </Field>
            <Checkbox className="sm:col-span-2" label="Agrees to receive messages on WhatsApp" {...register("whatsappOptIn")} />
          </form>
        )}
      </div>
    </Modal>
  );
}

function DocumentsTab({ student, onSaved }: { student: StudentDetail; onSaved: (s: StudentDetail) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const editable = can("student.documents.manage");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const title = prompt("Document title", file.name.replace(/\.[^.]+$/, ""));
    if (!title) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, "student-document");
      onSaved(await api.post<StudentDetail>(`/students/${student.id}/documents`, { title, fileKey: uploaded.key }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Documents"
      actions={
        editable && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand hover:underline">
            <Plus className="size-4" /> {busy ? "Uploading…" : "Upload"}
            <input type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        )
      }
    >
      {!student.documents?.length ? (
        <EmptyState icon={<FileText className="size-8" />} title="No documents" description="Birth certificate, transfer certificate, etc." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {student.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-slate-900 hover:text-brand">
                <FileText className="size-4 text-slate-400" /> {d.title}
              </a>
              <span className="flex items-center gap-3 text-xs text-slate-500">
                {new Date(d.createdAt).toLocaleDateString()}
                {editable && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove ${d.title}?`)) return;
                      try {
                        onSaved(await api.delete<StudentDetail>(`/students/${student.id}/documents/${d.id}`));
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                    aria-label="Remove document"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EditStudentModal({ student, onClose, onSaved }: { student: StudentDetail; onClose: () => void; onSaved: (s: StudentDetail) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, formState } = useForm({
    defaultValues: {
      firstName: student.firstName,
      middleName: student.middleName ?? "",
      lastName: student.lastName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      bloodGroup: student.bloodGroup ?? "",
      religion: student.religion ?? "",
      nationality: student.nationality ?? "",
      address: student.address ?? "",
      temporaryAddress: student.temporaryAddress ?? "",
      phone: student.phone ?? "",
      email: student.email ?? "",
      admissionDate: student.admissionDate,
      previousSchool: student.previousSchool ?? "",
      medicalNotes: student.medicalNotes ?? "",
      status: student.status,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));
      onSaved(await api.patch<StudentDetail>(`/students/${student.id}`, body));
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Edit ${student.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" required>
            <Input {...register("firstName", { required: true })} />
          </Field>
          <Field label="Middle name">
            <Input {...register("middleName")} />
          </Field>
          <Field label="Last name" required>
            <Input {...register("lastName", { required: true })} />
          </Field>
          <Field label="Gender">
            <Select {...register("gender")}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Controller control={control} name="dateOfBirth" render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Admitted on">
            <Controller control={control} name="admissionDate" render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Blood group">
            <Input {...register("bloodGroup")} />
          </Field>
          <Field label="Religion">
            <Input {...register("religion")} />
          </Field>
          <Field label="Nationality">
            <Input {...register("nationality")} />
          </Field>
          <Field label="Permanent address" className="sm:col-span-2">
            <Input {...register("address")} />
          </Field>
          <Field label="Phone">
            <Input {...register("phone")} />
          </Field>
          <Field label="Temporary address" className="sm:col-span-2">
            <Input {...register("temporaryAddress")} />
          </Field>
          <Field label="Email">
            <Input {...register("email")} />
          </Field>
          <Field label="Previous school" className="sm:col-span-2">
            <Input {...register("previousSchool")} />
          </Field>
          <Field label="Status" hint="At year end, use Promotion to promote, detain or graduate">
            <Select {...register("status")}>
              {(Object.keys(STATUS_LABEL) as StudentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Medical notes" className="sm:col-span-3">
            <Textarea {...register("medicalNotes")} rows={2} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function EnrollmentModal({ student, onClose, onSaved }: { student: StudentDetail; onClose: () => void; onSaved: (s: StudentDetail) => void }) {
  const { data: classes = [] } = useClasses();
  const enrollment = student.currentEnrollment!;
  const sections = classes.find((c) => c.id === enrollment.class.id)?.sections ?? [];
  const [sectionId, setSectionId] = useState(enrollment.section.id);
  const [rollNo, setRollNo] = useState(enrollment.rollNo?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.patch<StudentDetail>(`/students/${student.id}/enrollment`, { sectionId, rollNo: rollNo ? Number(rollNo) : null }));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Section & roll number"
      description={`${enrollment.class.name}, academic year ${enrollment.academicYear.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormError message={error} />
        <Field label="Section">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Roll no.">
          <Input type="number" min={1} value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
