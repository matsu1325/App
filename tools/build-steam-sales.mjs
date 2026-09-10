import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('data');
const PAGE_SIZE = 50;
const MAX_PAGES = 5;

const REGIONS = [
  { key: 'jp', cc: 'jp', currency: 'JPY', label: '日本' },
  { key: 'us', cc: 'us', currency: 'USD', label: '米国' },
  { key: 'eu', cc: 'de', currency: 'EUR', label: 'ユーロ圏（ドイツ価格）' },
  { key: 'uk', cc: 'gb', currency: 'GBP', label: '英国' },
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
}

function attr(openTag, name) {
  const quoted = openTag.match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  if (quoted) return decodeHtml(quoted[2]);
  const bare = openTag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return bare ? decodeHtml(bare[1]) : '';
}

function classBlock(row, className) {
  const re = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  const m = row.match(re);
  return m ? stripTags(m[1]) : '';
}

function classOpenTag(row, className) {
  const re = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
  return row.match(re)?.[0] || '';
}

function parsePrice(text, regionKey) {
  let s = String(text || '').replace(/\s/g, '').replace(/[^0-9.,]/g, '');
  if (!s) return null;
  if (regionKey === 'eu') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (regionKey === 'jp') {
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTags(openTag) {
  const raw = attr(openTag, 'data-ds-tagids');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return (raw.match(/\d+/g) || []).map(Number);
  }
}

function parseRows(html, regionKey) {
  const rows = html.match(/<a\b[^>]*class=["'][^"']*search_result_row[^"']*["'][\s\S]*?<\/a>/gi) || [];
  const out = [];

  for (const row of rows) {
    const openTag = row.match(/^<a\b[^>]*>/i)?.[0] || '';
    const appidRaw = attr(openTag, 'data-ds-appid');
    const appid = (appidRaw.match(/\d+/) || [])[0] || '';
    const title = classBlock(row, 'title');
    if (!appid || !title) continue;

    const discountText = classBlock(row, 'discount_pct');
    const off = Number((discountText.match(/(\d+)\s*%/) || [])[1] || 0);
    if (!off) continue;

    const was = classBlock(row, 'discount_original_price');
    const now = classBlock(row, 'discount_final_price');
    const nowVal = parsePrice(now, regionKey);

    const imgTag = row.match(/<img\b[^>]*>/i)?.[0] || '';
    let img = attr(imgTag, 'src');
    if (img) img = img.replace('capsule_sm_120', 'capsule_231x87');
    if (!img) img = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;

    const reviewTag = classOpenTag(row, 'search_review_summary');
    const tooltip = attr(reviewTag, 'data-tooltip-html');
    const reviewPlain = stripTags(tooltip);
    const reviewLines = reviewPlain.split('\n').map(s => s.trim()).filter(Boolean);
    const revSummary = reviewLines[0] || '';
    const revPct = Number((reviewPlain.match(/(\d{1,3})\s*%/) || [])[1] || 0) || null;
    const nums = (reviewPlain.match(/[\d,]{2,}/g) || [])
      .map(s => Number(s.replace(/,/g, '')))
      .filter(n => Number.isFinite(n) && n !== revPct);
    const revCount = nums.length ? Math.max(...nums) : null;
    const cls = attr(reviewTag, 'class');
    const revTone = cls.includes('positive') ? 'good' : cls.includes('mixed') ? 'mixed' : cls.includes('negative') ? 'bad' : '';

    out.push({
      appid,
      title,
      img,
      off,
      was,
      now,
      nowVal,
      revSummary,
      revPct,
      revCount,
      revTone,
      tags: parseTags(openTag),
    });
  }
  return out;
}

function buildUrl(region, start) {
  const p = new URLSearchParams({
    query: '',
    start: String(start),
    count: String(PAGE_SIZE),
    dynamic_data: '',
    infinite: '1',
    category1: '998',
    specials: '1',
    filter: 'topsellers',
    cc: region.cc,
    l: 'japanese',
    supportedlang: 'japanese',
    ignore_preferences: '1',
  });
  return `https://store.steampowered.com/search/results/?${p}`;
}

async function fetchJson(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KikaiLedger/1.0; +https://github.com/matsu1325/App)',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'ja,en-US;q=0.8,en;q=0.7',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return JSON.parse(text);
    } catch (error) {
      last = error;
      if (attempt < 3) await sleep(1500 * attempt);
    }
  }
  throw last;
}

async function buildRegion(region) {
  const items = [];
  const seen = new Set();
  let totalCount = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchJson(buildUrl(region, page * PAGE_SIZE));
    if (Number.isFinite(Number(data.total_count))) totalCount = Number(data.total_count);
    const rows = parseRows(data.results_html || '', region.key);
    if (!rows.length) break;
    for (const item of rows) {
      if (!seen.has(item.appid)) {
        seen.add(item.appid);
        items.push(item);
      }
    }
    if (rows.length < PAGE_SIZE) break;
    await sleep(350);
  }

  if (!items.length) throw new Error(`${region.key}: Steamからセール商品を取得できませんでした`);

  const payload = {
    generated: new Date().toISOString(),
    region: region.key,
    steamCountry: region.cc,
    currency: region.currency,
    label: region.label,
    source: 'Steam Store top sellers / specials',
    totalCount,
    count: items.length,
    items,
  };

  const file = path.join(OUT_DIR, `steam-sales-${region.key}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`${region.key}: ${items.length}件を書き出しました`);
}

await fs.mkdir(OUT_DIR, { recursive: true });

let failures = 0;
for (const region of REGIONS) {
  try {
    await buildRegion(region);
  } catch (error) {
    const file = path.join(OUT_DIR, `steam-sales-${region.key}.json`);
    try {
      await fs.access(file);
      console.warn(`${region.key}: 更新失敗。既存キャッシュを保持します: ${error.message}`);
    } catch {
      failures++;
      console.error(`${region.key}: ${error.message}`);
    }
  }
}

if (failures) process.exitCode = 1;
