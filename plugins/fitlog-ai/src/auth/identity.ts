import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OwnerContext } from "../storage/repository.ts";

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export interface VerifiedUser {
  id?: string;
  email?: string;
}

export interface IdentityVerifierConfig {
  allowedEmail: string;
  getUser(accessToken: string): Promise<VerifiedUser | null>;
}

export type IdentityVerifier = (accessToken: string) => Promise<AuthInfo>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createIdentityVerifier(config: IdentityVerifierConfig): IdentityVerifier {
  const allowedEmail = normalizeEmail(config.allowedEmail);
  if (!allowedEmail) throw new Error("FITLOG_ALLOWED_EMAIL is required");

  return async (accessToken: string): Promise<AuthInfo> => {
    if (!accessToken.trim()) throw new AuthorizationError(401, "authorization required");
    let user: VerifiedUser | null;
    try {
      user = await config.getUser(accessToken);
    } catch {
      throw new AuthorizationError(401, "authorization required");
    }
    if (!user?.id || !user.email) throw new AuthorizationError(401, "authorization required");
    const email = normalizeEmail(user.email);
    if (email !== allowedEmail) throw new AuthorizationError(403, "account is not allowed");

    const owner: OwnerContext = { id: user.id, email, accessToken };
    return {
      token: accessToken,
      clientId: "chatgpt",
      scopes: ["openid", "email", "profile"],
      extra: { owner }
    };
  };
}

export interface SupabaseIdentityVerifierConfig {
  allowedEmail: string;
  url: string;
  publishableKey: string;
}

export function createSupabaseIdentityVerifier(config: SupabaseIdentityVerifierConfig): IdentityVerifier {
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return createIdentityVerifier({
    allowedEmail: config.allowedEmail,
    getUser: async (accessToken) => {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email };
    }
  });
}
