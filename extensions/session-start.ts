import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  BeforeAgentStartResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

type SessionStartContext = {
  ui?: {
    notify?: (message: string, level?: string) => void;
  };
};

const META_SKILL_HEADER =
  "# using-agent-skills\n\nUse the skill discovery flowchart to find the right skill for your task.";

const NOT_FOUND_SUFFIX =
  "agent-skills: using-agent-skills meta-skill not found. Skills may still be available individually.";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

const readMetaSkillText = async (): Promise<string> => {
  const metaSkillPath = resolve(PACKAGE_ROOT, "skills", "using-agent-skills", "SKILL.md");
  const buffer = await readFile(metaSkillPath, "utf-8");
  return buffer;
};

const buildContextInjection = (metaSkillContent: string | null): string => {
  if (!metaSkillContent) {
    return NOT_FOUND_SUFFIX;
  }

  return `${META_SKILL_HEADER}\n\n${metaSkillContent.trim()}`;
};

let cachedInjection: string | null = null;

const getInjection = async (): Promise<string> => {
  if (cachedInjection !== null) {
    return cachedInjection;
  }

  try {
    cachedInjection = buildContextInjection(await readMetaSkillText());
  } catch {
    cachedInjection = buildContextInjection(null);
  }

  return cachedInjection;
};

export default function registerSessionStartInjection(pi: ExtensionAPI): void {
  void pi.on("session_start", async (...args: unknown[]) => {
    const [, ctx] = args as unknown as [unknown, SessionStartContext];
    const notify = ctx?.ui?.notify;
    if (typeof notify !== "function") return;

    const injection = await getInjection();

    if (injection.startsWith(META_SKILL_HEADER)) {
      notify("agent-skills loaded: using-agent-skills context is active.", "info");
    } else {
      notify("agent-skills: using-agent-skills fallback active (meta-skill not loaded).", "warn");
    }
  });

  void pi.on("before_agent_start", async (...args: unknown[]): Promise<BeforeAgentStartResult> => {
    const event = args[0] as BeforeAgentStartEvent;
    const injection = await getInjection();

    return {
      systemPrompt: `${event.systemPrompt}\n\n${injection}`,
    };
  });
}
