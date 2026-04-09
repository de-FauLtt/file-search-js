// index.js — FileIndex class
// Recursively walks a directory tree and builds an in-memory inverted index.

import fs   from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────
//  EDGE CASE 1 — SYMLINK CYCLE PROTECTION
//  JS (like C++) must track visited real paths to avoid infinite
//  recursion through symlinks that point back up the tree.
//  We use a Set of resolved (real) paths for O(1) cycle detection.
// ─────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — skip large binaries

export class FileIndex {
  constructor() {
    this._files   = [];                 // Array<FileEntry>
    this._byName  = new Map();          // lowercase name  → Set<path>
    this._byExt   = new Map();          // lowercase .ext  → Set<path>
    this._byWord  = new Map();          // lowercase word  → Set<path>
    this._visited = new Set();          // real paths seen (cycle guard)
  }

  // ── Public API ─────────────────────────────────────────────

  // Build the index from root_dir. Pass { content: true } to also tokenise files.
  build(rootDir, { content = false } = {}) {
    this._files   = [];
    this._byName  = new Map();
    this._byExt   = new Map();
    this._byWord  = new Map();
    this._visited = new Set();

    // EDGE CASE 2 — PATH NORMALISATION
    // On Windows, path.resolve converts forward slashes and handles drive letters.
    // On all platforms it converts relative → absolute so the Set comparisons work.
    const root = path.resolve(rootDir);

    if (!fs.existsSync(root)) {
      throw new Error(`Path does not exist: ${root}`);
    }

    const stat = fs.statSync(root);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${root}`);
    }

    this._walk(root, content);
  }

  // Case-insensitive substring match on filename.
  searchName(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const [name, paths] of this._byName) {
      if (name.includes(q)) results.push(...paths);
    }
    return results;
  }

  // Exact extension match. Caller may pass ".js" or "js" — both work.
  searchExt(ext) {
    const e = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return [...(this._byExt.get(e) ?? [])];
  }

  // Word lookup in indexed content (requires content:true at build time).
  searchContent(word) {
    return [...(this._byWord.get(word.toLowerCase()) ?? [])];
  }

  // Every indexed path.
  all() {
    return this._files.map(f => f.path);
  }

  stats() {
    return {
      files:  this._files.length,
      names:  this._byName.size,
      exts:   this._byExt.size,
      words:  this._byWord.size,
    };
  }

  printStats() {
    const s = this.stats();
    console.log(`Files indexed : ${s.files}`);
    console.log(`Unique names  : ${s.names}`);
    console.log(`Extensions    : ${s.exts}`);
    console.log(`Word tokens   : ${s.words}`);
  }

  // ── Private: recursive walk ────────────────────────────────

  _walk(dir, indexContent) {
    // EDGE CASE 3 — PERMISSION ERRORS
    // fs.readdirSync throws if the process lacks read permission for a directory.
    // We catch and skip rather than crashing the whole traversal.
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip silently
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // EDGE CASE 1 (continued) — resolve symlinks before cycle check
      let realPath;
      try {
        realPath = fs.realpathSync(fullPath);
      } catch {
        continue; // broken symlink or race condition — skip
      }

      if (this._visited.has(realPath)) continue; // cycle — already processed
      this._visited.add(realPath);

      // EDGE CASE 4 — JUNCTIONS ON WINDOWS
      // entry.isDirectory() returns true for NTFS junctions too, so our
      // cycle guard above handles them the same way as symlinks.
      if (entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(realPath).isDirectory())) {
        this._walk(realPath, indexContent); // ← recursive call
      } else if (entry.isFile() || (entry.isSymbolicLink() && fs.statSync(realPath).isFile())) {
        this._addFile(realPath, indexContent); // ← base case
      }
      // Anything else (device files, sockets) is silently ignored
    }
  }

  // ── Private: file ingestion ────────────────────────────────

  _addFile(filePath, indexContent) {
    // EDGE CASE 5 — STAT FAILURES (race condition: file deleted between readdir and stat)
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    const name = path.basename(filePath).toLowerCase();
    const ext  = path.extname(filePath).toLowerCase(); // '' if no extension

    const entry = {
      path:  filePath,
      name,
      ext,
      size:  stat.size,
      mtime: stat.mtimeMs,
    };

    this._files.push(entry);
    this._index(this._byName, name, filePath);
    if (ext) this._index(this._byExt, ext, filePath);

    if (indexContent) this._tokenise(filePath, stat.size);
  }

  _tokenise(filePath, size) {
    if (size > MAX_FILE_SIZE_BYTES) return; // skip large files

    // EDGE CASE 6 — ENCODING ISSUES
    // C++ could just cast bytes to chars. JS strings are UTF-16 internally.
    // Reading a binary file as UTF-8 causes the decoder to emit replacement
    // characters (U+FFFD) for invalid byte sequences — those end up in your
    // index as garbage tokens if you don't filter them.
    // We use 'latin1' (binary) encoding, which maps every byte 1-to-1 to a
    // character, avoiding decoder errors entirely.
    let content;
    try {
      content = fs.readFileSync(filePath, 'latin1');
    } catch {
      return;
    }

    // EDGE CASE 7 — NULL BYTES IN "TEXT" FILES
    // Many files that look like text contain embedded null bytes (compiled
    // output, some Windows UTF-16 files saved without BOM). A null byte in C++
    // is just another char; in JS it's a valid character but a strong signal
    // the file is binary. We skip files with null bytes.
    if (content.includes('\0')) return;

    // Replace non-alpha characters with spaces and split
    const words = content.replace(/[^a-zA-Z]/g, ' ').split(/\s+/);
    const seen  = new Set();

    for (const raw of words) {
      const word = raw.toLowerCase();
      if (word.length < 3) continue;
      if (seen.has(word))  continue;
      seen.add(word);
      this._index(this._byWord, word, filePath);
    }
  }

  // Push filePath into map[key], creating the Set if needed
  _index(map, key, filePath) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(filePath);
  }
}
