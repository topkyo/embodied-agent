import type { IntentPayload } from "@embodied-agent/core";
import { createM20Client, resolveRobotWaypoint, type M20ClientConfig } from "./client.js";

function configFromUnknown(value: unknown): M20ClientConfig {
  if (!value || typeof value !== "object") return {};
  return value as M20ClientConfig;
}

export async function executeRobotIntent(
  intent: IntentPayload,
  domainConfig: unknown,
): Promise<unknown> {
  const config = configFromUnknown(domainConfig);
  const m20 = createM20Client(() => config);
  switch (intent.skill) {
    case "robot.stand_up":
      return m20.standUp();
    case "robot.sit_down":
      return m20.sitDown();
    case "robot.move":
      return m20.move(intent.parameters as Parameters<typeof m20.move>[0]);
    case "robot.set_gait": {
      const p = intent.parameters as { gait: "basic" | "agile_flat" | "agile_stairs" };
      const gaitMap = {
        basic: 0x1001,
        agile_flat: 0x3002,
        agile_stairs: 0x3003,
      } as const;
      return m20.setGait(gaitMap[p.gait]);
    }
    case "robot.set_motion_mode": {
      const p = intent.parameters as { mode: "normal" | "navigation" | "assist" };
      const modeMap = { normal: 0, navigation: 1, assist: 2 } as const;
      return m20.setMotionMode(modeMap[p.mode]);
    }
    case "robot.navigate_to_waypoint": {
      const waypoint = resolveRobotWaypoint(
        config,
        (intent.parameters as { waypoint_id: string }).waypoint_id,
      );
      return m20.navStart(waypoint.points);
    }
    case "robot.cancel_navigation":
      return m20.navCancel();
    case "robot.speak": {
      const p = intent.parameters as { text: string; voice?: "male" | "female" };
      return m20.speak(p.text, p.voice);
    }
    case "robot.set_volume": {
      const p = intent.parameters as { volume: number };
      return m20.setVolume(p.volume);
    }
    case "robot.play_audio": {
      const p = intent.parameters as { file_name: string; loop?: boolean };
      return m20.playAudio(p.file_name, p.loop ?? false);
    }
    case "robot.stop_audio":
      return m20.stopAudio();
    case "robot.set_speaker_pitch": {
      const p = intent.parameters as { pitch_value: number };
      return m20.setSpeakerPitch(p.pitch_value);
    }
    case "robot.set_light": {
      const p = intent.parameters as {
        light: "body" | "work" | "strobe" | "red_blue";
        state?: "on" | "off";
        brightness?: number;
        mode?: number;
      };
      if (p.light === "body") return m20.bodyLed(p.state ?? "on");
      if (p.light === "work") {
        if (typeof p.brightness === "number") return m20.setBrightness(p.brightness);
        return p.state === "off" ? m20.lightOff() : m20.lightOn();
      }
      if (p.light === "strobe") return p.state === "off" ? m20.strobeOff() : m20.strobeOn();
      return m20.setRbMode(p.mode ?? (p.state === "off" ? 0 : 1));
    }
    case "robot.set_body_led": {
      const p = intent.parameters as { front: number; back: number };
      return m20.setBodyLed(p.front, p.back);
    }
    case "robot.play_alarm":
      return m20.playAlarm();
    case "robot.stop_alarm":
      return m20.stopAlarm();
    case "robot.gimbal_move": {
      const p = intent.parameters as {
        direction: "up" | "down" | "left" | "right";
        duration_ms?: number;
      };
      return m20.gimbalMove(p.direction, p.duration_ms);
    }
    case "robot.gimbal_angle":
      return m20.gimbalAngle(intent.parameters as Parameters<typeof m20.gimbalAngle>[0]);
    case "robot.gimbal_center":
      return m20.gimbalCenter();
    case "robot.gimbal_stop":
      return m20.gimbalStop();
    case "robot.gimbal_lock":
      return m20.gimbalLock();
    case "robot.gimbal_follow":
      return m20.gimbalFollow();
    case "robot.gimbal_zoom": {
      const p = intent.parameters as {
        action: "in" | "out" | "stop";
        position?: number;
      };
      return m20.gimbalZoom(p.action, p.position);
    }
    case "robot.gimbal_focus": {
      const p = intent.parameters as { action: "near" | "far" | "stop" };
      return m20.gimbalFocus(p.action);
    }
    case "robot.gimbal_auto_focus":
      return m20.gimbalAutoFocus();
    case "robot.gimbal_record_start":
      return m20.gimbalRecordStart();
    case "robot.gimbal_record_stop":
      return m20.gimbalRecordStop();
    case "robot.gimbal_capture": {
      const p = intent.parameters as { mode?: "both" | "visible" | "thermal" } | undefined;
      return m20.gimbalCapture(p?.mode ?? "both");
    }
    case "robot.gimbal_thermal_palette": {
      const p = intent.parameters as { palette: number };
      return m20.gimbalThermalPalette(p.palette);
    }
    case "robot.gimbal_laser_range":
      return m20.gimbalLaserRange();
    default:
      throw new Error(`不支持的 M20 机器人控制技能：${intent.skill}`);
  }
}
