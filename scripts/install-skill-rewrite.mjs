#!/usr/bin/env node
// Copy a vendored skill directory to its installed destination and apply the
// `superpowers-` namespacing transform (rewrite SKILL.md `name:` field and
// rewrite cross-skill `superpowers:<name>` references to `superpowers-<name>`).
//
// Usage:
//   node scripts/install-skill-rewrite.mjs \
//     --src /path/to/repo/skills/<original> \
//     --dest /path/to/install/skills/superpowers-<original> \
//     --original-name <original> \
//     --new-name superpowers-<original>

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_SKILLS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "executing-plans",
  "verification-before-completion",
];

const DESCRIPTION_OVERRIDES = {
  "using-superpowers":
    "Superpowers workflow scope only. Use inside superpowers-* agents to establish skill usage discipline for that workflow.",
  brainstorming:
    "Superpowers workflow scope only. Use inside superpowers-* agents before design/spec/implementation work.",
  "writing-plans":
    "Superpowers workflow scope only. Use inside superpowers-* agents after approved spec to write implementation plans.",
  "subagent-driven-development":
    "Superpowers workflow scope only. Use inside superpowers-* agents when executing implementation plans with delegated tasks.",
  "executing-plans":
    "Superpowers workflow scope only. Use inside superpowers-* agents when carrying out an approved implementation plan.",
  "verification-before-completion":
    "Superpowers workflow scope only. Use inside superpowers-* agents before any completion or success claim.",
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      index += 1;
      return argv[index];
    };
    if (arg === "--src") args.src = next();
    else if (arg === "--dest") args.dest = next();
    else if (arg === "--original-name") args.originalName = next();
    else if (arg === "--new-name") args.newName = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  for (const key of ["src", "dest", "originalName", "newName"]) {
    if (!args[key]) throw new Error(`missing required --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  }
  return args;
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(s), d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
      fs.chmodSync(d, fs.statSync(s).mode);
    }
  }
}

function rewriteFrontmatterName(text, originalName, newName) {
  const fmMatch = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/);
  if (!fmMatch) return text;
  const [, open, body, close] = fmMatch;
  const nameLineRegex = new RegExp(`^name:\\s*${escapeRegex(originalName)}\\s*$`, "m");
  if (!nameLineRegex.test(body)) return text;
  const newBody = body.replace(nameLineRegex, `name: ${newName}`);
  return `${open}${newBody}${close}${text.slice(fmMatch[0].length)}`;
}

function rewriteFrontmatterDescription(text, originalName) {
  const description = DESCRIPTION_OVERRIDES[originalName];
  if (!description) return text;
  const fmMatch = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/);
  if (!fmMatch) return text;
  const [, open, body, close] = fmMatch;
  const descriptionLineRegex = /^description:\s*.*$/m;
  const nextBody = descriptionLineRegex.test(body)
    ? body.replace(descriptionLineRegex, `description: ${description}`)
    : `${body.trimEnd()}\ndescription: ${description}`;
  return `${open}${nextBody}${close}${text.slice(fmMatch[0].length)}`;
}

function rewriteCrossReferences(text) {
  let out = text;
  for (const skill of REQUIRED_SKILLS) {
    const pattern = new RegExp(`superpowers:${escapeRegex(skill)}(?![A-Za-z0-9_-])`, "g");
    out = out.replace(pattern, `superpowers-${skill}`);
  }
  return out;
}

function transformMarkdownTree(dir, originalName, newName) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      transformMarkdownTree(full, originalName, newName);
      continue;
    }
    if (!entry.isFile() || !full.toLowerCase().endsWith(".md")) continue;
    let content = fs.readFileSync(full, "utf8");
    content = rewriteFrontmatterName(content, originalName, newName);
    content = rewriteFrontmatterDescription(content, originalName);
    content = rewriteCrossReferences(content);
    fs.writeFileSync(full, content);
  }
}

function main() {
  const { src, dest, originalName, newName } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(src)) throw new Error(`source not found: ${src}`);
  if (fs.existsSync(dest)) throw new Error(`destination already exists: ${dest}`);
  const skillMd = path.join(src, "SKILL.md");
  if (!fs.existsSync(skillMd)) throw new Error(`source is missing SKILL.md: ${skillMd}`);
  copyRecursive(src, dest);
  transformMarkdownTree(dest, originalName, newName);
  const installedSkillMd = path.join(dest, "SKILL.md");
  const installed = fs.readFileSync(installedSkillMd, "utf8");
  const expectedNameLine = new RegExp(`^name:\\s*${escapeRegex(newName)}\\s*$`, "m");
  if (!expectedNameLine.test(installed)) {
    throw new Error(`expected SKILL.md to declare 'name: ${newName}' after rewrite: ${installedSkillMd}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
