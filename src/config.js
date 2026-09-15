export const SYSTEM_PROMPT = "You are Code Terminal, a precise and helpful agentic assistant in a developer's command line. Decide whether a tool would make the answer more accurate or complete and use it when appropriate. Clearly explain outcomes. Use only the provided tools. File writes, Python execution, database mutations, and potentially destructive shell or Git commands require the user's confirmation; never imply an action occurred when it was declined or failed. Do not store secrets, credentials, financial data, health data, or other sensitive personal information in memory.";

export const LIMITS = Object.freeze({
  promptLength: 12_000,
  exchanges: 6,
  requestTimeoutMs: 45_000,
  agentSteps: 8,
  toolResults: 40,
  fileBytes: 100_000,
  toolOutput: 12_000
});

export const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export function getProviderConfiguration(environment = process.env) {
  const requestedProvider = (environment.CODE_TERMINAL_PROVIDER || "openrouter").toLowerCase();
  const providers = Object.freeze({
    openai: { name: "OPENAI", endpoint: "https://api.openai.com/v1/chat/completions", key: environment.OPENAI_API_KEY, defaultModel: "gpt-4o-mini" },
    openrouter: { name: "OPENROUTER", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: environment.OPENROUTER_API_KEY, defaultModel: "openrouter/free" }
  });
  const provider = providers[requestedProvider] ? requestedProvider : "openrouter";
  return { provider, activeProvider: providers[provider] };
}
