const tool = (name, description, properties = {}, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
const string = (description) => ({ type: "string", description });

export const agentTools = [
  tool("calculate", "Safely evaluate a mathematical expression, including percentages such as 25% of 4500.", { expression: string("Math expression") }, ["expression"]),
  tool("web_search", "Search the public web for current information.", { query: string("Search query") }, ["query"]),
  tool("list_files", "List files and directories in a workspace directory.", { path: string("Relative directory; default '.'") }),
  tool("search_files", "Search workspace text files for a literal string, optionally limited by file extension.", { query: string("Literal text"), extension: string("Optional extension, such as .py") }, ["query"]),
  tool("read_file", "Read and summarize-ready content from TXT, JSON, CSV, Markdown, or PDF files in the workspace.", { path: string("Relative file path") }, ["path"]),
  tool("write_file", "Create or replace a text-based file in the workspace, including required parent directories. Confirmation is requested once per request.", { path: string("Relative output path"), content: string("Complete file content") }, ["path", "content"]),
  tool("run_python", "Run Python for calculation or data analysis. Always asks the user for confirmation and has a time limit.", { code: string("Python code") }, ["code"]),
  tool("run_terminal", "Run a safe, allowlisted terminal command in the workspace. Destructive commands require confirmation.", { command: string("Command program"), args: { type: "array", items: { type: "string" }, description: "Command arguments" } }, ["command"]),
  tool("sqlite_query", "Run SQLite SQL against a workspace .db file. Mutating SQL requires confirmation.", { database: string("Relative .db path"), sql: string("SQLite SQL"), params: { type: "array", items: {} } }, ["database", "sql"]),
  tool("api_request", "Make a JSON HTTP GET or POST request to an API.", { url: string("http(s) URL"), method: string("GET or POST; default GET"), body: string("Optional JSON request body") }, ["url"]),
  tool("memory", "Save, retrieve, list, or forget non-sensitive user preferences in local session memory.", { action: string("save, get, list, or forget"), key: string("Memory key"), value: string("Non-sensitive value") }, ["action"]),
  tool("date_time", "Get the local date/time or calculate the number of days until an ISO date.", { target_date: string("Optional YYYY-MM-DD target date") }),
  tool("json_tool", "Parse, validate, pretty-print, or modify JSON text.", { operation: string("validate, pretty, get, or set"), json: string("JSON text"), key: string("Property key for get or set"), value: string("JSON value for set") }, ["operation", "json"]),
  tool("text_process", "Count words, extract lines containing a term, or transform text to upper/lower case.", { operation: string("word_count, extract, upper, or lower"), text: string("Text to process"), query: string("Term for extract") }, ["operation", "text"]),
  tool("git", "Inspect repository status, branches, log, diff, or run a Git operation. Destructive operations require confirmation.", { args: { type: "array", items: { type: "string" }, description: "Git arguments" } }, ["args"])
];
