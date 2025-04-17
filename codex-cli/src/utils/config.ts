// NOTE: We intentionally point the TypeScript import at the source file
// (`./auto-approval-mode.ts`) instead of the emitted `.js` bundle.  This makes
// the module resolvable when the project is executed via `ts-node`, which
// resolves *source* paths rather than built artefacts.  During a production
// build the TypeScript compiler will automatically rewrite the path to
// `./auto-approval-mode.js`, so the change is completely transparent for the
// compiled `dist/` output used by the published CLI.

import type { FullAutoErrorMode } from "./auto-approval-mode.js";

import { log, isLoggingEnabled } from "./agent/log.js";
import { AutoApprovalMode } from "./auto-approval-mode.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { homedir } from "os";
import { dirname, join, extname, resolve as resolvePath } from "path";

export const DEFAULT_AGENTIC_MODEL = "o4-mini";
export const DEFAULT_FULL_CONTEXT_MODEL = "gpt-4.1";
export const DEFAULT_APPROVAL_MODE = AutoApprovalMode.SUGGEST;
export const DEFAULT_INSTRUCTIONS = "";

export const CONFIG_DIR = join(homedir(), ".codex");
export const CONFIG_JSON_FILEPATH = join(CONFIG_DIR, "config.json");
export const CONFIG_YAML_FILEPATH = join(CONFIG_DIR, "config.yaml");
export const CONFIG_YML_FILEPATH = join(CONFIG_DIR, "config.yml");

// Keep the original constant name for backward compatibility, but point it at
// the default JSON path. Code that relies on this constant will continue to
// work unchanged.
export const CONFIG_FILEPATH = CONFIG_JSON_FILEPATH;
export const INSTRUCTIONS_FILEPATH = join(CONFIG_DIR, "instructions.md");

export const OPENAI_TIMEOUT_MS =
  parseInt(process.env["OPENAI_TIMEOUT_MS"] || "0", 10) || undefined;
export const OPENAI_BASE_URL = process.env["OPENAI_BASE_URL"] || "";
export let OPENAI_API_KEY = process.env["OPENAI_API_KEY"] || "";

// Azure OpenAI configuration
export const AZURE_OPENAI_API_VERSION = process.env["AZURE_OPENAI_API_VERSION"] || "2024-08-01-preview";
export const AZURE_OPENAI_ENDPOINT = process.env["AZURE_OPENAI_ENDPOINT"] || "";
export const AZURE_OPENAI_API_KEY = process.env["AZURE_OPENAI_API_KEY"] || "";
export const AZURE_OPENAI_DEPLOYMENT = process.env["AZURE_OPENAI_DEPLOYMENT"] || "";

export function setApiKey(apiKey: string): void {
  OPENAI_API_KEY = apiKey;
}

// Formatting (quiet mode-only).
export const PRETTY_PRINT = Boolean(process.env["PRETTY_PRINT"] || "");

// Represents config as persisted in config.json.
export type StoredConfig = {
  model?: string;
  apiKey?: string;
  approvalMode?: AutoApprovalMode;
  fullAutoErrorMode?: FullAutoErrorMode;
  memory?: MemoryConfig;
  history?: {
    maxSize?: number;
    saveHistory?: boolean;
    sensitivePatterns?: Array<string>;
  };
  azureConfig?: {
    apiVersion: string;
    endpoint: string;
    apiKey: string;
    deployment: string;
  };
};

// Minimal config written on first run.  An *empty* model string ensures that
// we always fall back to DEFAULT_MODEL on load, so updates to the default keep
// propagating to existing users until they explicitly set a model.
export const EMPTY_STORED_CONFIG: StoredConfig = { model: "" };

// Pre‑stringified JSON variant so we don't stringify repeatedly.
const EMPTY_CONFIG_JSON = JSON.stringify(EMPTY_STORED_CONFIG, null, 2) + "\n";

export type MemoryConfig = {
  enabled: boolean;
};

// Represents full runtime config, including loaded instructions.
export type AppConfig = {
  apiKey?: string;
  model: string;
  instructions: string;
  fullAutoErrorMode?: FullAutoErrorMode;
  memory?: MemoryConfig;
  history?: {
    maxSize: number;
    saveHistory: boolean;
    sensitivePatterns: Array<string>;
  };
  azureConfig?: {
    apiVersion: string;
    endpoint: string;
    apiKey: string;
    deployment: string;
  };
};

// ---------------------------------------------------------------------------
// Project doc support (codex.md)
// ---------------------------------------------------------------------------

export const PROJECT_DOC_MAX_BYTES = 32 * 1024; // 32 kB

const PROJECT_DOC_FILENAMES = ["codex.md", ".codex.md", "CODEX.md"];

export function discoverProjectDocPath(startDir: string): string | null {
  const cwd = resolvePath(startDir);

  // 1) Look in the explicit CWD first:
  for (const name of PROJECT_DOC_FILENAMES) {
    const direct = join(cwd, name);
    if (existsSync(direct)) {
      return direct;
    }
  }

  // 2) Fallback: walk up to the Git root and look there.
  let dir = cwd;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      // Once we hit the Git root, search its top‑level for the doc
      for (const name of PROJECT_DOC_FILENAMES) {
        const candidate = join(dir, name);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      // If Git root but no doc, stop looking.
      return null;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding Git.
      return null;
    }
    dir = parent;
  }
}

/**
 * Load the project documentation markdown (codex.md) if present. If the file
 * exceeds {@link PROJECT_DOC_MAX_BYTES} it will be truncated and a warning is
 * logged.
 *
 * @param cwd The current working directory of the caller
 * @param explicitPath If provided, skips discovery and loads the given path
 */
