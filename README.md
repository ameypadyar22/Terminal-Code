# Code Terminal

An AI-powered developer console with a terminal-first interface.

## Start with OpenRouter

Requires Node.js 18 or newer. Code Terminal uses OpenRouter by default and
securely prompts for the API key when it starts. The key is hidden while typing
and stays only in memory for that session. On Windows, paste with `Ctrl+V`, then
press Enter:

```powershell
npm start
```

After the key is accepted, Code Terminal fetches and displays the currently
available free OpenRouter models. Select a numbered model, or press Enter to
use `openrouter/free`, which automatically routes each request to a free model.
Free models can have availability and rate limits, but the app will not select a
paid model through this free router. Select a model yourself before starting,
if needed:

```powershell
$env:CODE_TERMINAL_MODEL = "anthropic/claude-sonnet-4"
npm start
```

## Use OpenAI instead

```powershell
$env:CODE_TERMINAL_PROVIDER = "openai"
npm start
```

Ask questions at the `user@code-terminal` prompt. Conversation context remains
available until you use `/clear` or close the app.

## Commands

- `/help` — show the command deck
- `/clear` — begin a fresh conversation
- `/status` — view provider, model, and session status
- `/model <name>` — change the model for this session
- `/exit` — close Code Terminal

To install the CLI globally from this folder, run `npm link`, then launch it
from any directory with `code-terminal`.

## Security

Keep API keys out of source code, prompts, screenshots, and Git. Code Terminal
prompts for them with hidden input and never displays or writes them. Existing
environment variables remain an optional convenience fallback. See
[SECURITY.md](SECURITY.md) for the client protections and the recommended
server-side relay design for production use.
