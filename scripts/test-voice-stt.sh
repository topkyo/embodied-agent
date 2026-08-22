#!/usr/bin/env bash
# 语音 STT 冒烟：STT_MOCK=1 + stt_provider=mock 验证 API 语音链路。
# 真实阿里云/讯飞：在配置台填写密钥后设 stt_provider=aliyun|iflytek，勿设 STT_MOCK。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${ADMIN_TOKEN:-dev-admin}"
API="${API_URL:-http://127.0.0.1:3001}"
WAV="${TMPDIR:-/tmp}/df-voice-test.wav"

ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" -ar 16000 -ac 1 "$WAV" 2>/dev/null || {
  python3 - <<'PY'
import struct, math, wave
p = "/tmp/df-voice-test.wav"
sr = 16000
with wave.open(p, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    for i in range(sr):
        w.writeframes(struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / sr))))
print(p)
PY
  WAV="/tmp/df-voice-test.wav"
}

echo "== 配置 STT mock（需 API 进程 STT_MOCK=1） =="
curl -sS -X PUT "$API/admin/settings" \
  -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stt_provider":"mock"}' | python3 -m json.tool

B64=$(base64 < "$WAV" | tr -d '\n')
echo "== curl 语音 → API =="
curl -sS -w "\nHTTP:%{http_code} time:%{time_total}s\n" \
  -X POST "$API/integrations/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"audio_base64\":\"$B64\",\"audio_format\":\"wav\",\"user_id\":\"owner-001\",\"platform\":\"wechat\"}"
