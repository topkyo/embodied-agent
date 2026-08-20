async function doAdminFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers, credentials: "include" });
}

export class AdminFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AdminFetchError";
  }
}

export async function adminFetch(path: string, init?: RequestInit) {
  const res = await doAdminFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new AdminFetchError(message, res.status, body);
  }
  return res.json();
}
