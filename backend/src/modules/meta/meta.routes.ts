import { z } from "zod";
import { adToBs, bsToAd, todayInNepal } from "../../lib/nepali-date.js";
import { badRequest } from "../../lib/errors.js";
import { defineModule, route } from "../../http/route.js";
import { dateString } from "../../http/schemas.js";
import { PERMISSION_GROUPS } from "../permissions/permission.catalog.js";

export const metaModule = defineModule("/meta", "Meta", [
  route({
    method: "get",
    path: "/permissions",
    summary: "The permission catalog, grouped",
    access: "user",
    handler: () => PERMISSION_GROUPS,
  }),

  route({
    method: "get",
    path: "/date/convert",
    summary: "Convert a date between AD and BS",
    access: "public",
    query: z.object({ date: dateString, from: z.enum(["ad", "bs"]) }),
    handler: ({ query }) => {
      try {
        return query.from === "ad"
          ? { ad: query.date, bs: adToBs(query.date) }
          : { ad: bsToAd(query.date), bs: query.date };
      } catch {
        throw badRequest("Date is out of the supported range");
      }
    },
  }),

  route({
    method: "get",
    path: "/today",
    summary: "Today's date in Nepal, in AD and BS",
    access: "public",
    handler: () => {
      const ad = todayInNepal();
      return { ad, bs: adToBs(ad) };
    },
  }),
]);
