// main.js — CLI entry point and REPL
// Usage: node src/main.js <directory> [--content]

import readline from 'node:readline';
import { FileIndex } from './index.js';

// ── Argument parsing ────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node src/main.js <directory> [--content]');
  console.log('');
  console.log('Commands:');
  console.log('  name  <query>   Filename contains query (case-insensitive)');
  console.log('  ext   <.ext>    Files with this extension');
  console.log('  word  <term>    Files containing word (needs --content)');
  console.log('  stats           Index statistics');
  console.log('  list            All indexed files');
  console.log('  quit            Exit');
  process.exit(1);
}

const rootDir     = args[0];
const withContent = args.includes('--content');

// ── Build index ─────────────────────────────────────────────

const idx = new FileIndex();

try {
  console.log(`Indexing ${rootDir} ...`);
  if (withContent) console.log('(content indexing enabled)');
  idx.build(rootDir, { content: withContent });
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

console.log('Done.');
idx.printStats();

// ── REPL ────────────────────────────────────────────────────

// EDGE CASE 8 — ASYNC I/O IN THE REPL
// C++'s std::getline is synchronous — it blocks the thread.
// Node's readline is event-driven (non-blocking). The 'line' event fires
// each time the user presses Enter. This is the same pattern used in every
// Node.js CLI tool: Express uses it for graceful shutdown, Jest for watch mode.

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
  prompt: '> ',
});

function printResults(results, label) {
  if (results.length === 0) {
    console.log(`  (no results for ${label})`);
    return;
  }
  for (const p of results) console.log(`  ${p}`);
  console.log(`  ── ${results.length} result(s)`);
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }

  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const arg = spaceIdx === -1 ? ''      : trimmed.slice(spaceIdx + 1).trim();

  switch (cmd) {
    case 'quit':
    case 'exit':
    case 'q':
      console.log('Bye.');
      rl.close();
      process.exit(0);
      break;

    case 'name':
      if (!arg) { console.log('  Usage: name <query>'); break; }
      printResults(idx.searchName(arg), `name=${arg}`);
      break;

    case 'ext':
      if (!arg) { console.log('  Usage: ext <.ext>'); break; }
      printResults(idx.searchExt(arg), `ext=${arg}`);
      break;

    case 'word':
      if (!arg) { console.log('  Usage: word <term>'); break; }
      if (!withContent) {
        console.log('  Content indexing was not enabled. Re-run with --content.');
        break;
      }
      printResults(idx.searchContent(arg), `word=${arg}`);
      break;

    case 'stats':
      idx.printStats();
      break;

    case 'list':
      printResults(idx.all(), 'all');
      break;

    default:
      console.log('  Unknown command. Try: name, ext, word, stats, list, quit');
  }

  rl.prompt();
});

rl.on('close', () => process.exit(0));

console.log("\nReady. Type a command (or 'quit').");
rl.prompt();
