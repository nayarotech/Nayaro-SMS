import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { idParam } from "../../http/schemas.js";
import * as promotions from "./promotion.service.js";

const years = z.object({ fromYearId: z.uuid().optional(), toYearId: z.uuid().optional() });
const outcome = z.enum(["PROMOTE", "DETAIN", "GRADUATE", "LEAVE"]);

export const promotionsModule = defineModule("/promotions", "Promotion", [
  route({
    method: "get",
    path: "/",
    summary: "Every class with how many students are promoted, detained or still to decide, and past runs",
    description: "From the current year to the next one by default.",
    permission: "promotion.manage",
    query: years,
    handler: ({ schoolId, query }) => promotions.promotionOverview(schoolId, query),
  }),
  route({
    method: "get",
    path: "/preview",
    summary: "Students of one class with their final result, attendance and a suggested outcome",
    description: "Suggestions follow Settings → Promotion. Staff confirm every student.",
    permission: "promotion.manage",
    query: years.extend({ classId: z.uuid(), examId: z.uuid().optional() }),
    handler: ({ schoolId, query }) => promotions.promotionPreview(schoolId, query),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Promote, detain, graduate or close the year for students of one class",
    description:
      "Closes each student's enrollment (PROMOTED, DETAINED, GRADUATED or COMPLETED) and creates the next year's enrollment for promoted and detained students. Audit-logged; parents can be notified.",
    permission: "promotion.manage",
    status: 201,
    body: years.extend({
      classId: z.uuid(),
      examId: z.uuid().optional(),
      rollNumbers: z.enum(["rank", "name", "keep"]).default("name"),
      notifyParents: z.boolean().default(true),
      decisions: z
        .array(z.object({ studentId: z.uuid(), outcome, toSectionId: z.uuid().nullable().optional(), reason: z.string().trim().max(500).nullable().optional() }))
        .min(1)
        .max(500),
    }),
    handler: ({ actor, body }) => promotions.runPromotion(actor, body),
  }),
  route({
    method: "post",
    path: "/:id/undo",
    summary: "Undo a promotion run (only while the new year has no attendance or marks for those students)",
    permission: "promotion.manage",
    params: idParam,
    handler: ({ actor, params }) => promotions.undoPromotion(actor, params.id),
  }),
]);
