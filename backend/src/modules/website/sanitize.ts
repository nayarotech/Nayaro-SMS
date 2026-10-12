import sanitizeHtml from "sanitize-html";
import { getBlock } from "./renderer/blocks/index.js";
import type { Block, Field } from "./renderer/types.js";

/**
 * Rich text from the editor is HTML, so it's cleaned on save: only basic
 * formatting, links, lists, tables and images survive. Scripts, styles and
 * event handlers are removed.
 */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "img", "hr", "span"],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, ...(attribs.target === "_blank" ? { rel: "noopener" } : {}) },
      }),
    },
  });
}

/** Plain text version of rich text, e.g. for automatic excerpts. */
export function richTextToPlain(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

function sanitizeProps(props: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  const clean = { ...props };
  for (const field of fields) {
    const value = clean[field.name];
    if (field.type === "richtext" && typeof value === "string") clean[field.name] = sanitizeRichText(value);
    if (field.type === "list" && Array.isArray(value)) {
      clean[field.name] = value.map((item) => (item && typeof item === "object" ? sanitizeProps(item as Record<string, unknown>, field.fields) : item));
    }
  }
  return clean;
}

/** Cleans every rich-text field in a page, using each block's field definitions. */
export function sanitizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    const definition = getBlock(block.type);
    return definition ? { ...block, props: sanitizeProps(block.props, definition.fields) } : block;
  });
}

/** Every file key used by image fields in a page — checked to belong to the school before saving. */
export function collectImageKeys(blocks: Block[]): string[] {
  const keys: string[] = [];
  const walk = (props: Record<string, unknown>, fields: Field[]) => {
    for (const field of fields) {
      const value = props[field.name];
      if (field.type === "image" && typeof value === "string" && value) keys.push(value);
      if (field.type === "list" && Array.isArray(value)) value.forEach((item) => item && typeof item === "object" && walk(item as Record<string, unknown>, field.fields));
    }
  };
  for (const block of blocks) {
    const definition = getBlock(block.type);
    if (definition) walk(block.props, definition.fields);
    if (block.style?.backgroundImage) keys.push(block.style.backgroundImage);
  }
  return keys;
}
