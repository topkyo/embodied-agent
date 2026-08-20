import type { ReactNode } from "react";
import { PanelTitle } from "../../components/primitives/PanelTitle";

export type SettingsSectionProps = {
  id: string;
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
};

/** 设置表单分区容器（panel + PanelTitle） */
export function SettingsSection({ id, icon, title, text, children }: SettingsSectionProps) {
  return (
    <section id={id} className="settings-panel">
      <PanelTitle icon={icon} title={title} text={text} />
      {children}
    </section>
  );
}
