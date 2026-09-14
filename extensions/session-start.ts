import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type SessionStartEvent = {
  reason: "startup" | "reload" | "new" | "resume" | "fork";
  previousSessionFile?: string;
};

type SessionStartContext = {
  mode?: string;
  ui?: {
    notify?: (message: string, level?: string) => void;
  };
};

const NOT_FOUND_SUFFIX =
  "agent-skills: using-agent-skills meta-skill not found. Skills may still be available individually.";

const PACKAGE_ROOT = dirname(fileURLToPath(new URL("..", import.meta.url)));

const readMetaSkillText = (): string => {
  const metaSkillPath = resolve(PACKAGE_ROOT, "skills", "using-agent-skills", "SKILL.md");
  return readFileSync(metaSkillPath, "utf-8");
};

const buildSessionStartNotice = (metaSkillContent: string | null): string => {
  if (!metaSkillContent) {
    return NOT_FOUND_SUFFIX;
  }

  const trimmedContent = metaSkillContent.trim();

  return [
    "agent-skills loaded. Use the skill discovery flowchart to find the right skill for your task.",
    trimmedContent,
  ].join("\n\n");
};

const buildNotice = (): string => {
  try {
    return buildSessionStartNotice(readMetaSkillText());
  } catch {
    return buildSessionStartNotice(null);
  }
};

export default function registerSessionStartInjection(pi: ExtensionAPI): void {
  void pi.on("session_start", async (...args: unknown[]) => {
    const [, ctx] = args as [SessionStartEvent, SessionStartContext];
    const notice = buildNotice();
    const notify = ctx?.ui?.notify;

    if (typeof notify === "function") {
      notify(notice, "info");
    }
  });
}
