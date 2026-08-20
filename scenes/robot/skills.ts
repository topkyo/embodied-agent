import { definePhysicalSkill } from "@embodied-agent/domain-sdk";
import type { DomainPackPhysicalSkillDefinition } from "@embodied-agent/core";

export const ROBOT_P0_SKILLS = [
  "robot.query_status",
  "robot.query_pose",
  "robot.query_navigation_status",
  "robot.capture_image",
  "robot.get_stream_url",
  "robot.query_speaker_status",
  "robot.query_gimbal_attitude",
  "robot.start_inspection",
  "robot.query_inspection_summary",
] as const;

export const ROBOT_P1_SKILLS = [
  "robot.stand_up",
  "robot.sit_down",
  "robot.move",
  "robot.set_gait",
  "robot.set_motion_mode",
  "robot.navigate_to_waypoint",
  "robot.cancel_navigation",
  "robot.speak",
  "robot.set_volume",
  "robot.play_audio",
  "robot.stop_audio",
  "robot.set_speaker_pitch",
  "robot.set_light",
  "robot.set_body_led",
  "robot.play_alarm",
  "robot.stop_alarm",
  "robot.gimbal_move",
  "robot.gimbal_angle",
  "robot.gimbal_center",
  "robot.gimbal_stop",
  "robot.gimbal_lock",
  "robot.gimbal_follow",
  "robot.gimbal_zoom",
  "robot.gimbal_focus",
  "robot.gimbal_auto_focus",
  "robot.gimbal_record_start",
  "robot.gimbal_record_stop",
  "robot.gimbal_capture",
  "robot.gimbal_thermal_palette",
  "robot.gimbal_laser_range",
] as const;

export const ROBOT_PHYSICAL_SKILL_DEFINITIONS = [
  definePhysicalSkill({
    skill: "robot.stand_up",
    display: { title_zh: "站立", icon: "activity", summary_zh: "机器狗起立" },
  }),
  definePhysicalSkill({
    skill: "robot.sit_down",
    display: { title_zh: "趴下", icon: "activity", summary_zh: "机器狗趴下" },
  }),
  definePhysicalSkill({
    skill: "robot.move",
    display: { title_zh: "移动", icon: "activity", summary_zh: "有界短距离移动" },
  }),
  definePhysicalSkill({
    skill: "robot.set_gait",
    display: { title_zh: "切换步态", icon: "activity", summary_zh: "切换行走步态" },
  }),
  definePhysicalSkill({
    skill: "robot.set_motion_mode",
    display: { title_zh: "切换模式", icon: "gauge", summary_zh: "切换本体运动模式" },
  }),
  definePhysicalSkill({
    skill: "robot.navigate_to_waypoint",
    display: { title_zh: "导航到点", icon: "activity", summary_zh: "导航至预设点位" },
  }),
  definePhysicalSkill({
    skill: "robot.cancel_navigation",
    display: { title_zh: "取消导航", icon: "activity", summary_zh: "取消当前导航任务" },
  }),
  definePhysicalSkill({
    skill: "robot.speak",
    display: { title_zh: "喊话", icon: "bell", summary_zh: "通过喊话器播报" },
  }),
  definePhysicalSkill({
    skill: "robot.set_volume",
    display: {
      title_zh: "设置音量",
      icon: "bell",
      summary_zh: "调节喊话器音量",
      control: { kind: "slider", unit: "%", demo_value: 60 },
    },
  }),
  definePhysicalSkill({
    skill: "robot.play_audio",
    display: {
      title_zh: "播放音频",
      icon: "bell",
      summary_zh: "播放设备端音频",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.stop_audio",
    display: {
      title_zh: "停止音频",
      icon: "bell",
      summary_zh: "停止音频播放",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.set_speaker_pitch",
    display: { title_zh: "设置俯仰", icon: "bell", summary_zh: "调节喊话器俯仰角" },
  }),
  definePhysicalSkill({
    skill: "robot.set_light",
    display: {
      title_zh: "控制灯光",
      icon: "lightbulb",
      summary_zh: "灯光/爆闪/红蓝灯",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.set_body_led",
    display: {
      title_zh: "本体LED",
      icon: "lightbulb",
      summary_zh: "控制前后 LED",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.play_alarm",
    display: {
      title_zh: "播放警报",
      icon: "bell",
      summary_zh: "触发现场警报",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.stop_alarm",
    display: {
      title_zh: "停止警报",
      icon: "bell",
      summary_zh: "关闭现场警报",
      control: { kind: "toggle" },
    },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_move",
    display: { title_zh: "吊舱转向", icon: "camera", summary_zh: "控制吊舱方向" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_angle",
    display: { title_zh: "吊舱角度", icon: "camera", summary_zh: "设置吊舱角度" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_center",
    display: { title_zh: "吊舱回中", icon: "camera", summary_zh: "吊舱回中位" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_stop",
    display: { title_zh: "吊舱停止", icon: "camera", summary_zh: "停止吊舱运动" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_lock",
    display: { title_zh: "吊舱锁头", icon: "camera", summary_zh: "锁定吊舱朝向" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_follow",
    display: { title_zh: "吊舱跟随", icon: "camera", summary_zh: "开启吊舱跟随" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_zoom",
    display: { title_zh: "吊舱变焦", icon: "camera", summary_zh: "调节吊舱变焦" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_focus",
    display: { title_zh: "吊舱对焦", icon: "camera", summary_zh: "手动对焦" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_auto_focus",
    display: { title_zh: "自动对焦", icon: "camera", summary_zh: "吊舱自动对焦" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_record_start",
    display: { title_zh: "开始录像", icon: "camera", summary_zh: "吊舱开始录像" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_record_stop",
    display: { title_zh: "停止录像", icon: "camera", summary_zh: "吊舱停止录像" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_capture",
    display: { title_zh: "吊舱拍照", icon: "camera", summary_zh: "吊舱抓拍图像" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_thermal_palette",
    display: { title_zh: "热成像", icon: "thermometer", summary_zh: "切换热成像伪彩" },
  }),
  definePhysicalSkill({
    skill: "robot.gimbal_laser_range",
    display: { title_zh: "激光测距", icon: "activity", summary_zh: "吊舱激光测距" },
  }),
] as const;

export const ROBOT_PHYSICAL_SKILLS = ROBOT_PHYSICAL_SKILL_DEFINITIONS.map((def) => def.skill);

export const ROBOT_PHYSICAL_DEFINITIONS: readonly DomainPackPhysicalSkillDefinition[] =
  ROBOT_PHYSICAL_SKILL_DEFINITIONS.map(({ skill, display }) => ({ skill, display }));
