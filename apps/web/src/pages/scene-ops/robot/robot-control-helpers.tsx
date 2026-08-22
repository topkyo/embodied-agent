import type { ReactNode } from "react";
import {
  Bot,
  Camera,
  Gamepad2,
  Lightbulb,
  Megaphone,
  Navigation,
  RotateCcw,
  Volume2,
} from "lucide-react";
import {
  groupForRobotSkill,
  iconForRobotSkill,
  ROBOT_CONTROL_FALLBACK_ACTIONS,
  ROBOT_CONTROL_FALLBACK_BY_SKILL,
  ROBOT_CONTROL_GROUP_LABEL_KEY,
  ROBOT_CONTROL_GROUP_ORDER,
  type RobotControlActionIcon,
  type RobotControlFallbackAction,
  type RobotControlGroupId,
} from "./control-actions";
import { ROBOT_CUSTOM_INPUT_SKILLS } from "./shared";
import type { ControlAction, SchemaControlAction } from "./robot-control-types";

type TranslateFn = (key: string, params?: Record<string, string>) => string;

function renderIcon(kind: RobotControlActionIcon, size = 16): ReactNode {
  switch (kind) {
    case "camera":
      return <Camera size={size} />;
    case "gamepad":
      return <Gamepad2 size={size} />;
    case "lightbulb":
      return <Lightbulb size={size} />;
    case "megaphone":
      return <Megaphone size={size} />;
    case "navigation":
      return <Navigation size={size} />;
    case "rotate":
      return <RotateCcw size={size} />;
    case "volume":
      return <Volume2 size={size} />;
    case "bot":
    default:
      return <Bot size={size} />;
  }
}

function labelForFallback(action: RobotControlFallbackAction, t: TranslateFn): string {
  return t(action.labelKey);
}

function labelForSchemaAction(action: SchemaControlAction, t: TranslateFn, lang: string): string {
  const fb = ROBOT_CONTROL_FALLBACK_BY_SKILL.get(action.skill);
  if (fb) return labelForFallback(fb, t);
  if (lang === "zh" && action.display?.title_zh) return action.display.title_zh;
  if (lang !== "zh" && action.display?.title_en) return action.display.title_en;
  if (action.display?.title_zh) return action.display.title_zh;
  if (action.label && action.label !== action.skill) return action.label;
  return action.skill;
}

/** 优先 schema.control.actions；空则用 pack-ops-registry fallback 列表。 */
export function resolveRobotControlActions(
  schemaActions: SchemaControlAction[] | undefined,
  t: TranslateFn,
  lang: string,
): ControlAction[] {
  if (schemaActions && schemaActions.length > 0) {
    return schemaActions
      .filter((action) => !ROBOT_CUSTOM_INPUT_SKILLS.has(action.skill))
      .map((action) => {
        const fb = ROBOT_CONTROL_FALLBACK_BY_SKILL.get(action.skill);
        const schemaParams =
          action.parameters && Object.keys(action.parameters).length > 0
            ? action.parameters
            : undefined;
        return {
          key: action.id || action.skill,
          label: labelForSchemaAction(action, t, lang),
          icon: renderIcon(iconForRobotSkill(action.skill)),
          skill: action.skill,
          group: fb?.group ?? groupForRobotSkill(action.skill),
          parameters: schemaParams ?? fb?.parameters,
          confirm: action.requires_confirmation || Boolean(fb?.confirm),
        };
      });
  }

  return ROBOT_CONTROL_FALLBACK_ACTIONS.map((action, index) => ({
    key: `${action.skill}:${index}`,
    label: labelForFallback(action, t),
    icon: renderIcon(action.icon),
    skill: action.skill,
    group: action.group,
    parameters: action.parameters,
    confirm: action.confirm,
  }));
}

export function groupRobotControlActions(
  actions: ControlAction[],
): Array<{ group: RobotControlGroupId; actions: ControlAction[] }> {
  const byGroup = new Map<RobotControlGroupId, ControlAction[]>();
  for (const action of actions) {
    const list = byGroup.get(action.group) ?? [];
    list.push(action);
    byGroup.set(action.group, list);
  }
  return ROBOT_CONTROL_GROUP_ORDER.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map(
    (group) => ({ group, actions: byGroup.get(group) ?? [] }),
  );
}

export { renderIcon, ROBOT_CONTROL_GROUP_LABEL_KEY };
