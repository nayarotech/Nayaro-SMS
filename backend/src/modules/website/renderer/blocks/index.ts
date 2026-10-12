import type { BlockDefinition } from "../types.js";
import { contactBlock, enquiryBlock } from "./contact.js";
import { ctaBlock, faqBlock, featuresBlock, imageTextBlock, spacerBlock, statsBlock, testimonialsBlock, textBlock } from "./content.js";
import { announcementBlock, heroBlock, pageHeaderBlock } from "./headers.js";
import { galleryBlock, imageBlock, videoBlock } from "./media.js";
import { downloadsBlock, eventsBlock, messageBlock, newsBlock, noticesBlock, teamBlock } from "./school.js";

/**
 * Every block the page editor offers, in the order shown in its library.
 *
 * To add a block: create it with defineBlock() (type, fields, defaults, render)
 * and add it here. The editor, the public site and rich-text sanitising pick it up
 * automatically.
 */
export const BLOCKS: BlockDefinition[] = [
  heroBlock,
  pageHeaderBlock,
  announcementBlock,
  textBlock,
  imageTextBlock,
  featuresBlock,
  statsBlock,
  ctaBlock,
  testimonialsBlock,
  faqBlock,
  spacerBlock,
  imageBlock,
  galleryBlock,
  videoBlock,
  messageBlock,
  teamBlock,
  downloadsBlock,
  noticesBlock,
  newsBlock,
  eventsBlock,
  contactBlock,
  enquiryBlock,
];

export const BLOCKS_BY_TYPE = new Map(BLOCKS.map((block) => [block.type, block]));

export function getBlock(type: string): BlockDefinition | undefined {
  return BLOCKS_BY_TYPE.get(type);
}
