import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_SCRIPT = join(process.cwd(), "env.sh");
const BUNDLE_FILE = "chunk.js";
const PRISTINE_BUNDLE = 'const apiUrl="APP_API_URL";';
const EXIT_OK = 0;
const EXIT_REJECTED = 1;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "env-sh-"));
  mkdirSync(join(root, "static"));
  mkdirSync(join(root, "template"));
  writeFileSync(join(root, "template", BUNDLE_FILE), PRISTINE_BUNDLE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Runs the entrypoint against the fake bundle with `true` as the server command. */
function runEnvScript(apiUrl: string) {
  return spawnSync("sh", [ENV_SCRIPT, "true"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_API_URL: apiUrl,
      ASSET_DIR: join(root, "static"),
      TEMPLATE_DIR: join(root, "template"),
    },
  });
}

const renderedBundle = () => readFileSync(join(root, "static", BUNDLE_FILE), "utf8");

describe("env.sh", () => {
  it("renders an allowed URL with query characters into the bundle", () => {
    const result = runEnvScript("https://api.example.com:8443/v1?a=1&b=%20~x#top");
    expect(result.status).toBe(EXIT_OK);
    expect(renderedBundle()).toBe(
      'const apiUrl="https://api.example.com:8443/v1?a=1&b=%20~x#top";',
    );
  });

  it("renders a bracketed IPv6 host", () => {
    const result = runEnvScript("http://[::1]:8002");
    expect(result.status).toBe(EXIT_OK);
    expect(renderedBundle()).toBe('const apiUrl="http://[::1]:8002";');
  });

  it.each([
    ["credentials (@)", "http://user:secret@localhost:8002"],
    ["a quote", 'http://localhost:8002/"+alert(1)+"'],
    ["a space", "http://localhost:8002/ api"],
    ["an angle bracket", "http://localhost:8002/<script>"],
  ])("rejects a URL with %s and leaves the bundle untouched", (_name, apiUrl) => {
    const result = runEnvScript(apiUrl);
    expect(result.status).toBe(EXIT_REJECTED);
    expect(result.stderr).toContain("APP_API_URL may only contain");
    expect(() => renderedBundle()).toThrow(/ENOENT/);
  });
});
