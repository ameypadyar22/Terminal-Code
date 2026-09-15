export const COLORS = Object.freeze({
  reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m", blue: "\x1b[34m",
  magenta: "\x1b[35m", yellow: "\x1b[33m", white: "\x1b[37m", gray: "\x1b[90m",
  dim: "\x1b[2m", bold: "\x1b[1m"
});

export const paint = (color, value) => `${COLORS[color]}${value}${COLORS.reset}`;
export const line = (color = "blue") => paint(color, "─".repeat(68));
export const tag = (label, color = "cyan") => paint(color, `${COLORS.bold}[ ${label} ]${COLORS.reset}`);
