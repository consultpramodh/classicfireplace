/*
 * 008_Striven_Errors.ts
 * Standard HTTP error formatting for Striven.
 */

export class StrivenApiError extends Error {
  status: number;
  method: string;
  url: string;
  responseText: string;

  constructor(status: number, method: string, url: string, responseText: string) {
    super(formatStrivenHttpError(status, method, url, responseText));
    this.name = "StrivenApiError";
    this.status = status;
    this.method = method;
    this.url = url;
    this.responseText = responseText;
  }
}

export function formatStrivenHttpError(status: number, method: string, url: string, responseText: string): string {
  const standard =
    status === 400 ? "Validation issue. Check required fields and payload shape." :
    status === 401 ? "Token issue. Access token may be expired or invalid." :
    status === 404 ? "Wrong endpoint or missing resource." :
    status === 429 ? "Rate limit reached. Retry after waiting." :
    status >= 500 ? "Striven server issue. Retry later or escalate with response preview." :
    "Unexpected Striven HTTP error.";

  return [
    `Striven API error ${status}: ${standard}`,
    `Method: ${method.toUpperCase()}`,
    `URL: ${url}`,
    `Response: ${String(responseText || "").slice(0, 3000)}`
  ].join("\n");
}
