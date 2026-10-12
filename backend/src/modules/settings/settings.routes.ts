import { defineModule, route } from "../../http/route.js";
import { SETTING_GROUPS, SETTINGS, settingsUpdateSchema, type SchoolSettings } from "./settings.registry.js";
import { getSchoolSettings, updateSchoolSettings } from "./settings.service.js";

export const settingsModule = defineModule("/settings", "Settings", [
  route({
    method: "get",
    path: "/definitions",
    summary: "All available settings with their types, options and defaults",
    description: "The dashboard renders the settings screen from this.",
    handler: () => ({ groups: SETTING_GROUPS, settings: SETTINGS }),
  }),

  route({
    method: "get",
    path: "/",
    summary: "This school's settings (defaults merged with changes)",
    handler: ({ schoolId }) => getSchoolSettings(schoolId),
  }),

  route({
    method: "patch",
    path: "/",
    summary: "Change one or more settings",
    permission: "school.settings.edit",
    body: settingsUpdateSchema,
    handler: ({ actor, body }) => updateSchoolSettings(actor, body as SchoolSettings),
  }),
]);
