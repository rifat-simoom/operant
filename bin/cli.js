#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];
const distPath = resolve(ROOT, 'dist');
const builtServerEntry = resolve(ROOT, 'dist-server', 'server', 'index.js');
const builtMcpEntry = resolve(ROOT, 'dist-server', 'mcp', 'index.js');
const sourceServerEntry = resolve(ROOT, 'server', 'index.ts');
const sourceMcpEntry = resolve(ROOT, 'mcp', 'index.ts');

function hasBuiltRuntime() {
  return existsSync(distPath) && existsSync(builtServerEntry) && existsSync(builtMcpEntry);
}

function hasSourceCheckout() {
  return existsSync(sourceServerEntry) && existsSync(sourceMcpEntry);
}

function ensureBuiltRuntime() {
  if (hasBuiltRuntime()) return;
  if (!hasSourceCheckout()) {
    console.error('[Operant] Production bundle is missing. Install from source or use a published package.');
    process.exit(1);
  }
  console.log('[Operant] Building production bundle...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  if (!hasBuiltRuntime()) {
    console.error('[Operant] Build completed but runtime bundle is still missing.');
    process.exit(1);
  }
}

function spawnNode(entry, extraEnv = {}) {
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ─── Help ───

function printHelp() {
  console.log(`
  operant - Operant AI agent orchestration platform

  Usage:
    operant              Start the dashboard (backend + frontend)
    operant dev          Start in development mode (hot reload)
    operant mcp          Start MCP server (stdio transport)
    operant build        Build the production bundle from source
    operant --port 3100  Start on a specific port (default: 3100)
    operant --help       Show this help message
    operant --version    Show version

  Environment:
    PORT                   Server port (default: 3100)
    OPERANT_PORT         App port hint for MCP clients
    OPERANT_DB_PATH      Optional override for the SQLite DB path

  MCP Configuration:
    Claude Code:   claude mcp add operant --env OPERANT_PORT=3100 -- npx @rifat-simoom/operant mcp
    Claude Desktop: Add to claude_desktop_config.json:
      {
        "mcpServers": {
          "operant": {
            "command": "npx",
            "args": ["@rifat-simoom/operant", "mcp"],
            "env": { "OPERANT_PORT": "3100" }
          }
        }
      }

  Documentation: https://github.com/rifat-simoom/operant
`);
}

// ─── Commands ───

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const { readFileSync } = await import('fs');
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  console.log(`operant v${pkg.version}`);
  process.exit(0);
}

// Parse --port flag
let port = process.env.PORT || '3100';
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  port = args[portIdx + 1];
}

if (command === 'dev') {
  if (!hasSourceCheckout()) {
    console.error('[Operant] Development mode is only available from a source checkout.');
    process.exit(1);
  }
  // Development mode with hot reload
  const child = spawn('npx', ['concurrently', '-n', 'fe,be', '-c', 'cyan,green',
    'vite', `PORT=${port} npx tsx watch server/index.ts`
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: port },
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));

} else if (command === 'mcp') {
  if (!hasBuiltRuntime() && hasSourceCheckout()) {
    execSync('npm run build:runtime', { cwd: ROOT, stdio: 'inherit' });
  }
  if (existsSync(builtMcpEntry)) {
    spawnNode(builtMcpEntry, { OPERANT_PORT: port });
  } else {
    console.error('[Operant] MCP runtime bundle is missing.');
    process.exit(1);
  }

} else if (command === 'build') {
  if (!hasSourceCheckout()) {
    console.error('[Operant] Build is only available from a source checkout.');
    process.exit(1);
  }
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

} else {
  ensureBuiltRuntime();
  console.log(`[Operant] Starting on port ${port}...`);
  spawnNode(builtServerEntry, { PORT: port, NODE_ENV: 'production' });
}
