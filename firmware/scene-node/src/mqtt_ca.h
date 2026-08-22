#pragma once

/**
 * MQTT TLS CA PEM for WiFiClientSecure::setCACert.
 *
 * Delivery flash MUST inject MQTT_CA_CERT_PEM (build flag or -D); empty default
 * means no CA is configured — main.cpp will refuse setInsecure and skip verify.
 */
#ifndef MQTT_CA_CERT_PEM
#define MQTT_CA_CERT_PEM ""
#endif

static const char MQTT_CA_CERT[] = MQTT_CA_CERT_PEM;
