export const ROBOT_INTENT_CONTRACT = `各技能 parameters 必须使用下列字段名，禁止输出温室、灌溉、风机、通风等农业字段：

- robot.query_status / robot.query_pose / robot.query_navigation_status: target.robot_id 可省略；省略时使用 domain_configs.robotics.default_robot_id
- robot.stand_up / robot.sit_down / robot.cancel_navigation / robot.stop_audio / robot.play_alarm / robot.stop_alarm / robot.gimbal_center / robot.gimbal_stop / robot.gimbal_lock / robot.gimbal_follow / robot.gimbal_auto_focus / robot.gimbal_record_start / robot.gimbal_record_stop / robot.gimbal_laser_range: target.robot_id 可省略
- robot.move: parameters 可含 x, y, yaw, duration_ms, distance_m
- robot.set_gait: parameters.gait（"basic"|"agile_flat"|"agile_stairs"）
- robot.set_motion_mode: parameters.mode（"normal"|"navigation"|"assist"）
- robot.navigate_to_waypoint: parameters.waypoint_id
- robot.speak: parameters.text, 可选 voice（"male"|"female"）
- robot.set_volume: parameters.volume（0-100）
- robot.play_audio: parameters.file_name, 可选 loop
- robot.set_speaker_pitch: parameters.pitch_value
- robot.set_light: parameters.light（"body"|"work"|"strobe"|"red_blue"）, 可选 state、brightness、mode
- robot.set_body_led: parameters.front, parameters.back
- robot.gimbal_move: parameters.direction（"up"|"down"|"left"|"right"）, 可选 duration_ms
- robot.gimbal_angle: 可选 yaw、pitch、speed、use_gyro、duration_ms
- robot.gimbal_zoom: parameters.action（"in"|"out"|"stop"）, 可选 position
- robot.gimbal_focus: parameters.action（"near"|"far"|"stop"）
- robot.gimbal_capture: 可选 parameters.mode（"both"|"visible"|"thermal"）
- robot.gimbal_thermal_palette: parameters.palette
- robot.capture_image / robot.get_stream_url: 可选 parameters.source（"body"|"gimbal"）
- robot.query_speaker_status / robot.query_gimbal_attitude: target.robot_id 可省略
- robot.start_inspection: parameters.waypoint_id, 可选 source、objective
- robot.query_inspection_summary: target {} 或省略

示例：
{"skill":"robot.set_gait","target":{},"parameters":{"gait":"basic"}}
{"skill":"robot.move","target":{"robot_id":"m20-001"},"parameters":{"x":0.2,"duration_ms":1000}}
{"skill":"robot.navigate_to_waypoint","target":{},"parameters":{"waypoint_id":"dock"}}
{"skill":"robot.speak","target":{},"parameters":{"text":"巡检开始","voice":"male"}}
{"skill":"robot.start_inspection","target":{},"parameters":{"waypoint_id":"yard","source":"gimbal","objective":"巡检取证"}}`;
