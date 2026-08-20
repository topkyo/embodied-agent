#!/usr/bin/env npx tsx
import { INTENT_SCHEMA_CHEATSHEET } from "../packages/agent/src/intent/generated/intent-cheatsheet.js";
import { INTENT_SCHEMA_CHEATSHEET_SOURCE } from "../packages/agent/src/intent/schema-contract.js";

if (INTENT_SCHEMA_CHEATSHEET !== INTENT_SCHEMA_CHEATSHEET_SOURCE) {
  console.error("intent cheatsheet out of sync, run: npm run codegen:intent");
  process.exit(1);
}
