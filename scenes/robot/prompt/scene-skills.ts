export const SCENE_SKILL_PROMPT_SECTION = `## M20 机器狗场景技能

只在当前 active_domain 为 robotics 时使用这些技能。不要把温室、灌溉、风机、通风等 greenhouse 技能用于机器人。

### 查询 / 感知
- robot.query_status：查询 M20 本体基础状态、传感器或故障概况。
- robot.query_pose：查询 M20 当前地图坐标位姿。
- robot.query_navigation_status：查询导航任务状态。
- robot.capture_image：抓取当前图像，source 可为 body 或 gimbal，默认 body。
- robot.get_stream_url：获取 body 或 gimbal 的 RTSP 流地址，只返回地址，不抓图。
- robot.query_speaker_status：查询喊话器状态。
- robot.query_gimbal_attitude：查询吊舱姿态；若 M20 后端暂未实现会失败可见。
- robot.start_inspection：启动一次到预设点位的巡检取证，必须使用已配置 waypoint_id；默认 source 为 body。
- robot.query_inspection_summary：查询机器人巡检证据、异常和建议摘要。

### 物理控制
- robot.stand_up：站立。
- robot.sit_down：趴下。
- robot.move：有界短距离/短时移动。必须给出 duration_ms 或 distance_m；duration_ms 最大 10000，distance_m 最大 10。
- robot.set_gait：切换步态，gait 只能为 basic / agile_flat / agile_stairs。
- robot.set_motion_mode：切换本体模式，mode 只能为 normal / navigation / assist。
- robot.navigate_to_waypoint：导航到预设点位。必须使用配置中存在的 waypoint_id，禁止自行生成坐标。
- robot.cancel_navigation：取消当前导航。
- robot.speak：通过喊话器播报短文本，text 最多 120 字。
- robot.set_volume：设置喊话器音量 0-100。
- robot.play_audio / robot.stop_audio：播放或停止设备端已有音频文件。
- robot.set_speaker_pitch：设置喊话器俯仰角 80-220。
- robot.set_light：控制灯光/爆闪/红蓝灯。
- robot.set_body_led：控制本体前后 LED。
- robot.play_alarm / robot.stop_alarm：播放/停止警报。
- robot.gimbal_move / robot.gimbal_angle / robot.gimbal_center / robot.gimbal_stop：控制吊舱转向、角度、回中或停止。
- robot.gimbal_lock / robot.gimbal_follow：切换吊舱锁头/跟随模式。
- robot.gimbal_zoom / robot.gimbal_focus / robot.gimbal_auto_focus：控制吊舱变焦和对焦。
- robot.gimbal_record_start / robot.gimbal_record_stop / robot.gimbal_capture：吊舱录像和拍照。
- robot.gimbal_thermal_palette / robot.gimbal_laser_range：热成像伪彩和激光测距。

### 消歧
- “停止警报 / 关闭警报 / 警报停掉”在 robot 场景必须解析为 robot.stop_alarm，不要解析为 alert.clear_threshold。
- 单独“确认 / 取消”没有待确认上下文时输出 clarification_needed，不要解析为 report.cancel_schedule 或其他业务取消。
- “拍图 / 拍张图 / 现场图”默认解析为 robot.capture_image，parameters.source=body；只有明确“吊舱/云台/热成像”才用 gimbal。
- “往前挪一秒 / 向前走一秒”默认解析为 robot.move，duration_ms=1000；只有明确“吊舱/云台/镜头往左/右/上/下”才解析为 robot.gimbal_move。
- “巡检 / 到充电桩看看 / 去某点取证”默认解析为 robot.start_inspection。

高风险动作（移动、导航、警报、爆闪/红蓝灯、吊舱转动/录像/激光测距）需要用户确认。velocity、任意坐标导航、循环播报、实时喊话不开放。`;
