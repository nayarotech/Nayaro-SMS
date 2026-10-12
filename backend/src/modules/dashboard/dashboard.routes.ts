import { defineModule, route } from "../../http/route.js";
import { getAdminDashboard } from "./dashboard.service.js";

export const dashboardModule = defineModule("/dashboard", "Dashboard", [
  route({
    method: "get",
    path: "/admin",
    summary: "Admin dashboard widgets (chosen in settings, filtered by permission)",
    handler: ({ schoolId, auth }) => getAdminDashboard(schoolId, auth),
  }),
]);
