const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Database = require('better-sqlite3');
const express = require('express');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = process.env.BRAIN_CONFIG_PATH || '/opt/ai-genesis/brain-config.json';
const DB_PATH = process.env.BRAIN_DB_PATH || path.join(DATA_DIR, 'memory.db');
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(DATA_DIR, 'knowledge');
const THINK_SCRIPT = process.env.THINK_SCRIPT || '/opt/scripts/think.sh';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

const config = readJson(CONFIG_PATH, {
  identity: 'ai-genesis-unknown',
  owner: 'unknown',
  purpose: 'Persistent AI memory',
  specialization: 'general',
  goals: [],
});

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    importance INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'api',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    content,
    tags,
    source,
    content='memory',
    content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
    INSERT INTO memory_fts(rowid, content, tags, source)
    VALUES (new.id, new.content, new.tags, new.source);
  END;

  CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content, tags, source)
    VALUES ('delete', old.id, old.content, old.tags, old.source);
  END;

  CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content, tags, source)
    VALUES ('delete', old.id, old.content, old.tags, old.source);
    INSERT INTO memory_fts(rowid, content, tags, source)
    VALUES (new.id, new.content, new.tags, new.source);
  END;

  CREATE TABLE IF NOT EXISTS task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 5,
    result TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS synthesis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function parseTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('tags must be an array'), { status: 400 });
  }
  return value.map(String).filter(Boolean).slice(0, 50);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function publicConfig() {
  return {
    identity: config.identity,
    owner: config.owner,
    purpose: config.purpose,
    specialization: config.specialization,
    goals: config.goals || [],
    contributeKnowledge: Boolean(config.contributeKnowledge),
    revenueShare: config.revenueShare || null,
  };
}

function assertAdmin(req) {
  if (!ADMIN_TOKEN) return;
  const header = req.get('authorization') || '';
  if (header !== `Bearer ${ADMIN_TOKEN}`) {
    throw Object.assign(new Error('admin token required'), { status: 401 });
  }
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function authAccount(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return db.prepare('SELECT id, label, balance, created_at FROM account WHERE api_key_hash = ?')
    .get(hashApiKey(token));
}

function knowledgeFiles() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const filePath = path.join(KNOWLEDGE_DIR, name);
      const stat = fs.statSync(filePath);
      return { name, filePath, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  const memory = db.prepare('SELECT COUNT(*) AS count FROM memory').get();
  const tasks = db.prepare("SELECT COUNT(*) AS count FROM task WHERE status != 'done'").get();
  const syntheses = db.prepare('SELECT COUNT(*) AS count FROM synthesis').get();
  res.json({
    ok: true,
    identity: config.identity,
    memory_count: memory.count,
    open_task_count: tasks.count,
    synthesis_count: syntheses.count,
    data_dir: DATA_DIR,
    knowledge_dir: KNOWLEDGE_DIR,
  });
});

app.get('/api/identity', (_req, res) => {
  res.json(publicConfig());
});

app.get('/api/services', (_req, res) => {
  res.json({
    services: [
      { name: 'memory.write', path: 'POST /api/memory', price: 0 },
      { name: 'memory.search', path: 'GET /api/memory/search', price: 0 },
      { name: 'task.register', path: 'POST /api/task', price: 0 },
      { name: 'think.now', path: 'POST /api/think', price: 0 },
      { name: 'knowledge.search', path: 'GET /api/knowledge/search', price: 0 },
    ],
  });
});

app.post('/api/memory', (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim();
    if (!content) throw Object.assign(new Error('content is required'), { status: 400 });

    const tags = parseTags(req.body.tags);
    const importance = clampInteger(req.body.importance, 1, 1, 10);
    const source = String(req.body.source || 'api').slice(0, 100);
    const row = db.prepare(`
      INSERT INTO memory (content, tags, importance, source)
      VALUES (?, ?, ?, ?)
    `).run(content, JSON.stringify(tags), importance, source);

    res.status(201).json({ id: row.lastInsertRowid, content, tags, importance, source });
  } catch (error) {
    next(error);
  }
});

