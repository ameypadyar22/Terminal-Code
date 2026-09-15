#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execFileSync, execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getProviderConfiguration, IGNORED_DIRECTORIES, LIMITS, SYSTEM_PROMPT } from "./src/config.js";
import { agentTools } from "./src/tools/schema.js";
import { COLORS, line, paint, tag } from "./src/ui/terminal.js";

function logo() {
  console.log(paint("cyan", `${COLORS.bold}   ██████╗ ██████╗ ██████╗ ███████╗    ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗`));
  console.log(paint("cyan", `${COLORS.bold}  ██╔════╝██╔═══██╗██╔══██╗██╔════╝    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║`));
  console.log(paint("cyan", `${COLORS.bold}  ██║     ██║   ██║██║  ██║█████╗         ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║`));
  console.log(paint("cyan", `${COLORS.bold}  ██║     ██║   ██║██║  ██║██╔══╝         ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║`));
  console.log(paint("cyan", `${COLORS.bold}  ╚██████╗╚██████╔╝██████╔╝███████╗       ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗`));
  console.log(paint("cyan", `${COLORS.bold}   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝`));
}
const workspaceRoot = path.resolve(process.cwd());
const systemPrompt = SYSTEM_PROMPT;
const MAX_PROMPT_LENGTH = LIMITS.promptLength;
const MAX_EXCHANGES = LIMITS.exchanges;
const REQUEST_TIMEOUT_MS = LIMITS.requestTimeoutMs;
const MAX_AGENT_STEPS = LIMITS.agentSteps;
const MAX_TOOL_RESULTS = LIMITS.toolResults;
const MAX_FILE_BYTES = LIMITS.fileBytes;
const MAX_TOOL_OUTPUT = LIMITS.toolOutput;
const execFileAsync = promisify(execFile);

const { provider, activeProvider } = getProviderConfiguration();
let model = process.env.CODE_TERMINAL_MODEL || activeProvider.defaultModel;
let messages = [];
let apiKey = activeProvider.key?.trim() || "";
let approvedActionTypes = new Set();
let terminalInterface = null;
let selectableModels = ["openrouter/free"];
let selectableModelChoices = [{ id: "openrouter/free", name: "OpenRouter Free (automatic router)", context: 0 }];

const commandHints = Object.freeze({
  "/help": "show commands and agent tools",
  "/clear": "start a fresh conversation",
  "/status": "show provider, model, and session status",
  "/model <name>": "change the active model",
  "/exit": "close Code Terminal"
});

function isSafeModelName(value) {
  return /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);
}

function resolveWorkspacePath(relativePath = ".") {
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("A relative workspace path is required.");
  const resolved = path.resolve(workspaceRoot, relativePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Path must stay inside the current workspace.");
  }
  return resolved;
}

async function listWorkspaceFiles(directory, prefix = "", results = []) {
  if (results.length >= MAX_TOOL_RESULTS) return results;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (results.length >= MAX_TOOL_RESULTS || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name).replaceAll("\\", "/");
    results.push(entry.isDirectory() ? `${relative}/` : relative);
  }
  return results;
}

async function searchWorkspace(directory, query, extension = "", prefix = "", matches = []) {
  if (matches.length >= MAX_TOOL_RESULTS) return matches;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (matches.length >= MAX_TOOL_RESULTS || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) await searchWorkspace(entryPath, query, extension, relative, matches);
    else if (entry.isFile()) {
      if (extension && !entry.name.toLowerCase().endsWith(extension.toLowerCase())) continue;
      const info = await stat(entryPath);
      if (info.size > MAX_FILE_BYTES) continue;
      const content = await readFile(entryPath, "utf8");
      content.split(/\r?\n/).forEach((line, index) => {
        if (matches.length < MAX_TOOL_RESULTS && line.includes(query)) matches.push(`${relative}:${index + 1}: ${line.slice(0, 300)}`);
      });
    }
  }
  return matches;
}

