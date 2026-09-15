#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const COLORS = {
  reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m", blue: "\x1b[34m",
  magenta: "\x1b[35m", yellow: "\x1b[33m", white: "\x1b[37m", gray: "\x1b[90m",
  dim: "\x1b[2m", bold: "\x1b[1m"
};

const paint = (color, value) => `${COLORS[color]}${value}${COLORS.reset}`;
const line = (color = "blue") => paint(color, "\u2500".repeat(68));
const tag = (label, color = "cyan") => paint(color, `${COLORS.bold}[ ${label} ]${COLORS.reset}`);
const systemPrompt = "You are Code Terminal, a precise and helpful AI assistant inside a developer's command line. Answer coding and technical questions clearly. Use concise Markdown. When you provide code, explain how to use it. Never claim to have run commands or inspected files unless the user supplied that information.";
const MAX_PROMPT_LENGTH = 12_000;
const MAX_EXCHANGES = 6;
const REQUEST_TIMEOUT_MS = 45_000;

const requestedProvider = (process.env.CODE_TERMINAL_PROVIDER || "openrouter").toLowerCase();
const providers = Object.freeze({
  openai: { name: "OPENAI", endpoint: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY, defaultModel: "gpt-4o-mini" },
  openrouter: { name: "OPENROUTER", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, defaultModel: "openrouter/auto" }
});
const provider = providers[requestedProvider] ? requestedProvider : "openrouter";
const activeProvider = providers[provider];
let model = process.env.CODE_TERMINAL_MODEL || activeProvider.defaultModel;
let messages = [];
let apiKey = activeProvider.key?.trim() || "";

function isSafeModelName(value) {
  return /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);
}

function safeFailure(error) {
  if (error?.name === "AbortError") return "Request timed out. Check your connection and try again.";
  return "Request could not be completed. Check your provider, API key, and network connection.";
}

function apiStatus() {
  return apiKey ? paint("green", "ONLINE") : paint("yellow", "KEY REQUIRED");
}

async function requestApiKeyAtStartup() {
  if (apiKey || !input.isTTY || typeof input.setRawMode !== "function") return;

  console.clear();
  console.log(`\n${line("cyan")}\n${tag("SECURE CONNECTION SETUP", "magenta")}`);
  console.log(paint("gray", `  Enter your ${activeProvider.name} API key. Your input will remain hidden.`));
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
        else if (character >= " ") enteredKey += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
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

${paint("gray", "  Setup: ")}Set ${paint("yellow", "OPENROUTER_API_KEY")} (default) or select OpenAI with ${paint("yellow", "CODE_TERMINAL_PROVIDER")}.
${line("magenta")}\n`);
}

function status() {
  const exchanges = messages.length / 2;
  console.log(`\n${tag("SYSTEM STATUS", "blue")}
  Provider        ${paint("magenta", activeProvider.name)}
  API connection  ${apiStatus()}
  Active model    ${paint("cyan", model)}
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

  const requestMessages = [{ role: "system", content: systemPrompt }, ...messages, { role: "user", content: question }];
  process.stdout.write(`\n${tag("CODE TERMINAL", "magenta")} ${paint("gray", "Processing your request...")}\n${paint("gray", "  \u2502")}\n`);

  const abortController = new AbortController();
  let timeout;
  try {
    timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(activeProvider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider === "openrouter" ? { "X-Title": "Code Terminal" } : {})
      },
      body: JSON.stringify({ model, messages: requestMessages }),
      signal: abortController.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Provider rejected request (${response.status})`);
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("The AI returned an empty response.");

    console.log(paint("cyan", "  \u2570\u2500\u2500\u2500 AI RESPONSE \u2500\u2500\u2500"));
    console.log(answer.split("\n").map((text) => `${paint("gray", "  \u2502")} ${text}`).join("\n"));
    console.log(`${paint("gray", "  \u2570")}${line("blue")}\n`);
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
  banner();
  const rl = readline.createInterface({ input, output, terminal: true });
  rl.on("SIGINT", () => rl.close());

  while (true) {
    let lineInput;
    try {
      lineInput = (await rl.question(`${paint("green", "\u250c\u2500")}${paint("cyan", " user@code-terminal")}${paint("gray", " :: ")}${paint("magenta", "ask")}${paint("green", " \u276f ")}`)).trim();
    } catch { break; }
    if (!lineInput) continue;
    if (lineInput === "/exit" || lineInput === "/quit") break;
    if (lineInput === "/help") { help(); continue; }
    if (lineInput === "/status") { status(); continue; }
    if (lineInput === "/clear") { messages = []; banner(); continue; }
    if (lineInput === "/model") { console.log(`\n${tag("ACTIVE MODEL", "blue")} ${paint("cyan", model)}\n`); continue; }
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
    await askAI(lineInput);
  }
  rl.close();
  console.log(`\n${line("blue")}\n${paint("gray", "  Session closed. Keep shipping.\n")}`);
}

run();
