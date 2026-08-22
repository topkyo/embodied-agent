import type { DemoSceneSlug } from "./config.js";

export type DemoConversationMessage = {
  role: "user" | "bot";
  textKey: string;
};

export const DEMO_CONVERSATIONS: Record<DemoSceneSlug, DemoConversationMessage[]> = {
  greenhouse: [
    { role: "user", textKey: "scene.gh.chat.user1" },
    { role: "bot", textKey: "scene.gh.chat.bot1" },
    { role: "user", textKey: "scene.gh.chat.user2" },
    { role: "bot", textKey: "scene.gh.chat.bot2" },
    { role: "user", textKey: "scene.gh.chat.user3" },
    { role: "bot", textKey: "scene.gh.chat.bot3" },
  ],
  robot: [
    { role: "user", textKey: "demo.robot.chat.user1" },
    { role: "bot", textKey: "demo.robot.chat.bot1" },
    { role: "user", textKey: "demo.robot.chat.user2" },
    { role: "bot", textKey: "demo.robot.chat.bot2" },
  ],
  industrial: [
    { role: "user", textKey: "demo.industrial.chat.user1" },
    { role: "bot", textKey: "demo.industrial.chat.bot1" },
    { role: "user", textKey: "demo.industrial.chat.user2" },
    { role: "bot", textKey: "demo.industrial.chat.bot2" },
  ],
};
