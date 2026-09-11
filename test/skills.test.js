import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  destination,
  installSkill,
  parseAgents,
  skillRoot,
} from "../src/commands/skill.js";

test("skill agent selection supports all first-class targets", () => {
  assert.deepEqual(parseAgents("andromity,cursor,andromity"), ["andromity", "cursor"]);
  assert.equal(parseAgents("all").includes("andromity"), true);
  assert.throws(() => parseAgents("unknown"), /Unknown agent/);
});

test("Andromity uses its native project and user skill directories", () => {
  const cwd = path.join("C:", "workspace");
  assert.equal(skillRoot("andromity", "project", cwd), path.join(cwd, ".andromity", "skills"));

  const expectedUser = process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "andromity", "skills")
    : path.join(os.homedir(), ".andromity", "skills");
  assert.equal(skillRoot("andromity", "user", cwd), expectedUser);
});

test("native destinations are stable", () => {
  const cwd = path.join("C:", "workspace");
  assert.equal(destination("cursor", "seo-audit", "project", cwd), path.join(cwd, ".cursor", "rules", "seo-audit.mdc"));
  assert.equal(destination("cline", "seo-audit", "project", cwd), path.join(cwd, ".clinerules", "seo-audit.md"));
  assert.equal(destination("claude-code", "seo-audit", "project", cwd), path.join(cwd, ".claude", "skills", "seo-audit", "SKILL.md"));
  assert.equal(destination("windsurf", "seo-audit", "project", cwd), path.join(cwd, ".windsurfrules"));
  assert.equal(destination("copilot", "seo-audit", "project", cwd), path.join(cwd, ".github", "copilot-instructions.md"));
});

test("install writes native files and merges aggregate rule files", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenticmarket-cli-"));
  const previousCwd = process.cwd();
  const previousFetch = global.fetch;
  const raw = [
    "---",
    "name: demo-skill",
    "description: A test skill",
    "---",
    "",
    "# Demo skill",
    "",
    "Follow the test instructions.",
    "",
  ].join("\n");

  global.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/skills/demo-skill")) {
      return new Response(JSON.stringify({ skill: {
        slug: "demo-skill",
        name: "Demo Skill",
        description: "A test skill",
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/skills/demo-skill/raw")) {
      return new Response(raw, {
        status: 200,
        headers: {
          "content-type": "text/markdown",
          "x-agenticmarket-version": "1.0.0",
          "x-agenticmarket-checksum": "test-checksum",
        },
      });
    }
    if (url.endsWith("/skills/install-event")) return new Response("{}", { status: 200 });
    throw new Error(`Unexpected test request: ${url}`);
  };

  try {
    process.chdir(temp);
    const result = await installSkill("demo-skill", {
      agent: "andromity,cursor,windsurf,copilot",
      scope: "project",
    });

    assert.equal(result.results.filter((item) => item.written).length, 4);
    assert.match(fs.readFileSync(destination("andromity", "demo-skill", "project", temp), "utf8"), /Follow the test instructions/);
    assert.match(fs.readFileSync(destination("cursor", "demo-skill", "project", temp), "utf8"), /alwaysApply: false/);
    assert.match(fs.readFileSync(destination("windsurf", "demo-skill", "project", temp), "utf8"), /agenticmarket:skill:demo-skill:start/);
    assert.match(fs.readFileSync(destination("copilot", "demo-skill", "project", temp), "utf8"), /AgenticMarket skill: Demo Skill/);
  } finally {
    process.chdir(previousCwd);
    global.fetch = previousFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
