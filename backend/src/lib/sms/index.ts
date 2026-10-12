import { env } from "../../config/env.js";
import { logger } from "../logger.js";

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

/** Development: print the message to the server log instead of sending it. */
const consoleProvider: SmsProvider = {
  async send(to, message) {
    logger.info({ to }, `[SMS] ${message}`);
  },
};

/** Sparrow SMS (Nepal) — https://docs.sparrowsms.com */
const sparrowProvider: SmsProvider = {
  async send(to, message) {
    const response = await fetch("https://api.sparrowsms.com/v2/sms/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: env.SPARROW_SMS_TOKEN,
        from: env.SPARROW_SMS_FROM,
        to: to.replace(/^\+977/, ""),
        text: message,
      }),
    });
    if (!response.ok) {
      throw new Error(`Sparrow SMS failed (${response.status}): ${await response.text()}`);
    }
  },
};

const providers: Record<typeof env.SMS_PROVIDER, SmsProvider> = {
  console: consoleProvider,
  sparrow: sparrowProvider,
};

export const sms = providers[env.SMS_PROVIDER];
