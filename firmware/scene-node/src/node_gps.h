#pragma once

#include <Arduino.h>

/** UART GPS（NEO-6M / ATGM336H 等）NMEA 解析；编译时 GPS_ENABLE=0 则跳过硬件 */
void nodeGpsSetup();
void nodeGpsLoop();

bool nodeGpsHasFix();
/** fix_quality: 0=无定位, 1=2D, 2=3D */
bool nodeGpsRead(
    double *latitude,
    double *longitude,
    float *accuracy_m,
    uint8_t *fix_quality);
/** 有 GPS 时间时格式化为 ISO8601 UTC（否则返回 false） */
bool nodeGpsFormatUtc(char *buf, size_t len);