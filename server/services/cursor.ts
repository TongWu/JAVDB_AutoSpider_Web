import { HTTPException } from "hono/http-exception";

export function cursorEncode(values: Record<string, unknown>): string {
  return btoa(JSON.stringify(values));
}

export function cursorDecode<T = Record<string, unknown>>(cursor: string): T {
  try {
    const decoded = atob(cursor);
    const parsed = JSON.parse(decoded);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("not an object");
    }
    return parsed as T;
  } catch {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          code: "invalid_cursor",
          message: "Invalid cursor format. Please reload the page.",
        },
      }),
    });
  }
}
