#!/usr/bin/env node
/**
 * Critical: Check environment before doing anything else
 */

console.log("=== Environment Configuration ===\n");

const requiredEnv = [
  "OPENAI_API_KEY",
  "MONGODB_URI",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
];

for (const key of requiredEnv) {
  const value = process.env[key];
  if (value) {
    const masked =
      key === "OPENAI_API_KEY"
        ? value.substring(0, 10) + "..." + value.substring(value.length - 10)
        : "***REDACTED***";
    console.log(`✅ ${key}: ${masked}`);
  } else {
    console.log(`❌ ${key}: MISSING`);
  }
}

// Now test basic imports
console.log("\n=== Testing Imports ===\n");

try {
  console.log("Importing OpenAI...");
  const OpenAI = require("openai").default;
  console.log("✅ OpenAI imported");

  if (process.env.OPENAI_API_KEY) {
    console.log("Creating OpenAI client...");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("✅ OpenAI client created");
  } else {
    console.log("⚠️  Skipping OpenAI client creation (no API key)");
  }
} catch (error) {
  console.error("❌ Error:", error instanceof Error ? error.message : error);
}

console.log("\n=== Configuration Check Complete ===\n");
