import { appendFileSync } from "node:fs";
import { signFlywheelAttestation } from "@embodied-agent/runtime";

export type FlywheelAttestationRow = Record<string, unknown> & {
  ts: string;
  attestation?: string;
};

export function flywheelAttestationSecret(): string | null {
  const secret =
    process.env.FLYWHEEL_ATTESTATION_SECRET?.trim() ||
    process.env.EVIDENCE_ATTESTATION_SECRET?.trim();
  return secret || null;
}

export function appendSignedFlywheelAttestation(
  path: string,
  row: Omit<FlywheelAttestationRow, "ts" | "attestation">,
): FlywheelAttestationRow {
  const unsigned: FlywheelAttestationRow = {
    ts: new Date().toISOString(),
    ...row,
  };
  const secret = flywheelAttestationSecret();
  if (secret) {
    unsigned.attestation = signFlywheelAttestation(unsigned, secret);
  }
  appendFileSync(path, `${JSON.stringify(unsigned)}\n`, "utf8");
  return unsigned;
}
