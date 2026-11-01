import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { sendSparrowSms } from "../src/lib/sms/index.js";
const original = { SPARROW_SMS_TOKEN: env.SPARROW_SMS_TOKEN, SPARROW_SMS_FROM: env.SPARROW_SMS_FROM };
afterEach(() => { Object.assign(env, original); vi.unstubAllGlobals(); });
function configured() { env.SPARROW_SMS_TOKEN = "test-token"; env.SPARROW_SMS_FROM = "TestSchool"; }

describe("Sparrow SMS submission", () => {
  it("requires provider credentials before network access", async () => {
    env.SPARROW_SMS_TOKEN = undefined;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(sendSparrowSms("9801234567", "Reminder")).rejects.toMatchObject({ outcome: "REJECTED", code: "NOT_CONFIGURED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("form-encodes the documented request and requires a nonzero provider acceptance count", async () => {
    configured();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response_code: 200, count: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendSparrowSms("+9779801234567", "NPR 100.00 outstanding");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.sparrowsms.com/v2/sms/");
    expect(options.body.get("to")).toBe("9801234567");
    expect(options.body.get("text")).toBe("NPR 100.00 outstanding");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("recognizes provider rejection even on HTTP 200 without exposing the response text", async () => {
    configured();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ response_code: 1013, response: "private diagnostic text" }), { status: 200 })));
    await expect(sendSparrowSms("9801234567", "Reminder")).rejects.toMatchObject({ outcome: "REJECTED", code: "PROVIDER_1013", message: "SMS PROVIDER_1013" });
  });
  it("marks network failures and invalid provider responses as uncertain", async () => {
    configured();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response("not JSON", { status: 502 })).mockResolvedValueOnce(new Response(JSON.stringify({ response_code: 200, count: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(sendSparrowSms("9801234567", "Reminder")).rejects.toMatchObject({ outcome: "UNKNOWN", code: "NETWORK_OR_TIMEOUT" });
    await expect(sendSparrowSms("9801234567", "Reminder")).rejects.toMatchObject({ outcome: "UNKNOWN", code: "INVALID_RESPONSE" });
    await expect(sendSparrowSms("9801234567", "Reminder")).rejects.toMatchObject({ outcome: "UNKNOWN", code: "UNCONFIRMED_RESPONSE" });
  });
});
