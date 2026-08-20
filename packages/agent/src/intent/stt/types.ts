import type { SttSettingsSlice } from "../../stt-settings.js";

export type TranscribeInput = {
  audioBase64: string;
  format?: string;
  language?: string;
};

export interface SttBackend {
  transcribe(input: TranscribeInput, settings: SttSettingsSlice): Promise<string>;
}
