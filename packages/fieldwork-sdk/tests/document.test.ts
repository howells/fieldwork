import { afterEach, describe, expect, it, vi } from "vitest";

import { documentPart } from "../src/document.js";

const bytes = [37, 80, 68, 70];

/** Records the parts each new Blob is built from. */
const recordBlobParts = () => {
  const parts: ConstructorParameters<typeof Blob>[0][] = [];
  class RecordingBlob extends Blob {
    constructor(...args: ConstructorParameters<typeof Blob>) {
      super(...args);
      parts.push(args[0]);
    }
  }
  vi.stubGlobal("Blob", RecordingBlob);
  return parts;
};

describe(documentPart, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands bytes on an ArrayBuffer to the Blob without copying them first", async () => {
    const parts = recordBlobParts();
    const data = new Uint8Array(bytes);
    const part = documentPart({ data, name: "sheet.pdf" });
    expect(parts[0]?.[0]).toBe(data);
    expect(part.type).toBe("application/pdf");
    expect([...new Uint8Array(await part.arrayBuffer())]).toStrictEqual(bytes);
  });

  it("copies bytes on a SharedArrayBuffer, which a Blob cannot take", async () => {
    const parts = recordBlobParts();
    const data = new Uint8Array(new SharedArrayBuffer(bytes.length));
    data.set(bytes);
    const part = documentPart({ data, name: "notes.unknown" });
    expect(parts[0]?.[0]).not.toBe(data);
    expect(part.type).toBe("application/octet-stream");
    expect([...new Uint8Array(await part.arrayBuffer())]).toStrictEqual(bytes);
  });
});
