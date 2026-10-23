import { getSupabase } from './supabase';

/** Stable machine error codes from the backend (PRD §9). */
export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'MFA_REQUIRED' | 'REAUTH_REQUIRED' | 'ACCOUNT_RESTRICTED'
  | 'PROFILE_NOT_INITIALISED' | 'CONSENT_REQUIRED' | 'MEMBERSHIP_PENDING' | 'PROFILE_PRIVATE'
  | 'UNAUTHORISED_RECIPIENT' | 'INVALID_STATE' | 'RATE_LIMITED' | 'VALIDATION' | 'NOT_FOUND'
  | 'AGE_INELIGIBLE' | 'STALE_VERSION' | 'INVITATION_EXPIRED' | 'INVITATION_PHONE_MISMATCH'
  | 'EVIDENCE_EXPIRED' | 'NETWORK' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public hint?: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(hint || code);
  }
}

const KNOWN = /^[A-Z_]+$/;

/**
 * Calls a database RPC. Raised errors ({message: CODE, hint}) and audited denials
 * returned as {error: CODE, message} are both converted into ApiError.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) {
    if (error.code === 'P0001' && KNOWN.test(error.message)) {
      let details: unknown;
      try { details = error.details ? JSON.parse(error.details) : undefined; } catch { details = undefined; }
      throw new ApiError(error.message as ErrorCode, error.hint || undefined, details);
    }
    if (error.code === '42501' || error.code === 'PGRST301') throw new ApiError('UNAUTHENTICATED');
    if (!error.code) throw new ApiError('NETWORK', error.message);
    throw new ApiError('UNKNOWN', error.message);
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data && typeof data.error === 'string') {
    throw new ApiError(data.error as ErrorCode, (data as { message?: string }).message ?? undefined);
  }
  return data as T;
}

export function isApiError(e: unknown, code?: ErrorCode): e is ApiError {
  return e instanceof ApiError && (!code || e.code === code);
}
