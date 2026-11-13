// What the document parsers (LlamaParse, Reducto) share: media types, the size
// limit check and the multipart file part.

import * as z from "zod/mini";

import { FieldworkError, invalidRequest } from "./errors.js";
import type { Box, DocumentInput, DocumentUrl } from "./types.js";
import { refuseTogether } from "./util.js";

/** Content types of the document files parsers commonly take, by extension. */
export const MEDIA_TYPES = new Map<string, string>(
  Object.entries({
    csv: "text/csv",
    doc: "application/msword",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    htm: "text/html",
    html: "text/html",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rtf: "application/rtf",
    xhtml: "application/xhtml+xml",
    xls: "application/vnd.ms-excel",
    xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
);

/** The content type the file's extension names, or undefined for one not listed. */
export const mediaTypeOf = (name: string): string | undefined =>
  MEDIA_TYPES.get(name.split(".").pop()?.toLowerCase() ?? "");

/** Refuses a file larger than the provider takes, before it is sent. */
export const refuseLarger = (
  provider: string,
  document: DocumentInput,
  maxMegabytes: number
): void => {
  const size =
    document.data instanceof Blob
      ? document.data.size
      : document.data.byteLength;
  if (size > maxMegabytes * 1024 * 1024) {
    throw new FieldworkError(
      "InvalidRequest",
      `${provider} parses files up to ${maxMegabytes} MB; ${document.name} is ${(size / 1024 / 1024).toFixed(1)} MB`,
      { provider }
    );
  }
};

/** Whether the bytes sit on an ArrayBuffer rather than a SharedArrayBuffer. */
const onArrayBuffer = (bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer;

/** The file's bytes as a multipart part, with the content type its extension names. */
export const documentPart = (document: DocumentInput): Blob => {
  // A Blob cannot take bytes on a SharedArrayBuffer, so only those are copied
  // onto an ArrayBuffer; the Blob copies everything else once itself.
  const { data } = document;
  const part =
    data instanceof Uint8Array && !onArrayBuffer(data)
      ? new Uint8Array(data)
      : data;
  return new Blob([part], {
    type: mediaTypeOf(document.name) ?? "application/octet-stream",
  });
};

/** The smallest box that holds every one of `boxes`, or undefined when there are none. */
export const enclosing = (boxes: readonly Box[]): Box | undefined => {
  if (boxes.length <= 1) {
    return boxes[0];
  }
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { height: bottom - top, left, top, width: right - left };
};

/** Refuses mixed byte/URL inputs and non-HTTP URLs before a provider request. */
export const documentUrl = (
  provider: string,
  document: DocumentUrl
): string => {
  refuseTogether(provider, document, "url", "data");
  refuseTogether(provider, document, "url", "name");
  const parsed = z.safeParse(z.url({ protocol: /^https?$/u }), document.url);
  if (!parsed.success) {
    throw invalidRequest(
      provider,
      "document url must be a public HTTP or HTTPS URL"
    );
  }
  return parsed.data;
};
