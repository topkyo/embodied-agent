import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFlywheelAdapter } from "./flywheel-adapter.js";

let testDir: string | null = null;

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = null;
  }
});

describe("createFlywheelAdapter", () => {
  it("rejects args when rejectArgs is set", () => {
    const run = createFlywheelAdapter({
      packId: "robotics",
      command: ["echo", "ok"],
      rejectArgs: true,
    });
    expect(() => run(["--allow-skip"])).toThrow(/不支持参数/);
  });

  it("allows only listed args", () => {
    const run = createFlywheelAdapter({
      packId: "agriculture",
      command: ["echo", "ok"],
      allowedArgs: ["--allow-skip"],
    });
    expect(() => run(["--allow-skip"])).not.toThrow();
    expect(() => run(["--bogus"])).toThrow(/不支持参数/);
  });

  it("passes allowed args through to the command", () => {
    testDir = mkdtempSync(join(tmpdir(), "flywheel-adapter-"));
    const out = join(testDir, "args.txt");
    // 与真实用法同构（bash 脚本接收位置参数）：$0=out 路径，$1=透传的 arg
    const run = createFlywheelAdapter({
      packId: "agriculture",
      command: ["bash", "-c", `printf '%s' "$1" > "$0"`, out],
      allowedArgs: ["--allow-skip"],
    });
    run(["--allow-skip"]);
    expect(readFileSync(out, "utf8")).toBe("--allow-skip");
  });
});
