import type { IncomingHttpHeaders } from "node:http";

import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

import { auth } from "./server.js";

export const authNodeHandler = toNodeHandler(auth);

export async function getAuthSession(headers: IncomingHttpHeaders) {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
}
