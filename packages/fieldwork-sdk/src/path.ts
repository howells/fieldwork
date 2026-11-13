import { isNumber } from "./tools/json.js";

/** A JSON path, with brackets for indices and keys that are not identifiers. */
export const joinPath = (segments: readonly (string | number)[]): string => {
  let path = "";
  for (const key of segments) {
    if (isNumber(key)) {
      path += `[${key}]`;
    } else {
      path += /^[A-Za-z_$][\w$]*$/u.test(key)
        ? `${path ? "." : ""}${key}`
        : `[${JSON.stringify(key)}]`;
    }
  }
  return path;
};
