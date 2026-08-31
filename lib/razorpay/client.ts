import Razorpay from "razorpay";

/**
 * Razorpay Test Mode Client Factory
 *
 * Enforces strict test-mode constraints:
 * 1. Requires `RAZORPAY_KEY_ID` to start with `rzp_test_`.
 * 2. Explicitly rejects `rzp_live_` to prevent any real customer charge risks.
 * 3. Never exposes keys to client-side code (server-only).
 */

export class RazorpayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayConfigError";
  }
}

export function isRazorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(keyId && keySecret && keyId.startsWith("rzp_test_"));
}

export function getRazorpayClient(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  if (keyId.startsWith("rzp_live_")) {
    throw new RazorpayConfigError(
      "CRITICAL: Live Razorpay key detected! The AI Revenue Recovery Agent is strictly restricted to Test Mode (rzp_test_*)."
    );
  }

  if (!keyId.startsWith("rzp_test_")) {
    throw new RazorpayConfigError(
      `Invalid Razorpay Key ID '${keyId}'. Must start with 'rzp_test_' for test mode operations.`
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}
