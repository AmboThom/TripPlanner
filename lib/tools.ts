import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  PageExistsError,
  StalePageWriteError,
  listPages,
  readPage,
  writePage,
} from "./db";

/**
 * The store refuses a stale or duplicate write by throwing, and those messages
 * were written to tell the caller what to do next. Returned as a tool result the
 * assistant reads them and retries. Thrown, the runner aborts and the turn dies.
 *
 * Anything else is a real failure and must reach the unexpected-error path
 * rather than being handed to the model as an ordinary result.
 */
function storeGuidance(error: unknown): string {
  if (error instanceof StalePageWriteError || error instanceof PageExistsError) {
    return error.message;
  }
  throw error;
}

export const listPagesTool = betaTool({
  name: "list_pages",
  description:
    "List every page that exists, most recently updated first. Call this before " +
    "creating a page, so you reuse an existing one instead of making a near-duplicate.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: () =>
    JSON.stringify(
      listPages().map((page) => ({ title: page.title, updated_at: page.updatedAt })),
    ),
});

export const readPageTool = betaTool({
  name: "read_page",
  description:
    "Read one page in full. Titles match regardless of case. Call this before " +
    "write_page on a page that exists, and pass back the updated_at it returns.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string", description: "The page title." } },
    required: ["title"],
    additionalProperties: false,
  },
  run: ({ title }) => {
    const page = readPage(title);
    if (!page) {
      return `No page titled "${title}" exists. To create it, call write_page with expected_updated_at set to null.`;
    }
    return JSON.stringify({
      title: page.title,
      body: page.body,
      updated_at: page.updatedAt,
    });
  },
});

/**
 * An HTML entity in a title is stored verbatim and also folded into title_key,
 * so the page becomes unfindable by its real name. Caught here and returned as
 * guidance, the same shape as a stale or duplicate write, so the assistant
 * retries with plain text.
 */
const HTML_ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/;

export const writePageTool = betaTool({
  name: "write_page",
  description:
    "Create a page, or replace the body of one that exists. This replaces the " +
    "whole body, so read_page first and fold your new information into what is " +
    "already there. Pass the updated_at that read_page returned, or null to create.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The category name. You choose it; there is no fixed list.",
      },
      body: { type: "string", description: "The complete new body, as markdown." },
      expected_updated_at: {
        type: ["string", "null"],
        description:
          "The updated_at that read_page returned, or null when creating a new page.",
      },
    },
    required: ["title", "body", "expected_updated_at"],
    additionalProperties: false,
  },
  run: ({ title, body, expected_updated_at }) => {
    // Checked here rather than caught from the store, so no error message is
    // matched as a string anywhere.
    if (!title.trim()) {
      return "A page needs a title. Call write_page again with a non-empty title.";
    }

    const entity = title.match(HTML_ENTITY);
    if (entity) {
      return (
        `The title contains the HTML entity ${entity[0]}. Titles are plain text, ` +
        `not HTML: write & rather than &amp;. Call write_page again with the ` +
        `title written plainly.`
      );
    }

    try {
      const page = writePage({ title, body, expectedUpdatedAt: expected_updated_at });
      return JSON.stringify({
        title: page.title,
        body: page.body,
        updated_at: page.updatedAt,
      });
    } catch (error) {
      return storeGuidance(error);
    }
  },
});

export const tools = [listPagesTool, readPageTool, writePageTool];
