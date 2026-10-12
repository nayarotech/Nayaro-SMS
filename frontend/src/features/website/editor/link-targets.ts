import { createContext, useContext } from "react";
import type { WebsitePageSummary } from "../website.api";

/** Pages and on-page anchors that link pickers can offer. Provided by the editor screens. */
export interface LinkTargets {
  pages: WebsitePageSummary[];
  anchors: string[];
}

export const LinkTargetsContext = createContext<LinkTargets>({ pages: [], anchors: [] });

export const useLinkTargets = () => useContext(LinkTargetsContext);
