import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

// Check tracked documentation only; never traverse local data or credentials.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const errors = [];
for (const file of files.filter((p) => p.endsWith('.md'))) {
  const body = readFileSync(file, 'utf8');
  const links = body.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^()\s]*(?:\([^()]*\)[^()\s]*)?)(?:\s+"[^"]*")?\)/g);
  for (const [, raw] of links) {
    const target = raw.replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { errors.push(`${file}: invalid URL ${target}`); continue; }
    if (!existsSync(resolve(dirname(file), decoded))) errors.push(`${file}: missing ${target}`);
  }
}

// Compare the published route inventory to controller decorators without
// installing dependencies or starting an application/database.
const routes = [];
for (const file of files.filter((p) => /^apps\/api\/src\/.*controllers?\.ts$/.test(p))) {
  const source = readFileSync(file, 'utf8');
  const controllers = [...source.matchAll(/@Controller\((?:'([^']*)')?\)/g)];
  for (let i = 0; i < controllers.length; i++) {
    const c = controllers[i];
    const block = source.slice(c.index, controllers[i + 1]?.index ?? source.length);
    for (const m of block.matchAll(/@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/g)) {
      const path = ['/api/v1', c[1], m[2]].filter(Boolean).join('/');
      routes.push(`| ${m[1].toUpperCase()} | \`${path}\` | [source](../${file}) |`);
    }
  }
}
routes.sort();
const start = '<!-- routes:start -->';
const end = '<!-- routes:end -->';
const api = readFileSync('docs/API.md', 'utf8');
const expected = `${start}\n| Method | Route | Controller |\n| --- | --- | --- |\n${routes.join('\n')}\n${end}`;
const current = api.slice(api.indexOf(start), api.indexOf(end) + end.length);
if (process.argv.includes('--write')) {
  const { writeFileSync } = await import('node:fs');
  if (!api.includes(start) || !api.includes(end)) throw new Error('Missing API inventory markers');
  writeFileSync('docs/API.md', api.replace(current, expected));
} else if (current !== expected) errors.push('docs/API.md: controller routes changed; run node scripts/check-docs.mjs --write');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Documentation checked: ${files.filter((p) => p.endsWith('.md')).length} Markdown files, ${routes.length} API routes.`);
