import type { BlockDefinition } from "../types.js";

/** Identity helper that keeps each block's props typed inside its render function. */
export function defineBlock<P extends Record<string, unknown>>(definition: BlockDefinition<P>): BlockDefinition {
  return definition as unknown as BlockDefinition;
}

/** Common heading fields most sections share. */
export const headingFields = [
  { name: "eyebrow", label: "Small label above heading", type: "text" as const },
  { name: "heading", label: "Heading", type: "text" as const },
  { name: "intro", label: "Introduction", type: "textarea" as const, rows: 2 },
];
