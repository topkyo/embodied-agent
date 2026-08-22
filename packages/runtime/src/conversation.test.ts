import type { DomainPackConversation } from "@embodied-agent/core";
import { describe, expect, it } from "vitest";
import {
  buildActiveDomainAliasIndex,
  buildActiveDomainCompoundQueryIntents,
  matchActiveDomainCompoundQuery,
} from "./conversation.js";
import {
  makeActiveRegistry,
  makeRuntimeTestContext,
  makeTestContract,
  makeTestCore,
  TEST_DEPLOYMENT_ID,
} from "./test-runtime-context.js";

function makeConversationContract(conversation: DomainPackConversation) {
  return makeTestContract(makeTestCore(), [{ kind: "conversation", value: conversation }]);
}

describe("conversation", () => {
  it("returns empty alias index when conversation capability is absent", () => {
    const ctx = makeRuntimeTestContext();
    expect(buildActiveDomainAliasIndex(ctx)).toEqual({});
  });

  it("builds alias index from active conversation capability", () => {
    const ctx = makeRuntimeTestContext({
      contract: makeConversationContract({
        buildAliasIndex: (registry, deploymentId) => ({
          "1号棚": [registry.devices[0]?.device_id ?? "missing"],
          deployment: [deploymentId],
        }),
      }),
    });
    expect(buildActiveDomainAliasIndex(ctx)).toEqual({
      "1号棚": [makeActiveRegistry().devices[0]!.device_id],
      deployment: [TEST_DEPLOYMENT_ID],
    });
  });

  it("matches compound queries via active conversation capability", () => {
    const ctx = makeRuntimeTestContext({
      contract: makeConversationContract({
        matchCompoundQuery: (text) => text.includes("天气"),
      }),
    });
    expect(matchActiveDomainCompoundQuery(ctx, "现在天气怎么样")).toBe(true);
    expect(matchActiveDomainCompoundQuery(ctx, "查温度")).toBe(false);
  });

  it("returns false when compound matcher is absent", () => {
    const ctx = makeRuntimeTestContext();
    expect(matchActiveDomainCompoundQuery(ctx, "现在天气怎么样")).toBe(false);
  });

  it("builds compound query intents for active deployment", () => {
    const statusIntent = {
      skill: "greenhouse.query_status",
      target: {},
      parameters: {},
      confidence: 1,
    };
    const weatherIntent = {
      skill: "weather.query_forecast",
      target: {},
      parameters: {},
      confidence: 1,
    };
    const ctx = makeRuntimeTestContext({
      contract: makeConversationContract({
        buildCompoundQueryIntents: (deploymentId) => ({
          [`${deploymentId}-status`]: statusIntent,
          [`${deploymentId}-weather`]: weatherIntent,
        }),
      }),
    });
    expect(buildActiveDomainCompoundQueryIntents(ctx)).toEqual({
      [`${TEST_DEPLOYMENT_ID}-status`]: statusIntent,
      [`${TEST_DEPLOYMENT_ID}-weather`]: weatherIntent,
    });
  });

  it("returns empty compound intents when builder is absent", () => {
    const ctx = makeRuntimeTestContext();
    expect(buildActiveDomainCompoundQueryIntents(ctx)).toEqual({});
  });
});
