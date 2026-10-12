import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRoles } from "../roles/roles.api";
import { StaffForm } from "./StaffForm";
import { toStaffPayload } from "./staff-payload";
import type { UserDetail, UserListItem } from "./users.api";

export function StaffListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: roles = [] } = useRoles();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState("active");
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", { page, search, roleId, status }],
    queryFn: () => api.get<Paginated<UserListItem>>("/users", { page, search, roleId, status }),
  });

  return (
    <div>
      <PageHeader
        title="Staff & users"
        description="Teachers, administrators and other staff. Parents are managed from Students and Parents."
        actions={
          can("user.manage") && (
            <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add staff
            </Button>
          )
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input placeholder="Search name, email, phone or ID…" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="w-full sm:w-72" />
          <Select value={roleId} onChange={(e) => (setRoleId(e.target.value), setPage(1))} className="w-48">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-36">
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
            <option value="">All</option>
          </Select>
        </div>

        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(u) => u.id}
          onRowClick={(u) => navigate(`/staff/${u.id}`)}
          empty={<EmptyState icon={<Users className="size-8" />} title="No staff found" description="Add teachers and staff so you can assign them classes and subjects." />}
          columns={[
            {
              header: "Name",
              cell: (u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.fullName} url={u.photoUrl} size={34} />
                  <div>
                    <p className="font-medium text-slate-900">{u.fullName}</p>
                    <p className="text-xs text-slate-500">{u.designation ?? "—"}</p>
                  </div>
                </div>
              ),
            },
            {
              header: "Contact",
              cell: (u) => (
                <div className="text-xs">
                  <p>{u.phone ?? "—"}</p>
                  <p className="text-slate-500">{u.email}</p>
                </div>
              ),
            },
            {
              header: "Roles",
              cell: (u) => (
                <div className="flex flex-wrap gap-1">
                  {u.roles.length ? u.roles.map((r) => <Badge key={r.id} tone="brand">{r.name}</Badge>) : <span className="text-xs text-slate-400">No role</span>}
                </div>
              ),
            },
            { header: "Status", cell: (u) => (u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>) },
            { header: "Last login", cell: (u) => <span className="text-xs text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</span> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add staff member" size="lg">
        <StaffForm
          submitLabel="Add staff member"
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const created = await api.post<UserDetail>("/users", toStaffPayload(values, true));
            await queryClient.invalidateQueries({ queryKey: ["users"] });
            toast.success(`${created.fullName} added`);
            setAdding(false);
            navigate(`/staff/${created.id}`);
          }}
        />
      </Modal>
    </div>
  );
}
