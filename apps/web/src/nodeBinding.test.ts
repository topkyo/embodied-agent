import { describe, expect, it } from "vitest";
import {
  devicesTemplateForNode,
  registerDeviceTemplateForPack,
  supportsDeviceTemplateForPack,
} from "./nodeBinding";

// 模板真源：scenes/robot/scene/pack.ts opsDeviceTemplate
const ROBOTICS_TEMPLATE = [
  {
    device_id: "robot-{node}",
    device_type: "robot_dog",
    name: "M20 机器狗",
    default_for: "robot_dog",
    status: "active",
  },
] as const;

// 模板真源：scenes/greenhouse/scene/pack.ts opsDeviceTemplate
const AGRICULTURE_TEMPLATE = [
  {
    device_id: "sensor-{node}",
    device_type: "sensor",
    name: "温湿度传感器",
    channel: "i2c:0x44",
    metrics: ["temperature_c", "humidity_percent"],
    status: "active",
  },
  {
    device_id: "vent-{node}",
    device_type: "vent_motor",
    name: "左侧帘",
    channel: "relay:vent_left",
    default_for: "vent_motor",
    status: "active",
  },
  {
    device_id: "fan-{node}",
    device_type: "fan",
    name: "风机",
    channel: "relay:fan_01",
    status: "active",
  },
  {
    device_id: "controller-{node}",
    device_type: "greenhouse_controller",
    name: "环控器",
    default_for: "greenhouse_controller",
    status: "active",
  },
] as const;

// 模板真源：scenes/industrial/scene/pack.ts opsDeviceTemplate
const INDUSTRIAL_TEMPLATE = [
  {
    device_id: "sensor-{node}",
    device_type: "sensor",
    name: "柜体温度传感器",
    channel: "i2c:0x48",
    metrics: ["temperature_c"],
    status: "active",
  },
  {
    device_id: "fan-{node}",
    device_type: "fan",
    name: "排风风机",
    channel: "relay:exhaust",
    default_for: "exhaust_fan",
    status: "active",
  },
] as const;

describe("node binding templates", () => {
  it("supports industrial overheat exhaust devices from registered template", () => {
    registerDeviceTemplateForPack("industrial", INDUSTRIAL_TEMPLATE);
    expect(supportsDeviceTemplateForPack("industrial")).toBe(true);
    expect(devicesTemplateForNode("node-industrial-001", "industrial")).toEqual([
      {
        device_id: "sensor-industrial-001",
        device_type: "sensor",
        name: "柜体温度传感器",
        channel: "i2c:0x48",
        metrics: ["temperature_c"],
        status: "active",
      },
      {
        device_id: "fan-industrial-001",
        device_type: "fan",
        name: "排风风机",
        channel: "relay:exhaust",
        default_for: "exhaust_fan",
        status: "active",
      },
    ]);
  });

  it("supports robotics single robot_dog device from registered template", () => {
    registerDeviceTemplateForPack("robotics", ROBOTICS_TEMPLATE);
    expect(supportsDeviceTemplateForPack("robotics")).toBe(true);
    expect(devicesTemplateForNode("node-m20-001", "robotics")).toEqual([
      {
        device_id: "robot-m20-001",
        device_type: "robot_dog",
        name: "M20 机器狗",
        default_for: "robot_dog",
        status: "active",
      },
    ]);
  });

  it("supports agriculture sensor/vent/fan/controller devices from registered template", () => {
    registerDeviceTemplateForPack("agriculture", AGRICULTURE_TEMPLATE);
    expect(supportsDeviceTemplateForPack("agriculture")).toBe(true);
    expect(devicesTemplateForNode("node-gh-001-a", "agriculture")).toEqual([
      {
        device_id: "sensor-gh-001-a",
        device_type: "sensor",
        name: "温湿度传感器",
        channel: "i2c:0x44",
        metrics: ["temperature_c", "humidity_percent"],
        status: "active",
      },
      {
        device_id: "vent-gh-001-a",
        device_type: "vent_motor",
        name: "左侧帘",
        channel: "relay:vent_left",
        default_for: "vent_motor",
        status: "active",
      },
      {
        device_id: "fan-gh-001-a",
        device_type: "fan",
        name: "风机",
        channel: "relay:fan_01",
        status: "active",
      },
      {
        device_id: "controller-gh-001-a",
        device_type: "greenhouse_controller",
        name: "环控器",
        default_for: "greenhouse_controller",
        status: "active",
      },
    ]);
  });

  it("does not invent devices for unknown packs", () => {
    expect(supportsDeviceTemplateForPack("aquaculture")).toBe(false);
    expect(devicesTemplateForNode("node-aqua-001", "aquaculture")).toEqual([]);
  });
});
