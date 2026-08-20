import type { ReactNode } from "react";

export type SettingsFieldProps = {
  label: string;
  /** 字段 name，用于 error id / aria 关联 */
  name?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

/**
 * 设置表单原子字段：label + 控件 + 可选 hint / 字段级 error。
 * 控件由 children 传入，调用方负责 name/type/autocomplete/aria-invalid。
 */
export function SettingsField({
  label,
  name,
  hint,
  error,
  className,
  children,
}: SettingsFieldProps) {
  const errorId = name ? `settings-field-error-${name}` : undefined;
  return (
    <label className={className ? `settings-field ${className}` : "settings-field"}>
      <span className="settings-field__label">{label}</span>
      {children}
      {error ? (
        <span className="settings-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="settings-field__hint muted u-text-sm">{hint}</span>
      ) : null}
    </label>
  );
}

/** 供 input/select 绑定的 aria 属性 */
export function fieldAria(name: string, error?: string) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `settings-field-error-${name}` : undefined,
  };
}
