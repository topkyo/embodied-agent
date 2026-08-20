import type { DomainPackContract, DomainPackOpsSchema } from "@embodied-agent/core";
import { createDomainPackOpsSchema } from "@embodied-agent/domain-sdk";

/** Contract-first ops schema 主路径。 */
export function buildDomainPackOpsSchemaFromContract(
  contract: DomainPackContract,
): DomainPackOpsSchema {
  const declared = contract.capabilities.find((capability) => capability.kind === "ops");
  if (declared && "schema" in declared && declared.schema) {
    return declared.schema;
  }

  return createDomainPackOpsSchema(contract.core);
}
