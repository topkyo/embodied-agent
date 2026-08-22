export type TranslateFn = (key: string, params?: Record<string, string>) => string;

/** 字段级 inline error 映射（key = 字段 name） */
export type SettingsFieldErrors = Record<string, string>;
