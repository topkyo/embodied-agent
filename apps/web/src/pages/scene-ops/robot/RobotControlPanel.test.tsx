import { describe, expect, it } from "vitest";
import { groupRobotControlActions, resolveRobotControlActions } from "./RobotControlPanel";
import { ROBOT_CONTROL_GROUP_ORDER } from "./control-actions";

const t = (key: string) => key;

describe("resolveRobotControlActions / groupRobotControlActions", () => {
  it("fallback actions cover all groups in stable order", () => {
    const actions = resolveRobotControlActions(undefined, t, "zh");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.confirm)).toBe(true);

    const grouped = groupRobotControlActions(actions);
    const groups = grouped.map((g) => g.group);
    expect(groups).toEqual(ROBOT_CONTROL_GROUP_ORDER.filter((id) => groups.includes(id)));
    expect(groups).toContain("emergency");
    expect(groups).toContain("diagnostic");
    expect(groups).toContain("motion");
  });

  it("maps schema actions into groups and keeps confirm flags", () => {
    const actions = resolveRobotControlActions(
      [
        {
          id: "move",
          label: "robot.move",
          skill: "robot.move",
          physical: true,
          requires_confirmation: true,
          parameters: { x: 0.2 },
        },
        {
          id: "q",
          label: "robot.query_status",
          skill: "robot.query_status",
          physical: false,
          requires_confirmation: false,
        },
      ],
      t,
      "en",
    );
    expect(actions).toHaveLength(2);
    expect(actions.find((a) => a.skill === "robot.move")?.group).toBe("motion");
    expect(actions.find((a) => a.skill === "robot.move")?.confirm).toBe(true);
    expect(actions.find((a) => a.skill === "robot.query_status")?.group).toBe("diagnostic");
  });
});
