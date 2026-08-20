import { describe, expect, it } from "vitest";
import {
  deploymentSchema,
  registryEntitySchema,
  deviceSchema,
  deviceTypeSchema,
  nodeSchema,
  nodeStatusSchema,
} from "./device.js";

describe("deploymentSchema", () => {
  const validDeployment = {
    deployment_id: "dep-001",
    name: "Greenhouse Alpha",
    timezone: "Asia/Shanghai",
    status: "active",
  };

  it("accepts a valid deployment", () => {
    expect(deploymentSchema.parse(validDeployment)).toEqual(validDeployment);
  });

  it("accepts disabled status", () => {
    expect(deploymentSchema.parse({ ...validDeployment, status: "disabled" }).status).toBe(
      "disabled",
    );
  });

  it("rejects empty deployment_id", () => {
    expect(deploymentSchema.safeParse({ ...validDeployment, deployment_id: "" }).success).toBe(
      false,
    );
  });

  it("rejects empty name", () => {
    expect(deploymentSchema.safeParse({ ...validDeployment, name: "" }).success).toBe(false);
  });

  it("rejects empty timezone", () => {
    expect(deploymentSchema.safeParse({ ...validDeployment, timezone: "" }).success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    expect(deploymentSchema.safeParse({ ...validDeployment, status: "pending" }).success).toBe(
      false,
    );
  });

  it("rejects missing required fields", () => {
    expect(deploymentSchema.safeParse({}).success).toBe(false);
  });
});

describe("registryEntitySchema", () => {
  const validEntity = {
    entity_id: "entity-001",
    entity_type: "greenhouse",
    domain_id: "agriculture",
    deployment_id: "dep-001",
    name: "Greenhouse 1",
    aliases: ["gh1", "alpha"],
    status: "active",
  };

  it("accepts a valid entity", () => {
    expect(registryEntitySchema.parse(validEntity)).toEqual(validEntity);
  });

  it("accepts optional metadata", () => {
    const withMeta = { ...validEntity, metadata: { location: "east" } };
    expect(registryEntitySchema.parse(withMeta).metadata).toEqual({ location: "east" });
  });

  it("accepts empty aliases array", () => {
    expect(registryEntitySchema.parse({ ...validEntity, aliases: [] }).aliases).toEqual([]);
  });

  it("rejects empty aliases containing empty strings", () => {
    expect(registryEntitySchema.safeParse({ ...validEntity, aliases: [""] }).success).toBe(false);
  });

  it("rejects empty entity_id", () => {
    expect(registryEntitySchema.safeParse({ ...validEntity, entity_id: "" }).success).toBe(false);
  });

  it("rejects empty entity_type", () => {
    expect(registryEntitySchema.safeParse({ ...validEntity, entity_type: "" }).success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    expect(registryEntitySchema.safeParse({ ...validEntity, status: "pending" }).success).toBe(
      false,
    );
  });

  it("rejects missing required fields", () => {
    expect(registryEntitySchema.safeParse({ entity_id: "e1" }).success).toBe(false);
  });
});

describe("deviceTypeSchema", () => {
  it("accepts non-empty string", () => {
    expect(deviceTypeSchema.parse("vent")).toBe("vent");
  });

  it("rejects empty string", () => {
    expect(deviceTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("nodeStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const status of ["pending", "active", "disabled", "maintenance"]) {
      expect(nodeStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(nodeStatusSchema.safeParse("online").success).toBe(false);
  });
});

describe("nodeSchema", () => {
  const validNode = {
    node_id: "node-001",
    deployment_id: "dep-001",
    status: "active",
  };

  it("accepts a minimal valid node", () => {
    expect(nodeSchema.parse(validNode)).toEqual(validNode);
  });

  it("accepts a fully populated node", () => {
    const full = {
      ...validNode,
      entity_id: "entity-001",
      name: "Node Alpha",
      firmware_version: "1.0.0",
      config_version: 3,
      registered_at: "2026-01-01T00:00:00.000Z",
      last_seen_at: "2026-07-12T00:00:00.000Z",
    };
    expect(nodeSchema.parse(full)).toEqual(full);
  });

  it("rejects empty node_id", () => {
    expect(nodeSchema.safeParse({ ...validNode, node_id: "" }).success).toBe(false);
  });

  it("rejects empty deployment_id", () => {
    expect(nodeSchema.safeParse({ ...validNode, deployment_id: "" }).success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    expect(nodeSchema.safeParse({ ...validNode, status: "online" }).success).toBe(false);
  });

  it("rejects negative config_version", () => {
    expect(nodeSchema.safeParse({ ...validNode, config_version: -1 }).success).toBe(false);
  });

  it("accepts zero config_version", () => {
    expect(nodeSchema.parse({ ...validNode, config_version: 0 }).config_version).toBe(0);
  });

  it("rejects non-integer config_version", () => {
    expect(nodeSchema.safeParse({ ...validNode, config_version: 1.5 }).success).toBe(false);
  });

  it("rejects invalid datetime for registered_at", () => {
    expect(nodeSchema.safeParse({ ...validNode, registered_at: "not-a-date" }).success).toBe(false);
  });
});

describe("deviceSchema", () => {
  const validDevice = {
    device_id: "device-001",
    deployment_id: "dep-001",
    device_type: "vent",
    name: "Vent 1",
    aliases: ["v1"],
    node_id: "node-001",
    status: "active",
  };

  it("accepts a minimal valid device", () => {
    expect(deviceSchema.parse(validDevice)).toEqual(validDevice);
  });

  it("accepts a fully populated device", () => {
    const full = {
      ...validDevice,
      entity_id: "entity-001",
      capabilities: ["open", "close", "status"],
      transport: "mqtt",
      metadata: { max_duration_seconds: 600 },
    };
    expect(deviceSchema.parse(full)).toEqual(full);
  });

  it("accepts optional entity_id omitted", () => {
    expect(deviceSchema.parse(validDevice).entity_id).toBeUndefined();
  });

  it("rejects empty device_id", () => {
    expect(deviceSchema.safeParse({ ...validDevice, device_id: "" }).success).toBe(false);
  });

  it("rejects empty device_type", () => {
    expect(deviceSchema.safeParse({ ...validDevice, device_type: "" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(deviceSchema.safeParse({ ...validDevice, name: "" }).success).toBe(false);
  });

  it("rejects empty node_id", () => {
    expect(deviceSchema.safeParse({ ...validDevice, node_id: "" }).success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    expect(deviceSchema.safeParse({ ...validDevice, status: "pending" }).success).toBe(false);
  });

  it("rejects aliases with empty strings", () => {
    expect(deviceSchema.safeParse({ ...validDevice, aliases: [""] }).success).toBe(false);
  });

  it("accepts empty aliases array", () => {
    expect(deviceSchema.parse({ ...validDevice, aliases: [] }).aliases).toEqual([]);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "offline", "maintenance", "disabled"]) {
      expect(deviceSchema.parse({ ...validDevice, status }).status).toBe(status);
    }
  });

  it("rejects missing required fields", () => {
    expect(deviceSchema.safeParse({ device_id: "d1" }).success).toBe(false);
  });
});
