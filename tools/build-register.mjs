#!/usr/bin/env node
// 台帳生成器 — apps/ を走査して apps.json を作り直す。
//
// 管理番号(no)は一度付いたら動かない。apps.json の nextNo（無ければ
// 既存の最大値+1）を種にして、新顔だけに次の番号を振る。
// apps.json を消すと振り直しになる。

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'apps');
const REGISTER_PATH = path.join(ROOT, 'apps.json');

function readManifest(html) {
  const m = html.match(/<script\b[^>]*id=["']app-manifest["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return { __broken: true };
  }
}

function pickTitle(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
}

function pickDescMeta(html) {
  return (html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || '').trim();
}

function titleName(title) {
  return title.split(/[|—–\-/／｜]/)[0].trim();
}

async function lastCommitDate(absPath) {
  try {
    const rel = path.relative(ROOT, absPath);
    const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%cI', '--', rel], { cwd: ROOT });
    const iso = stdout.trim();
    if (iso) return iso;
  } catch {
    // no git history available (uncommitted file, no git, shallow clone)
  }
  const s = await stat(absPath);
  return s.mtime.toISOString();
}

async function listAppFiles() {
  if (!existsSync(APPS_DIR)) return [];
  const entries = await readdir(APPS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /\.html?$/i.test(name) && !name.startsWith('_'))
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

async function loadPreviousRegister() {
  try {
    const raw = await readFile(REGISTER_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function numberFrom(str) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : 0;
}

async function build() {
  const previous = await loadPreviousRegister();
  const prevApps = previous?.apps || [];
  const noByFile = new Map(prevApps.map((a) => [a.file, a.no]));

  let nextNo = previous?.nextNo
    ?? (prevApps.reduce((max, a) => Math.max(max, numberFrom(a.no)), 0) + 1);
  if (!Number.isFinite(nextNo) || nextNo < 1) nextNo = 1;

  const filenames = await listAppFiles();
  const apps = [];

  for (const filename of filenames) {
    const absPath = path.join(APPS_DIR, filename);
    const html = await readFile(absPath, 'utf8');
    const bytes = Buffer.byteLength(html, 'utf8');
    const file = `apps/${filename}`;

    const mf = readManifest(html);
    if (mf?.__broken) {
      console.warn(`⚠ ${file}: app-manifest が壊れています（JSON解析失敗）。title/description で代用します。`);
    }

    const title = pickTitle(html);
    const name = (mf && !mf.__broken && mf.name) || titleName(title) || filename;
    const desc = (mf && !mf.__broken && mf.desc) || pickDescMeta(html) || '';
    const category = (mf && !mf.__broken && mf.category) || '未分類';
    const icon = (mf && !mf.__broken && mf.icon) || '◇';
    const reading = (mf && !mf.__broken && mf.reading) || '';
    const tags = (mf && !mf.__broken && Array.isArray(mf.tags)) ? mf.tags : [];

    let no = noByFile.get(file);
    if (!no) {
      no = String(nextNo).padStart(3, '0');
      nextNo += 1;
    }

    const updated = await lastCommitDate(absPath);

    apps.push({ no, file, name, reading, desc, category, icon, tags, updated, bytes });
  }

  apps.sort((a, b) => a.no.localeCompare(b.no));

  const categories = [...new Set(apps.map((a) => a.category))].sort((a, b) => a.localeCompare(b, 'ja'));
  const totalBytes = apps.reduce((sum, a) => sum + a.bytes, 0);

  const register = {
    generated: new Date().toISOString(),
    count: apps.length,
    totalBytes,
    categories,
    apps,
    nextNo,
  };

  const json = JSON.stringify(register, null, 2) + '\n';
  const previousJson = previous ? JSON.stringify({ ...previous, generated: undefined }) : null;
  const currentJson = JSON.stringify({ ...register, generated: undefined });
  const changed = previousJson !== currentJson;

  await writeFile(REGISTER_PATH, json, 'utf8');

  console.log(`台帳: ${apps.length} 台 (${changed ? '差分あり' : '差分なし'})`);
  return changed;
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
