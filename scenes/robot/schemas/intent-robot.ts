import { z, baseIntent } from "@embodied-agent/core/schemas/intent-primitives.js";

const targetRobot = z
  .object({
    robot_id: z.string().min(1).optional(),
  })
  .strict();

const queryStatus = baseIntent.extend({
  skill: z.literal("robot.query_status"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const queryPose = baseIntent.extend({
  skill: z.literal("robot.query_pose"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const queryNavigationStatus = baseIntent.extend({
  skill: z.literal("robot.query_navigation_status"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const captureImage = baseIntent.extend({
  skill: z.literal("robot.capture_image"),
  target: targetRobot,
  parameters: z
    .object({
      source: z.enum(["body", "gimbal"]).default("body").optional(),
    })
    .strict()
    .optional(),
});

const getStreamUrl = baseIntent.extend({
  skill: z.literal("robot.get_stream_url"),
  target: targetRobot,
  parameters: z
    .object({
      source: z.enum(["body", "gimbal"]).default("body").optional(),
    })
    .strict()
    .optional(),
});

const querySpeakerStatus = baseIntent.extend({
  skill: z.literal("robot.query_speaker_status"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const queryGimbalAttitude = baseIntent.extend({
  skill: z.literal("robot.query_gimbal_attitude"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const startInspection = baseIntent.extend({
  skill: z.literal("robot.start_inspection"),
  target: targetRobot,
  parameters: z
    .object({
      waypoint_id: z.string().min(1),
      source: z.enum(["body", "gimbal"]).default("body").optional(),
      objective: z.string().min(1).max(120).default("巡检取证").optional(),
    })
    .strict(),
});

const queryInspectionSummary = baseIntent.extend({
  skill: z.literal("robot.query_inspection_summary"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const standUp = baseIntent.extend({
  skill: z.literal("robot.stand_up"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const sitDown = baseIntent.extend({
  skill: z.literal("robot.sit_down"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const move = baseIntent.extend({
  skill: z.literal("robot.move"),
  target: targetRobot,
  parameters: z
    .object({
      x: z.number().min(-1).max(1).default(0).optional(),
      y: z.number().min(-1).max(1).default(0).optional(),
      yaw: z.number().min(-1).max(1).default(0).optional(),
      duration_ms: z.number().int().min(100).max(10000).optional(),
      distance_m: z.number().min(0).max(10).optional(),
    })
    .strict(),
});

const setGait = baseIntent.extend({
  skill: z.literal("robot.set_gait"),
  target: targetRobot,
  parameters: z
    .object({
      gait: z.enum(["basic", "agile_flat", "agile_stairs"]),
    })
    .strict(),
});

const setMotionMode = baseIntent.extend({
  skill: z.literal("robot.set_motion_mode"),
  target: targetRobot,
  parameters: z
    .object({
      mode: z.enum(["normal", "navigation", "assist"]),
    })
    .strict(),
});

const navigateToWaypoint = baseIntent.extend({
  skill: z.literal("robot.navigate_to_waypoint"),
  target: targetRobot,
  parameters: z
    .object({
      waypoint_id: z.string().min(1),
    })
    .strict(),
});

const cancelNavigation = baseIntent.extend({
  skill: z.literal("robot.cancel_navigation"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const speak = baseIntent.extend({
  skill: z.literal("robot.speak"),
  target: targetRobot,
  parameters: z
    .object({
      text: z.string().min(1).max(120),
      voice: z.enum(["male", "female"]).default("male").optional(),
    })
    .strict(),
});

const setVolume = baseIntent.extend({
  skill: z.literal("robot.set_volume"),
  target: targetRobot,
  parameters: z
    .object({
      volume: z.number().int().min(0).max(100),
    })
    .strict(),
});

const playAudio = baseIntent.extend({
  skill: z.literal("robot.play_audio"),
  target: targetRobot,
  parameters: z
    .object({
      file_name: z.string().min(1).max(120),
      loop: z.boolean().default(false).optional(),
    })
    .strict(),
});

const stopAudio = baseIntent.extend({
  skill: z.literal("robot.stop_audio"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const setSpeakerPitch = baseIntent.extend({
  skill: z.literal("robot.set_speaker_pitch"),
  target: targetRobot,
  parameters: z
    .object({
      pitch_value: z.number().int().min(80).max(220),
    })
    .strict(),
});

const setLight = baseIntent.extend({
  skill: z.literal("robot.set_light"),
  target: targetRobot,
  parameters: z
    .object({
      light: z.enum(["body", "work", "strobe", "red_blue"]),
      state: z.enum(["on", "off"]).optional(),
      brightness: z.number().int().min(0).max(30).optional(),
      mode: z.number().int().min(0).max(16).optional(),
    })
    .strict(),
});

const setBodyLed = baseIntent.extend({
  skill: z.literal("robot.set_body_led"),
  target: targetRobot,
  parameters: z
    .object({
      front: z.number().int().min(0).max(1),
      back: z.number().int().min(0).max(1),
    })
    .strict(),
});

const playAlarm = baseIntent.extend({
  skill: z.literal("robot.play_alarm"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const stopAlarm = baseIntent.extend({
  skill: z.literal("robot.stop_alarm"),
  target: targetRobot,
  parameters: z.object({}).strict().optional(),
});

const gimbalMove = baseIntent.extend({
  skill: z.literal("robot.gimbal_move"),
  target: targetRobot,
  parameters: z
    .object({
      direction: z.enum(["up", "down", "left", "right"]),
      duration_ms: z.number().int().min(100).max(10000).default(3000).optional(),
    })
    .strict(),
});

const gimbalAngle = baseIntent.extend({
  skill: z.literal("robot.gimbal_angle"),
  target: targetRobot,
  parameters: z
    .object({
      yaw: z.number().min(-150).max(150).default(0).optional(),
      pitch: z.number().min(-90).max(90).default(0).optional(),
      speed: z.number().min(0.1).max(9.9).default(5).optional(),
      use_gyro: z.boolean().default(true).optional(),
      duration_ms: z.number().int().min(100).max(10000).default(3000).optional(),
    })
    .strict(),
});

const gimbalNoParams = (skill: string) =>
  baseIntent.extend({
    skill: z.literal(skill),
    target: targetRobot,
    parameters: z.object({}).strict().optional(),
  });

const gimbalZoom = baseIntent.extend({
  skill: z.literal("robot.gimbal_zoom"),
  target: targetRobot,
  parameters: z
    .object({
      action: z.enum(["in", "out", "stop"]),
      position: z.number().int().min(0).optional(),
    })
    .strict(),
});

const gimbalFocus = baseIntent.extend({
  skill: z.literal("robot.gimbal_focus"),
  target: targetRobot,
  parameters: z
    .object({
      action: z.enum(["near", "far", "stop"]),
    })
    .strict(),
});

const gimbalCapture = baseIntent.extend({
  skill: z.literal("robot.gimbal_capture"),
  target: targetRobot,
  parameters: z
    .object({
      mode: z.enum(["both", "visible", "thermal"]).default("both").optional(),
    })
    .strict()
    .optional(),
});

const gimbalThermalPalette = baseIntent.extend({
  skill: z.literal("robot.gimbal_thermal_palette"),
  target: targetRobot,
  parameters: z
    .object({
      palette: z.number().int().min(0).max(9),
    })
    .strict(),
});

export const robotIntentSchemas = [
  queryStatus,
  queryPose,
  queryNavigationStatus,
  captureImage,
  getStreamUrl,
  querySpeakerStatus,
  queryGimbalAttitude,
  startInspection,
  queryInspectionSummary,
  standUp,
  sitDown,
  move,
  setGait,
  setMotionMode,
  navigateToWaypoint,
  cancelNavigation,
  speak,
  setVolume,
  playAudio,
  stopAudio,
  setSpeakerPitch,
  setLight,
  setBodyLed,
  playAlarm,
  stopAlarm,
  gimbalMove,
  gimbalAngle,
  gimbalNoParams("robot.gimbal_center"),
  gimbalNoParams("robot.gimbal_stop"),
  gimbalNoParams("robot.gimbal_lock"),
  gimbalNoParams("robot.gimbal_follow"),
  gimbalZoom,
  gimbalFocus,
  gimbalNoParams("robot.gimbal_auto_focus"),
  gimbalNoParams("robot.gimbal_record_start"),
  gimbalNoParams("robot.gimbal_record_stop"),
  gimbalCapture,
  gimbalThermalPalette,
  gimbalNoParams("robot.gimbal_laser_range"),
] as const;

export type RobotIntentPayload = z.infer<(typeof robotIntentSchemas)[number]>;
