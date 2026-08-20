export type WebRole = "admin" | "user";

export type WebAccount = {
  user_id: string;
  role: WebRole;
  display_name: string;
  email?: string;
  password_hash?: string;
  created_at: string;
};

export type WebAccountsFile = {
  bootstrap_redeemed: boolean;
  users: WebAccount[];
};

export type WebSessionRecord = {
  session_id: string;
  user_id: string;
  role: WebRole;
  display_name: string;
  created_at: number;
  expires_at: number;
};

export type InviteRecord = {
  token: string;
  role: WebRole;
  created_by: string;
  created_at: number;
  expires_at: number;
  redeemed_at?: number;
  redeemed_by?: string;
};

export type WebSessionView = {
  user_id: string;
  role: WebRole;
  display_name: string;
};
