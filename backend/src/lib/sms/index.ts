import { env } from "../../config/env.js";
import { logger } from "../logger.js";

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

/** A rejection is definitive; other failures may have happened after submission. */
export class SmsDeliveryError extends Error {
  constructor(public readonly outcome: "REJECTED" | "UNKNOWN", public readonly code: string) {
    super(`SMS ${code}`);
  }
}

const consoleProvider: SmsProvider = {
  async send(to, message) { logger.info({ to }, `[SMS] ${message}`); },
};

/** Sparrow documents a response_code=200 as queued, not handset delivery. */
export async function sendSparrowSms(to: string, message: string): Promise<void> {
  if (!env.SPARROW_SMS_TOKEN || !env.SPARROW_SMS_FROM) throw new SmsDeliveryError("REJECTED", "NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch("https://api.sparrowsms.com/v2/sms/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: env.SPARROW_SMS_TOKEN, from: env.SPARROW_SMS_FROM, to: to.replace(/^\+977/, ""), text: message }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new SmsDeliveryError("UNKNOWN", "NETWORK_OR_TIMEOUT"); }
  let data: { response_code?: number; count?: number } | null;
  try { data = await response.json(); } catch { throw new SmsDeliveryError("UNKNOWN", "INVALID_RESPONSE"); }
  if (response.ok && data?.response_code === 200 && Number.isInteger(data.count) && data.count! >= 1) return;
  if (data?.response_code && data.response_code >= 1000 && data.response_code <= 1013) throw new SmsDeliveryError("REJECTED", `PROVIDER_${data.response_code}`);
  throw new SmsDeliveryError("UNKNOWN", "UNCONFIRMED_RESPONSE");
}

const providers: Record<typeof env.SMS_PROVIDER, SmsProvider> = {
  console: consoleProvider,
  sparrow: { send: sendSparrowSms },
};
export const sms = providers[env.SMS_PROVIDER];
