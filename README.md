# file-search-js

A command-line file search tool written in **JavaScript (Node.js)**.  
Recursively indexes a directory tree and lets you query it by filename, extension, or file content.

Same project as `file-search-cpp` — built to compare how the same concepts (recursion, inverted indexing, REPL) translate between C++ and JavaScript.

---

## Requirements

- Node.js 18 or later (`node --version` to check)

---

## Install & run

```bash
git clone https://github.com/YOUR_USERNAME/file-search-js.git
cd file-search-js

# No npm install needed — zero dependencies

# Index by filename and extension only
node src/main.js /path/to/directory

# Also index file contents (enables 'word' search)
node src/main.js /path/to/directory --content
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `name <query>` | Files whose name contains query (case-insensitive) |
| `ext  <.ext>`  | Files with this extension |
| `word <term>`  | Files whose content contains word (requires `--content`) |
| `stats`        | Index statistics |
| `list`         | All indexed files |
| `quit`         | Exit |

---

## Edge cases handled

| # | Problem | JS-specific? | How it's handled |
|---|---------|-------------|-----------------|
| 1 | Symlink cycles | Both | `Set` of `realpathSync` results |
| 2 | Relative paths | Both | `path.resolve()` at entry |
| 3 | Permission errors | Both | `try/catch` around `readdirSync` |
| 4 | NTFS junctions (Windows) | JS only | Treated same as symlinks via `statSync` |
| 5 | File deleted mid-walk | Both | `try/catch` around `statSync` |
| 6 | Encoding errors in binary files | JS only | `latin1` encoding avoids UTF-8 decoder |
| 7 | Null bytes in files | JS only | Presence of `\0` = binary, skip |
| 8 | Async I/O in REPL | JS only | `readline` event-driven instead of blocking |

---

## Project structure

```
file-search-js/
├── src/
│   ├── index.js    # FileIndex class — recursive walker + inverted index
│   └── main.js     # CLI entry point and readline REPL
├── package.json
└── README.md
```

---

## Key concepts

- **Recursive directory traversal** via `fs.readdirSync` with `withFileTypes: true`
- **Inverted index** using `Map<string, Set<string>>`
- **Encoding-safe tokenisation** with `latin1` + null-byte guard
- **Event-driven REPL** using Node's built-in `readline` module

---

## License

MIT