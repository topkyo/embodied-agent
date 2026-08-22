export type WebAuthRole = "admin" | "user";

export type AuthMe = {
  user_id: string;
  role: WebAuthRole;
  display_name: string;
};

export type BootstrapStatus = {
  available: boolean;
  redeemed: boolean;
};

export type WebAccountSummary = {
  user_id: string;
  role: WebAuthRole;
  display_name: string;
  email?: string;
  created_at: string;
};

export type InviteIssue = {
  token: string;
  role: WebAuthRole;
  expires_at: string;
  redeem_path: string;
};

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchAuthMe(): Promise<AuthMe> {
  return authFetch<AuthMe>("/auth/me");
}

export function fetchBootstrapStatus(): Promise<BootstrapStatus> {
  return authFetch<BootstrapStatus>("/auth/bootstrap-status");
}

export function redeemInvite(input: {
  token: string;
  email: string;
  password: string;
  display_name?: string;
}): Promise<AuthMe> {
  return authFetch<AuthMe>("/auth/invite/redeem", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function issueInvite(role?: WebAuthRole): Promise<InviteIssue> {
  return authFetch<InviteIssue>("/auth/invite", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function listWebAccounts(): Promise<{ accounts: WebAccountSummary[] }> {
  return authFetch<{ accounts: WebAccountSummary[] }>("/auth/accounts");
}

export function createWebAccount(input: {
  email: string;
  password: string;
  display_name?: string;
  role?: WebAuthRole;
}): Promise<AuthMe> {
  return authFetch<AuthMe>("/auth/account/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setWebAccountPassword(
  userId: string,
  password: string,
  email?: string,
): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>("/auth/account/password", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      password,
      ...(email?.trim() ? { email: email.trim() } : {}),
    }),
  });
}

export function loginWithEmail(email: string, password: string): Promise<AuthMe> {
  return authFetch<AuthMe>("/auth/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function redeemBootstrap(input: {
  install_code: string;
  email: string;
  password: string;
  display_name?: string;
}): Promise<AuthMe> {
  return authFetch<AuthMe>("/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logoutSession(): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
}
