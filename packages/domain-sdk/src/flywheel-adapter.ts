import { spawnSync } from "node:child_process";

export type CreateFlywheelAdapterOptions = {
  packId: string;
  command: readonly string[];
  /** Reject any CLI args (robotics/industrial style). */
  rejectArgs?: boolean;
  /** Allow only these arg tokens; others throw (agriculture style). */
  allowedArgs?: readonly string[];
};

export function createFlywheelAdapter(
  options: CreateFlywheelAdapterOptions,
): (args?: string[]) => void {
  const [executable, ...fixedArgs] = options.command;
  if (!executable) {
    throw new Error(`flywheel adapter ${options.packId}: command must not be empty`);
  }

  return function runDomainFlywheel(args: string[] = []): void {
    if (options.rejectArgs && args.length > 0) {
      throw new Error(`${options.packId} domain flywheel 不支持参数: ${args.join(" ")}`);
    }
    if (options.allowedArgs) {
      const allowed = new Set(options.allowedArgs);
      const unknown = args.filter((arg) => !allowed.has(arg));
      if (unknown.length > 0) {
        throw new Error(`${options.packId} domain flywheel 不支持参数: ${unknown.join(" ")}`);
      }
    }

    // 校验通过后必须透传 args（如 agriculture 的 --allow-skip），否则静默丢弃用户参数。
    const result = spawnSync(executable, [...fixedArgs, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        ACTIVE_DOMAIN: options.packId,
      },
    });
    if (result.error) throw result.error;
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
  };
}
