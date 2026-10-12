import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  locked: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionGroup {
  key: string;
  label: string;
  comingSoon?: boolean;
  permissions: { key: string; label: string; description?: string }[];
}

export const useRoles = () => useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles") });

export const usePermissionCatalog = () =>
  useQuery({ queryKey: ["permission-catalog"], queryFn: () => api.get<PermissionGroup[]>("/meta/permissions"), staleTime: Infinity });
