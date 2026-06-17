'use strict';

const fs = require('fs');
const path = require('path');

/** Tiny JSON/text file store rooted at the repo (free, versioned artifact archive). */
class FileStore {
  constructor(root) {
    this.root = root;
  }

  resolve(rel) {
    return path.join(this.root, rel);
  }

  readJSON(rel, fallback = null) {
    try {
      return JSON.parse(fs.readFileSync(this.resolve(rel), 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  writeJSON(rel, obj) {
    const p = this.resolve(rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
    return p;
  }

  writeText(rel, text) {
    const p = this.resolve(rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    return p;
  }
}

module.exports = { FileStore };