export function loadProjectDoc(cwd: string, explicitPath?: string): string {
  let filepath: string | null = null;

  if (explicitPath) {
    filepath = resolvePath(cwd, explicitPath);
    if (!existsSync(filepath)) {
      // eslint-disable-next-line no-console
      console.warn(`codex: project doc not found at ${filepath}`);
      filepath = null;
    }
  } else {
    filepath = discoverProjectDocPath(cwd);
  }

  if (!filepath) {
    return "";
  }

  try {
    const buf = readFileSync(filepath);
    if (buf.byteLength > PROJECT_DOC_MAX_BYTES) {
      // eslint-disable-next-line no-console
      console.warn(
        `codex: project doc '${filepath}' exceeds ${PROJECT_DOC_MAX_BYTES} bytes – truncating.`,
      );
    }
    return buf.slice(0, PROJECT_DOC_MAX_BYTES).toString("utf-8");
  } catch {
    return "";
  }
}

export type LoadConfigOptions = {
  /** Working directory used for project doc discovery */
  cwd?: string;
  /** Disable inclusion of the project doc */
  disableProjectDoc?: boolean;
  /** Explicit path to project doc (overrides discovery) */
  projectDocPath?: string;
  /** Whether we are in fullcontext mode. */
  isFullContext?: boolean;
};

export const loadConfig = (
  configPath: string | undefined = CONFIG_FILEPATH,
  instructionsPath: string | undefined = INSTRUCTIONS_FILEPATH,
  options: LoadConfigOptions = {},
): AppConfig => {
  // Determine the actual path to load. If the provided path doesn't exist and
  // the caller passed the default JSON path, automatically fall back to YAML
  // variants.
  let actualConfigPath = configPath;
  if (!existsSync(actualConfigPath)) {
    if (configPath === CONFIG_FILEPATH) {
      if (existsSync(CONFIG_YAML_FILEPATH)) {
        actualConfigPath = CONFIG_YAML_FILEPATH;
      } else if (existsSync(CONFIG_YML_FILEPATH)) {
        actualConfigPath = CONFIG_YML_FILEPATH;
      }
    }
  }

  // Load stored config
  let storedConfig: StoredConfig = {};
  if (existsSync(actualConfigPath)) {
    const ext = extname(actualConfigPath);
    if (ext === ".yaml" || ext === ".yml") {
      storedConfig = loadYaml(readFileSync(actualConfigPath, "utf8")) as StoredConfig;
    } else {
      storedConfig = JSON.parse(readFileSync(actualConfigPath, "utf8"));
    }
  }

  // Load instructions
  let instructions = "";
  if (existsSync(instructionsPath)) {
    instructions = readFileSync(instructionsPath, "utf8");
  }

  // Load project doc if enabled
  if (!options.disableProjectDoc) {
    const projectDoc = loadProjectDoc(
      options.cwd || process.cwd(),
      options.projectDocPath,
    );
    if (projectDoc) {
      instructions = `${instructions}\n\n${projectDoc}`;
    }
  }

  // Merge Azure OpenAI config from environment if not in stored config
  if (!storedConfig.azureConfig) {
    storedConfig.azureConfig = {
      apiVersion: AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      endpoint: AZURE_OPENAI_ENDPOINT || "",
      apiKey: AZURE_OPENAI_API_KEY || "",
      deployment: AZURE_OPENAI_DEPLOYMENT || "",
    };
  }

  return {
    apiKey: storedConfig.apiKey,
    model: storedConfig.model || (options.isFullContext ? DEFAULT_FULL_CONTEXT_MODEL : DEFAULT_AGENTIC_MODEL),
    instructions,
    fullAutoErrorMode: storedConfig.fullAutoErrorMode,
    memory: storedConfig.memory,
    history: {
      maxSize: storedConfig.history?.maxSize || 100,
      saveHistory: storedConfig.history?.saveHistory ?? true,
      sensitivePatterns: storedConfig.history?.sensitivePatterns || [],
    },
    azureConfig: storedConfig.azureConfig,
  };
};

export const saveConfig = (
  config: AppConfig,
  configPath = CONFIG_FILEPATH,
  instructionsPath = INSTRUCTIONS_FILEPATH,
): void => {
  // If the caller passed the default JSON path *and* a YAML config already
  // exists on disk, save back to that YAML file instead to preserve the
  // user's chosen format.
  let targetPath = configPath;
  if (
    configPath === CONFIG_FILEPATH &&
    !existsSync(configPath) &&
    (existsSync(CONFIG_YAML_FILEPATH) || existsSync(CONFIG_YML_FILEPATH))
  ) {
    targetPath = existsSync(CONFIG_YAML_FILEPATH)
      ? CONFIG_YAML_FILEPATH
      : CONFIG_YML_FILEPATH;
  }

  const dir = dirname(targetPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const ext = extname(targetPath).toLowerCase();
  // Create the config object to save
  const configToSave: StoredConfig = {
    model: config.model,
  };

  // Add history settings if they exist
  if (config.history) {
    configToSave.history = {
      maxSize: config.history.maxSize,
      saveHistory: config.history.saveHistory,
      sensitivePatterns: config.history.sensitivePatterns,
    };
  }

  if (ext === ".yaml" || ext === ".yml") {
    writeFileSync(targetPath, dumpYaml(configToSave), "utf-8");
  } else {
    writeFileSync(targetPath, JSON.stringify(configToSave, null, 2), "utf-8");
  }

  writeFileSync(instructionsPath, config.instructions, "utf-8");
};
