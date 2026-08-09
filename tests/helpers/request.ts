import { NextRequest } from "next/server";

// Builds a NextRequest the same way route handlers receive one at runtime,
// without needing an actual HTTP server — route handlers are plain
// (request, context) => Response functions, so calling them directly with
// one of these is enough to exercise the real handler code.
export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}
