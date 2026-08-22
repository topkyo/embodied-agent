import type { SttSettingsSlice } from "../../stt-settings.js";
import type { SttBackend, TranscribeInput } from "./types.js";

/** 本地冒烟：STT_MOCK=1 时固定转写，用于验证语音→意图链路。 */
export const mockSttBackend: SttBackend = {
  async transcribe(_input: TranscribeInput, _settings: SttSettingsSlice): Promise<string> {
    return process.env.STT_MOCK_TEXT?.trim() || "1号棚现在多少度";
  },
};