const memory = new Map();
function truncate(value) { return String(value).slice(0, MAX_TOOL_OUTPUT); }
function isSensitive(value) { return /(password|secret|api[_ -]?key|token|credit.?card|cvv|social security|medical)/i.test(value); }
async function confirmAction(actionType, summary) {
  if (approvedActionTypes.has(actionType)) return true;
  const prompt = terminalInterface || readline.createInterface({ input, output, terminal: true });
  const reply = (await prompt.question(`\n${tag("CONFIRM ACTION", "yellow")} ${summary}\n${paint("yellow", "Continue? [y/N]: ")}`)).trim().toLowerCase();
  if (!terminalInterface) prompt.close();
  const approved = reply === "y" || reply === "yes";
  if (approved) approvedActionTypes.add(actionType);
  return approved;
}

function calculate(expression) {
  const normalized = expression.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*/gi, "($1/100)*").replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  if (!/^[\d\s+*/().-]+$/.test(normalized)) throw new Error("Only arithmetic operators, parentheses, decimals, and percentages are allowed.");
  const result = Function(`"use strict"; return (${normalized})`)();
  if (!Number.isFinite(result)) throw new Error("Calculation did not produce a finite number.");
  return String(result);
}

async function readDocument(target) {
  const info = await stat(target);
  if (!info.isFile()) throw new Error("Path is not a file.");
  if (info.size > MAX_FILE_BYTES) throw new Error(`File exceeds the ${MAX_FILE_BYTES}-byte read limit.`);
  if (path.extname(target).toLowerCase() === ".pdf") {
    const raw = await readFile(target);
    const text = raw.toString("latin1").match(/[\x20-\x7e]{20,}/g)?.join("\n") || "";
    return text ? `PDF text extraction (limited):\n${truncate(text)}` : "PDF text could not be extracted. Use a text-based PDF or install a PDF extraction utility.";
  }
  return readFile(target, "utf8");
}

async function runCommand(command, args = []) {
  const outputResult = await execFileAsync(command, args.map(String), { cwd: workspaceRoot, timeout: 10_000, windowsHide: true, maxBuffer: MAX_TOOL_OUTPUT });
  return truncate(`${outputResult.stdout}${outputResult.stderr ? `\n${outputResult.stderr}` : ""}`.trim() || "Command completed with no output.");
}