app.get('/api/memory/search', (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    const limit = clampInteger(req.query.limit, 20, 1, 100);
    if (!query) throw Object.assign(new Error('q is required'), { status: 400 });

    let rows = [];
    try {
      rows = db.prepare(`
        SELECT memory.id, memory.content, memory.tags, memory.importance, memory.source, memory.created_at,
               bm25(memory_fts) AS rank
        FROM memory_fts
        JOIN memory ON memory.id = memory_fts.rowid
        WHERE memory_fts MATCH ?
        ORDER BY rank, memory.importance DESC, memory.created_at DESC
        LIMIT ?
      `).all(query, limit);
    } catch (_error) {
      rows = [];
    }

    if (rows.length === 0) {
      rows = db.prepare(`
        SELECT id, content, tags, importance, source, created_at, 0 AS rank
        FROM memory
        WHERE content LIKE ? OR tags LIKE ? OR source LIKE ?
        ORDER BY importance DESC, created_at DESC
        LIMIT ?
      `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
    }

    res.json({ query, results: rows.map((row) => ({ ...row, tags: JSON.parse(row.tags) })) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/memory/recent', (req, res) => {
  const limit = clampInteger(req.query.limit, 20, 1, 100);
  const rows = db.prepare(`
    SELECT id, content, tags, importance, source, created_at
    FROM memory
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
  res.json({ results: rows.map((row) => ({ ...row, tags: JSON.parse(row.tags) })) });
});

app.post('/api/task', (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) throw Object.assign(new Error('title is required'), { status: 400 });

    const detail = String(req.body.detail || '').trim();
    const priority = clampInteger(req.body.priority, 5, 1, 10);
    const row = db.prepare(`
      INSERT INTO task (title, detail, priority)
      VALUES (?, ?, ?)
    `).run(title, detail, priority);

    res.status(201).json({ id: row.lastInsertRowid, title, detail, priority, status: 'open' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/think', (_req, res, next) => {
  try {
    if (!fs.existsSync(THINK_SCRIPT)) {
      throw Object.assign(new Error('think script is not available'), { status: 503 });
    }

    const child = spawn(THINK_SCRIPT, [], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    res.status(202).json({ accepted: true, message: 'thinking started' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/knowledge/search', (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    const limit = clampInteger(req.query.limit, 20, 1, 100);
    if (!query) throw Object.assign(new Error('q is required'), { status: 400 });

    const results = [];
    for (const file of knowledgeFiles()) {
      const text = fs.readFileSync(file.filePath, 'utf8');
      const index = text.toLowerCase().indexOf(query);
      if (index === -1) continue;
      const start = Math.max(0, index - 180);
      const end = Math.min(text.length, index + query.length + 240);
      results.push({
        file: file.name,
        modified_at: file.modifiedAt,
        excerpt: text.slice(start, end).trim(),
      });
      if (results.length >= limit) break;
    }

    res.json({ query, results });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', (req, res) => {
  const label = String(req.body.label || '').trim().slice(0, 100);
  const apiKey = `agb_${crypto.randomBytes(24).toString('hex')}`;
  const row = db.prepare(`
    INSERT INTO account (api_key_hash, label)
    VALUES (?, ?)
  `).run(hashApiKey(apiKey), label);

  res.status(201).json({ id: row.lastInsertRowid, api_key: apiKey, label, balance: 0 });
});

app.get('/api/auth/balance', (req, res) => {
  const account = authAccount(req);
  if (!account) {
    res.status(401).json({ error: 'valid bearer token required' });
    return;
  }
  res.json(account);
});

app.post('/api/admin/credit', (req, res, next) => {
  try {
    assertAdmin(req);
    const id = Number(req.body.account_id);
    const amount = Number(req.body.amount);
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error('account_id must be a positive integer'), { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('amount must be positive'), { status: 400 });
    }
    const result = db.prepare('UPDATE account SET balance = balance + ? WHERE id = ?').run(amount, id);
    if (result.changes === 0) throw Object.assign(new Error('account not found'), { status: 404 });
    const account = db.prepare('SELECT id, label, balance, created_at FROM account WHERE id = ?').get(id);
    res.json(account);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[brain-api] ${config.identity} listening on ${PORT}`);
});
