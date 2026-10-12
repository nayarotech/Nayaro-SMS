import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { pagination } from "../../http/schemas.js";
import { listNotifications, markRead } from "./notification.service.js";

export const notificationsModule = defineModule("/notifications", "Notifications", [
  route({
    method: "get",
    path: "/",
    summary: "My notifications (newest first) and how many are unread",
    access: "user",
    query: pagination,
    handler: ({ auth, query }) => listNotifications(auth.userId, query.page, query.pageSize),
  }),
  route({
    method: "post",
    path: "/read",
    summary: "Mark notifications as read (all of them when no ids are given)",
    access: "user",
    body: z.object({ ids: z.array(z.uuid()).optional() }),
    handler: ({ auth, body }) => markRead(auth.userId, body.ids),
  }),
]);