async function executeToolCall(toolCall) {
  const toolName = toolCall.function?.name;
  let args;
  try { args = JSON.parse(toolCall.function?.arguments || "{}"); }
  catch { return "Error: tool arguments were not valid JSON."; }
  try {
    if (toolName === "calculate") return calculate(args.expression);
    if (toolName === "web_search") {
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Search request failed (${response.status}).`);
      const data = await response.json();
      const results = [data.AbstractText && { title: data.Heading || args.query, text: data.AbstractText, url: data.AbstractURL }, ...(data.RelatedTopics || []).flatMap((item) => item.Topics || [item]).filter((item) => item?.Text).slice(0, 8).map((item) => ({ text: item.Text, url: item.FirstURL }))].filter(Boolean);
      return JSON.stringify({ query: args.query, results });
    }
    if (toolName === "list_files") {
      const requestedPath = args.path || ".";
      const target = resolveWorkspacePath(requestedPath);
      if (!(await stat(target)).isDirectory()) throw new Error("Path is not a directory.");
      const entries = await listWorkspaceFiles(target);
      return JSON.stringify({ path: requestedPath, entries, truncated: entries.length === MAX_TOOL_RESULTS });
    }
    if (toolName === "read_file") {
      const target = resolveWorkspacePath(args.path);
      return await readDocument(target);
    }
    if (toolName === "search_files") {
      if (typeof args.query !== "string" || !args.query) throw new Error("Search query is required.");
      const matches = await searchWorkspace(workspaceRoot, args.query, args.extension || "");
      return JSON.stringify({ query: args.query, matches, truncated: matches.length === MAX_TOOL_RESULTS });
    }
    if (toolName === "write_file") {
      if (typeof args.content !== "string" || args.content.length > MAX_TOOL_OUTPUT) throw new Error("Content must be text under 12,000 characters.");
      const target = resolveWorkspacePath(args.path);
      if (!await confirmAction("file_write", `Create or update ${args.path}?`)) return "User declined the file write.";
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, args.content, "utf8");
      return `Wrote ${args.content.length} characters to ${args.path}.`;
    }
    if (toolName === "run_python") {
      if (!await confirmAction("python", "Run generated Python code in the current workspace?")) return "User declined Python execution.";
      return await runCommand("python", ["-c", args.code]);
    }
    if (toolName === "run_terminal") {
      const command = String(args.command || "").toLowerCase();
      const allowed = new Set(["git", "node", "python", "python3"]);
      if (command === "dir" || command === "ls") return JSON.stringify({ entries: await listWorkspaceFiles(workspaceRoot) });
      if (!allowed.has(command)) throw new Error("Only git, node, python, python3, dir, and ls are allowlisted. Use the dedicated tools where available.");
      const commandText = `${command} ${(args.args || []).join(" ")}`;
      if (/(reset|clean|checkout|restore|rebase|commit|push|rm|delete)/i.test(commandText) && !await confirmAction("terminal_destructive", `Run potentially destructive command: ${commandText}?`)) return "User declined the terminal command.";
      return await runCommand(command, args.args || []);
    }
    if (toolName === "sqlite_query") {
      if (!/\.(db|sqlite|sqlite3)$/i.test(args.database)) throw new Error("Database path must end in .db, .sqlite, or .sqlite3.");
      const target = resolveWorkspacePath(args.database);
      const mutation = /^\s*(insert|update|delete|create|drop|alter|replace)/i.test(args.sql);
      if (mutation && !await confirmAction("sqlite_mutation", `Run mutating SQLite query against ${args.database}?`)) return "User declined the database change.";
      const script = "import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row; cur=c.execute(sys.argv[2],json.loads(sys.argv[3])); rows=[dict(r) for r in cur.fetchall()] if cur.description else []; c.commit(); print(json.dumps({'rows':rows,'rows_affected':cur.rowcount}))";
      return await runCommand("python", ["-c", script, target, args.sql, JSON.stringify(args.params || [])]);
    }
    if (toolName === "api_request") {
      const method = (args.method || "GET").toUpperCase();
      if (!/^https?:\/\//i.test(args.url) || !["GET", "POST"].includes(method)) throw new Error("Only HTTP(S) GET and POST requests are supported.");
      const response = await fetch(args.url, { method, headers: args.body ? { "Content-Type": "application/json" } : {}, body: method === "POST" ? args.body || undefined : undefined, signal: AbortSignal.timeout(15_000) });
      return JSON.stringify({ status: response.status, body: truncate(await response.text()) });
    }
    if (toolName === "memory") {
      const key = args.key?.trim();
      if (args.action === "list") return JSON.stringify(Object.fromEntries(memory));
      if (args.action === "get") return memory.has(key) ? memory.get(key) : "No saved value for that key.";
      if (args.action === "forget") { memory.delete(key); return `Forgot ${key}.`; }
      if (args.action === "save") { if (!key || !args.value) throw new Error("A key and value are required."); if (isSensitive(`${key} ${args.value}`)) throw new Error("Sensitive information is not stored in memory."); memory.set(key, args.value); return `Remembered ${key} for this session.`; }
      throw new Error("Memory action must be save, get, list, or forget.");
    }
    if (toolName === "date_time") {
      const now = new Date();
      if (!args.target_date) return now.toString();
      const target = new Date(`${args.target_date}T00:00:00`);
      if (Number.isNaN(target.valueOf())) throw new Error("Use target date format YYYY-MM-DD.");
      return `${Math.ceil((target - now) / 86_400_000)} day(s) until ${args.target_date}.`;
    }
    if (toolName === "json_tool") {
      const value = JSON.parse(args.json);
      if (args.operation === "validate") return "Valid JSON.";
      if (args.operation === "pretty") return JSON.stringify(value, null, 2);
      if (args.operation === "get") return JSON.stringify(value[args.key]);
      if (args.operation === "set") { value[args.key] = JSON.parse(args.value); return JSON.stringify(value, null, 2); }
      throw new Error("JSON operation must be validate, pretty, get, or set.");
    }
    if (toolName === "text_process") {
      if (args.operation === "word_count") return String((args.text.match(/\S+/g) || []).length);
      if (args.operation === "upper") return args.text.toUpperCase();
      if (args.operation === "lower") return args.text.toLowerCase();
      if (args.operation === "extract") return args.text.split(/\r?\n/).filter((line) => line.includes(args.query || "")).join("\n");
      throw new Error("Text operation must be word_count, extract, upper, or lower.");
    }
    if (toolName === "git") {
      const gitArgs = args.args || [];
      if (!Array.isArray(gitArgs) || !gitArgs.length) throw new Error("Git arguments are required.");
      const commandText = gitArgs.join(" ");
      if (/(reset|clean|checkout|restore|rebase|commit|push|rm)/i.test(commandText) && !await confirmAction("git_destructive", `Run potentially destructive Git command: git ${commandText}?`)) return "User declined the Git command.";
      return await runCommand("git", gitArgs);
    }
    return `Error: unknown tool '${toolName}'.`;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

function safeFailure(error) {
  if (error?.name === "AbortError") return "Request timed out. Check your connection and try again.";
  if (error?.message) return `Request failed: ${error.message.slice(0, 300)}`;
  return "Request could not be completed. Check your provider, API key, and network connection.";
}

function isToolCompatibilityError(message) {
  return /(tool_choice|tool call|function call|function.tool|tools.*(support|allow|invalid)|does not support.*tool)/i.test(message);
}

function apiStatus() {
  return apiKey ? paint("green", "ONLINE") : paint("yellow", "KEY REQUIRED");
}

function readClipboardText() {
  if (process.platform !== "win32") return "";
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
      { encoding: "utf8", timeout: 3_000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }
    ).replace(/[\r\n]/g, "").trim();
  } catch {
    return "";
  }
}

async function chooseWithArrowKeys(choices, { title = "FREE OPENROUTER MODELS", subtitle = "OpenRouter free models", instructions = "Use ↑/↓ to move · Enter to select · Esc keeps the first option" } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") return choices[0];
  const showLogo = !title.includes("MODEL");
  let selectedIndex = 0;
  const visibleRows = 8;
  const mainPrompt = terminalInterface;
  const render = () => {
    const first = Math.max(0, Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, choices.length - visibleRows)));
    const visible = choices.slice(first, first + visibleRows);
    output.write("\x1b[2J\x1b[H");
    console.log(`\n${line("cyan")}`);
    if (showLogo) logo();
    console.log(`${showLogo ? `${line("cyan")}\n` : ""}${tag(title, "green")} ${paint("gray", subtitle)}`);
    console.log(paint("gray", instructions));
    console.log(`${paint("blue", "  Active selection")} ${paint("cyan", choices[selectedIndex].id)}\n`);
    visible.forEach((choice, offset) => {
      const active = first + offset === selectedIndex;
      const pointer = active ? paint("green", "❯") : paint("gray", "·");
      const choiceColor = choice.color || "cyan";
      console.log(`${pointer} ${active ? paint(choiceColor, `${COLORS.bold}${choice.name}`) : paint(choiceColor, choice.name)}`);
      if (active) {
        const detail = typeof choice.context === "number" ? (choice.context ? ` · ${(choice.context / 1000).toFixed(0)}k context` : "") : choice.context ? ` · ${choice.context}` : "";
        console.log(paint("gray", `    ${choice.id}${detail}`));
      }
    });
    if (choices.length > visibleRows) console.log(paint("gray", `\n  ${selectedIndex + 1} of ${choices.length}`));
  };
  return new Promise((resolve) => {
    const finish = (choice) => {
      input.off("data", onData);
      input.setRawMode(false);
      output.write("\x1b[?25h\n");
      if (mainPrompt) mainPrompt.resume();
      resolve(choice);
    };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003" || key === "\u001b") { finish(choices[0]); return; }
      if (key === "\r" || key === "\n") { finish(choices[selectedIndex]); return; }
      if (key === "\u001b[A") { selectedIndex = (selectedIndex - 1 + choices.length) % choices.length; render(); }
      if (key === "\u001b[B") { selectedIndex = (selectedIndex + 1) % choices.length; render(); }
    };
    if (mainPrompt) mainPrompt.pause();
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    output.write("\x1b[?25l");
    render();
  });
}

async function chooseFreeOpenRouterModel() {
  if (provider !== "openrouter" || !apiKey) return;
  process.stdout.write(`\n${tag("FREE MODEL SELECTOR", "green")} ${paint("gray", "Loading currently available free models...")}\n`);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    const freeModels = (data.data || [])
      .filter((item) => item.id?.endsWith(":free") || (Number(item.pricing?.prompt) === 0 && Number(item.pricing?.completion) === 0))
      .filter((item) => (item.supported_parameters || []).includes("tools"))
      .map((item) => ({ id: item.id, name: item.name || item.id, context: item.context_length }))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (!freeModels.length) throw new Error("No free tool-capable models found");

    const choices = [
      { id: "openrouter/free", name: "OpenRouter Free (automatic router)", context: 0 },
      ...freeModels
    ];
    selectableModels = choices.map((choice) => choice.id);
    selectableModelChoices = choices;
    const selected = await chooseWithArrowKeys(choices, { title: "MODEL SELECTOR", subtitle: "OpenRouter free models", instructions: "Use ↑/↓ to move · Enter to select · Esc keeps the free router" });
    model = selected.id;
    console.log(`${tag("FREE MODEL ACTIVE", "green")} ${paint("cyan", model)}\n`);
  } catch {
    model = "openrouter/free";
    console.log(paint("yellow", "  Agent-capable free catalog unavailable — using OpenRouter's automatic free-model router.\n"));
  }
}

function formatAnswer(answer) {
  let inCodeBlock = false;
  return answer.split("\n").map((text) => {
    if (text.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return paint("magenta", inCodeBlock ? "Code" : "");
    }
    if (inCodeBlock) return `  ${paint("green", text)}`;
    if (/^#{1,6}\s+/.test(text)) return `\n${paint("cyan", `${COLORS.bold}${text.replace(/^#+\s+/, "")}`)}`;
    if (/^\s*[-*]\s+/.test(text)) return `${paint("blue", "• ")}${text.replace(/^\s*[-*]\s+/, "")}`;
    if (/^\s*\d+\.\s+/.test(text)) return `${paint("blue", text.match(/^\s*\d+\./)[0])} ${text.replace(/^\s*\d+\.\s+/, "")}`;
    return text ? paint("white", text) : "";
  }).join("\n");
}

function hasExpectedKeyFormat(value) {
  return provider === "openrouter" ? /^sk-or-v1-[A-Za-z0-9_-]{16,}$/.test(value) : /^sk-[A-Za-z0-9_-]{16,}$/.test(value);
}

async function requestApiKeyAtStartup() {
  if (apiKey || !input.isTTY || typeof input.setRawMode !== "function") return;

  console.clear();
  console.log(`\n${line("cyan")}`);
  logo();
  console.log(`${line("cyan")}\n${tag("SECURE CONNECTION SETUP", "magenta")}`);
  console.log(paint("gray", `  Enter your ${activeProvider.name} API key. Your input will remain hidden.`));
  console.log(paint("gray", "  Paste with Ctrl+V, then press Enter."));
  console.log(paint("gray", "  It is kept only in memory for this session and is never written to disk.\n"));
  output.write(paint("cyan", "  API key > "));

  apiKey = await new Promise((resolve) => {
    let enteredKey = "";
    const finish = (value) => {
      input.off("data", onData);
      input.setRawMode(false);
      output.write("\n");
      resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") { finish(""); return; }
        if (character === "\r" || character === "\n") { finish(enteredKey); return; }
        if (character === "\b" || character === "\x7f") enteredKey = enteredKey.slice(0, -1);
        else if (character === "\u0016") enteredKey += readClipboardText();
        else if (character >= " ") enteredKey += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function validateApiKeyAtStartup() {
  if (!apiKey) {
    console.log(`\n${tag("API KEY REQUIRED", "yellow")} ${paint("yellow", `Set ${provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} or restart and enter a key.`)}\n`);
    return false;
  }
  if (!hasExpectedKeyFormat(apiKey)) {
    console.log(`\n${tag("INVALID API KEY", "yellow")} ${paint("yellow", "The API key format is not valid. Code Terminal will now exit.")}\n`);
    return false;
  }

  const validationUrl = provider === "openrouter"
    ? "https://openrouter.ai/api/v1/key"
    : "https://api.openai.com/v1/models";
  process.stdout.write(`\n${tag("VALIDATING API KEY", "blue")} ${paint("gray", "Checking credentials with the provider...")}\n`);
  try {
    const response = await fetch(validationUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) {
      console.log(`${tag("API KEY ACCEPTED", "green")} ${paint("green", "Key validated. Connecting to the provider...")}\n`);
      return true;
    }
    if (response.status === 401 || response.status === 403) {
      console.log(`${tag("INVALID API KEY", "yellow")} ${paint("yellow", "The provider rejected this API key. Code Terminal will now exit.")}\n`);
      return false;
    }
    console.log(`${tag("API KEY VALIDATION FAILED", "yellow")} ${paint("yellow", `The provider could not validate the key (${response.status}). Code Terminal will now exit.`)}\n`);
    return false;
  } catch {
    console.log(`${tag("API KEY VALIDATION FAILED", "yellow")} ${paint("yellow", "Could not reach the provider to validate the key. Code Terminal will now exit.")}\n`);
    return false;
  }
}

function banner() {
  console.clear();
  console.log(`\n${line("cyan")}`);
  console.log(paint("cyan", `${COLORS.bold}   ██████╗ ██████╗ ██████╗ ███████╗    ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗`));
  console.log(paint("cyan", `${COLORS.bold}  ██╔════╝██╔═══██╗██╔══██╗██╔════╝    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║`));
  console.log(paint("cyan", `${COLORS.bold}  ██║     ██║   ██║██║  ██║█████╗         ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║`));
  console.log(paint("cyan", `${COLORS.bold}  ██║     ██║   ██║██║  ██║██╔══╝         ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║`));
  console.log(paint("cyan", `${COLORS.bold}  ╚██████╗╚██████╔╝██████╔╝███████╗       ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗`));
  console.log(paint("cyan", `${COLORS.bold}   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝`));
  console.log(line("blue"));
  console.log(`${tag("ENGINE", "magenta")}  ${paint("white", model.padEnd(24))} ${tag(activeProvider.name, "blue")}  ${apiStatus()}`);
  console.log(`${tag("SESSION", "blue")} ${paint("gray", "New conversation ready")}`);
  console.log(line("blue"));
  console.log(paint("gray", "  Ask about code, debugging, architecture, or your next build."));
  console.log(paint("gray", "  Type ") + paint("cyan", "/help") + paint("gray", " to open the command deck.\n"));
}

function help() {
  console.log(`\n${line("magenta")}\n${tag("COMMAND DECK", "magenta")}

  ${paint("cyan", "/help").padEnd(22)} View available commands
  ${paint("cyan", "/clear").padEnd(22)} Reset the current conversation
  ${paint("cyan", "/status").padEnd(22)} Show model and connection details
  ${paint("cyan", "/model <name>").padEnd(22)} Change the AI model
  ${paint("cyan", "/exit").padEnd(22)} Close Code Terminal

${tag("AGENT TOOLS", "green")}
  ${paint("cyan", "Calculate").padEnd(22)} Arithmetic and percentages
  ${paint("cyan", "Web search").padEnd(22)} Current public-web information
  ${paint("cyan", "Files & search").padEnd(22)} List, find, read, and create project files
  ${paint("cyan", "Python & terminal").padEnd(22)} Analysis and safe commands
  ${paint("cyan", "SQLite & APIs").padEnd(22)} Database queries and HTTP requests
  ${paint("cyan", "Memory & date/time").padEnd(22)} Session preferences and date calculations
  ${paint("cyan", "JSON, text & Git").padEnd(22)} Data processing and repository inspection

${paint("gray", "  Confirmations: ")}Writes, Python, database changes, and risky terminal or Git actions ask before proceeding.
${paint("gray", "  Setup: ")}Set ${paint("yellow", "OPENROUTER_API_KEY")} (default) or select OpenAI with ${paint("yellow", "CODE_TERMINAL_PROVIDER")}.
${line("magenta")}\n`);
}

function commandSuggestions(prefix = "") {
  const suggestions = Object.entries(commandHints)
    .filter(([command]) => command.startsWith(prefix))
    .map(([command, description]) => `  ${paint("cyan", command.padEnd(22))} ${paint("gray", description)}`);
  console.log(`\n${tag("COMMAND SUGGESTIONS", "green")}`);
  console.log(suggestions.length ? suggestions.join("\n") : paint("yellow", "  No matching command. Type /help to see all commands."));
  console.log(paint("gray", "\n  Tip: press Tab after / to autocomplete a command.\n"));
}

function commandCompleter(lineInput) {
  if (lineInput.startsWith("/model ")) {
    const candidates = selectableModels.map((candidate) => `/model ${candidate}`);
    const hits = candidates.filter((candidate) => candidate.startsWith(lineInput));
    return [hits.length ? hits : candidates, lineInput];
  }
  const candidates = Object.keys(commandHints);
  const hits = candidates.filter((command) => command.startsWith(lineInput));
  return [hits.length ? hits : candidates, lineInput];
}

async function openCommandPalette() {
  const choices = [
    { id: "/help", name: "/help", context: "Show commands and tools", color: "cyan" },
    { id: "/clear", name: "/clear", context: "Start a fresh conversation", color: "yellow" },
    { id: "/status", name: "/status", context: "View connection and model status", color: "blue" },
    { id: "/model", name: "/model", context: "Choose a different model", color: "magenta" },
    { id: "/exit", name: "/exit", context: "Close Code Terminal", color: "green" }
  ];
  return chooseWithArrowKeys(choices, {
    title: "COMMAND PALETTE",
    subtitle: "Choose a Code Terminal command",
    instructions: "Use ↑/↓ to move · Enter to run · Esc selects /help"
  });
}

function status() {
  const exchanges = messages.length / 2;
  console.log(`\n${tag("SYSTEM STATUS", "blue")}
  Provider        ${paint("magenta", activeProvider.name)}
  API connection  ${apiStatus()}
  Active model    ${paint("cyan", model)}
  Agent tools     ${paint("green", "15 tools active")}
  Memory          ${paint("white", `${exchanges} exchange${exchanges === 1 ? "" : "s"}`)}
${line("blue")}\n`);
}

async function askAI(question) {
  if (!apiKey) {
    console.log(`\n${tag("CONNECTION NOTICE", "yellow")}`);
    console.log(paint("yellow", "  No API key was entered during secure setup."));
    console.log(paint("gray", "  Restart Code Terminal to enter it.\n"));
    return;
  }

  if (question.length > MAX_PROMPT_LENGTH) {
    console.log(`${tag("INPUT TOO LARGE", "yellow")} ${paint("yellow", `Keep a single request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`)}\n`);
    return;
  }

  approvedActionTypes = new Set();
  const requestMessages = [{ role: "system", content: systemPrompt }, ...messages, { role: "user", content: question }];
  process.stdout.write(`\n${tag("CODE TERMINAL", "magenta")} ${paint("gray", "Processing your request...")}\n${paint("gray", "  \u2502")}\n`);

  const abortController = new AbortController();
  let timeout;
  try {
    timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    let answer = "";
    let nativeToolsEnabled = true;
    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      const response = await fetch(activeProvider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(provider === "openrouter" ? { "X-Title": "Code Terminal" } : {})
        },
        body: JSON.stringify({ model, messages: requestMessages, ...(nativeToolsEnabled ? { tools: agentTools, tool_choice: "auto" } : {}) }),
        signal: abortController.signal
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.error?.message || `Provider rejected request (${response.status})`;
        if (nativeToolsEnabled && !requestMessages.some((message) => message.role === "tool") && isToolCompatibilityError(detail)) {
          nativeToolsEnabled = false;
          console.log(`${tag("MODEL COMPATIBILITY", "yellow")} ${paint("yellow", "This model does not support native tools. Retrying in chat mode.")}`);
          continue;
        }
        throw new Error(detail);
      }
      const assistantMessage = data.choices?.[0]?.message;
      if (!assistantMessage) throw new Error("The AI returned an empty response.");
      const toolCalls = assistantMessage.tool_calls || [];
      const modelText = assistantMessage.content?.trim() || "";
      if (!toolCalls.length || modelText) {
        answer = modelText;
        break;
      }
      requestMessages.push({ role: "assistant", content: assistantMessage.content || "", tool_calls: toolCalls });
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || "workspace tool";
        process.stdout.write(`${tag("USING TOOL", "blue")} ${paint("cyan", toolName)}\n`);
        requestMessages.push({ role: "tool", tool_call_id: toolCall.id, content: await executeToolCall(toolCall) });
      }
    }
    if (!answer) throw new Error(`The agent did not produce a final answer within ${MAX_AGENT_STEPS} tool steps.`);

    console.log(`\n${tag("AI RESPONSE", "cyan")} ${paint("gray", `via ${model}`)}`);
    console.log(formatAnswer(answer));
    console.log();
    messages.push({ role: "user", content: question }, { role: "assistant", content: answer });
    messages = messages.slice(-(MAX_EXCHANGES * 2));
  } catch (error) {
    console.log(`${tag("REQUEST FAILED", "yellow")} ${paint("yellow", safeFailure(error))}\n`);
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  await requestApiKeyAtStartup();
  if (!await validateApiKeyAtStartup()) {
    process.exitCode = 1;
    return;
  }
  await chooseFreeOpenRouterModel();
  banner();
  const rl = readline.createInterface({ input, output, terminal: true, completer: commandCompleter });
  terminalInterface = rl;
  rl.on("SIGINT", () => rl.close());

  while (true) {
    let lineInput;
    try {
      lineInput = (await rl.question(`${paint("green", "\u250c\u2500")}${paint("cyan", " user@code-terminal")}${paint("gray", " :: ")}${paint("magenta", "ask")}${paint("green", " \u276f ")}`)).trim();
    } catch { break; }
    if (!lineInput) continue;
    if (lineInput === "/") lineInput = (await openCommandPalette()).id;
    if (lineInput === "/exit" || lineInput === "/quit") break;
    if (lineInput === "/help") { help(); continue; }
    if (lineInput === "/status") { status(); continue; }
    if (lineInput === "/clear") { messages = []; banner(); continue; }
    if (lineInput === "/model") {
      if (provider === "openrouter" && apiKey) {
        await chooseFreeOpenRouterModel();
        console.log(`${tag("MODEL UPDATED", "green")} ${paint("cyan", model)}\n`);
        continue;
      }
      const selected = await chooseWithArrowKeys(selectableModelChoices, {
        title: "MODEL SELECTOR",
        subtitle: "Choose the model for this session",
        instructions: "Use ↑/↓ to move · Enter to activate · Esc keeps the current list default"
      });
      model = selected.id;
      console.log(`\n${tag("MODEL UPDATED", "green")} ${paint("cyan", model)}`);
      console.log(paint("gray", "  This OpenRouter model uses your current OpenRouter API key.\n"));
      continue;
    }
    if (lineInput.startsWith("/model ")) {
      const candidate = lineInput.slice(7).trim();
      if (!isSafeModelName(candidate)) {
        console.log(`\n${tag("INVALID MODEL", "yellow")} ${paint("yellow", "Use letters, numbers, dots, colons, slashes, underscores, or hyphens only.")}\n`);
        continue;
      }
      model = candidate;
      console.log(`\n${tag("MODEL UPDATED", "green")} ${paint("cyan", model)}\n`);
      continue;
    }
    if (lineInput.startsWith("/")) { commandSuggestions(lineInput); continue; }
    await askAI(lineInput);
  }
  rl.close();
  terminalInterface = null;
  console.log(`\n${line("blue")}\n${paint("gray", "  Session closed. Keep shipping.\n")}`);
}

run();
