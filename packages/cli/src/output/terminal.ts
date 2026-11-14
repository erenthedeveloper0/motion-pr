import pc from "picocolors";

export interface TerminalOptions {
  /** Machine-readable mode: human output goes to stderr, stdout is reserved for JSON. */
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  /** Treat the session as non-interactive (CI or --ci). */
  ci?: boolean;
}

export type Colors = ReturnType<typeof pc.createColors>;

const BRAND_RGB = [126, 74, 230] as const; // #7E4AE6, MotionPR violet
const CYAN_RGB = [104, 214, 232] as const;

function supportsTrueColor(): boolean {
  const ct = process.env.COLORTERM ?? "";
  return (
    ct === "truecolor" ||
    ct === "24bit" ||
    process.env.TERM_PROGRAM === "iTerm.app" ||
    process.env.TERM_PROGRAM === "vscode"
  );
}

export function isCI(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean(env.CI && env.CI !== "false") ||
    Boolean(env.GITHUB_ACTIONS) ||
    Boolean(env.BUILDKITE) ||
    Boolean(env.GITLAB_CI)
  );
}

/**
 * Terminal output with a small, consistent visual language. Writes to stderr for human output
 * (so `--json` output on stdout stays parseable) and degrades to plain lines when not a TTY.
 */
export class Terminal {
  readonly c: Colors;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly interactive: boolean;
  readonly ci: boolean;
  readonly #stream: NodeJS.WriteStream;
  readonly #trueColor: boolean;
  readonly #unicode: boolean;

  constructor(options: TerminalOptions = {}) {
    this.json = options.json ?? false;
    this.quiet = options.quiet ?? false;
    this.verbose = options.verbose ?? false;
    this.ci = options.ci ?? isCI();
    this.#stream = process.stderr;
    const colorEnabled =
      options.color ??
      (process.env.NO_COLOR
        ? false
        : process.env.FORCE_COLOR
          ? process.env.FORCE_COLOR !== "0"
          : Boolean(this.#stream.isTTY));
    this.c = pc.createColors(colorEnabled);
    this.#trueColor = colorEnabled && supportsTrueColor();
    this.interactive = Boolean(this.#stream.isTTY && process.stdin.isTTY) && !this.ci && !this.json;
    this.#unicode =
      process.platform !== "win32" ||
      Boolean(process.env.WT_SESSION) ||
      process.env.TERM_PROGRAM === "vscode";
  }

  #rgb(rgb: readonly [number, number, number], fallback: (s: string) => string, s: string): string {
    if (!this.c.isColorSupported) return s;
    return this.#trueColor
      ? `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\u001b[39m`
      : fallback(s);
  }

  brand(s: string): string {
    return this.#rgb(BRAND_RGB, this.c.magenta, s);
  }

  tech(s: string): string {
    return this.#rgb(CYAN_RGB, this.c.cyan, s);
  }

  get symbols() {
    return this.#unicode
      ? {
          ok: "✔",
          fail: "✖",
          warn: "▲",
          info: "●",
          uncertain: "◇",
          arrow: "→",
          bullet: "·",
          mark: "◐",
          line: "─",
        }
      : {
          ok: "√",
          fail: "×",
          warn: "!",
          info: "i",
          uncertain: "?",
          arrow: "->",
          bullet: "-",
          mark: "o",
          line: "-",
        };
  }

  write(line = ""): void {
    if (this.quiet) return;
    this.#stream.write(`${line}\n`);
  }

  /** Always printed, even with --quiet (errors). */
  writeAlways(line = ""): void {
    this.#stream.write(`${line}\n`);
  }

  header(title: string, version: string): void {
    this.write(
      `${this.brand(this.symbols.mark)} ${this.c.bold("motionpr")} ${this.c.dim(version)}  ${this.c.dim(this.symbols.bullet)}  ${title}`,
    );
    this.write();
  }

  step(message: string): void {
    this.write(`  ${this.c.dim(this.symbols.arrow)} ${message}`);
  }

  success(message: string): void {
    this.write(`  ${this.c.green(this.symbols.ok)} ${message}`);
  }

  warn(message: string): void {
    this.write(`  ${this.c.yellow(this.symbols.warn)} ${message}`);
  }

  info(message: string): void {
    this.write(`  ${this.tech(this.symbols.info)} ${message}`);
  }

  fail(message: string): void {
    this.writeAlways(`  ${this.c.red(this.symbols.fail)} ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) this.write(`  ${this.c.dim(`· ${message}`)}`);
  }

  hint(message: string): void {
    for (const line of message.split("\n")) this.write(`    ${this.c.dim(line)}`);
  }

  rule(): void {
    this.write(this.c.dim(`  ${this.symbols.line.repeat(56)}`));
  }

  /** Prints the next command(s) to run, highlighted. */
  next(commands: string[]): void {
    this.write();
    this.write(`  ${this.c.dim("Next")}`);
    for (const cmd of commands) this.write(`  ${this.c.dim("$")} ${this.tech(cmd)}`);
  }

  spinner(text: string): Spinner {
    return new Spinner(this, text);
  }

  get stream(): NodeJS.WriteStream {
    return this.#stream;
  }
}

const FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"];

/** Minimal spinner: animates on a TTY, prints a single line per state change otherwise. */
export class Spinner {
  readonly #t: Terminal;
  #text: string;
  #timer: NodeJS.Timeout | undefined;
  #frame = 0;
  #animated: boolean;

  constructor(t: Terminal, text: string) {
    this.#t = t;
    this.#text = text;
    this.#animated = t.interactive && !t.quiet && Boolean(t.stream.isTTY);
    if (this.#animated) {
      this.#t.stream.write("\u001b[?25l");
      this.#render();
      this.#timer = setInterval(() => this.#render(), 80);
      this.#timer.unref();
    } else {
      t.step(text);
    }
  }

  #render(): void {
    const frame = this.#t.brand(FRAMES[this.#frame++ % FRAMES.length]!);
    this.#t.stream.write(`\r\u001b[2K  ${frame} ${this.#text}`);
  }

  update(text: string): void {
    this.#text = text;
    if (!this.#animated) this.#t.debug(text);
  }

  #clear(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    if (this.#animated) this.#t.stream.write("\r\u001b[2K\u001b[?25h");
  }

  succeed(text = this.#text): void {
    this.#clear();
    this.#t.success(text);
  }

  fail(text = this.#text): void {
    this.#clear();
    this.#t.fail(text);
  }

  warn(text = this.#text): void {
    this.#clear();
    this.#t.warn(text);
  }

  stop(): void {
    this.#clear();
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
