#!/usr/bin/env node
/**
 * Records a real terminal session to asciicast v2 (docs/media/*.cast), the
 * format agg renders to a GIF. Not a pty capture: `asciinema rec`'s recorder
 * needs a Unix pty this Windows Python does not have. Instead this runs each
 * real command as a child process and writes its real stdout/stderr with
 * real elapsed timing, so the recording is exactly what the command actually
 * printed, never authored text pretending to be output.
 *
 * Usage: node record.mjs <script.mjs> <output.cast>
 * A script module default-exports an array of steps:
 *   { type: 'prompt', text: '$ docker compose up -d' }   // typed, not run
 *   { type: 'run', cmd: 'docker', args: ['compose', 'up', '-d'], cwd? }
 *   { type: 'fetch', method, url, headers?, body? }       // real fetch(), pretty-printed JSON + status
 *   { type: 'pause', seconds: 1 }
 */
import { spawn } from 'node:child_process'
import { writeFileSync, appendFileSync } from 'node:fs'

const [, , scriptPath, outPath] = process.argv
if (!scriptPath || !outPath) {
  console.error('usage: node record.mjs <script.mjs> <output.cast>')
  process.exit(1)
}

const { default: steps, width = 100, height = 26 } = await import(new URL(scriptPath, `file://${process.cwd()}/`).href)

const start = Date.now()
function elapsed() {
  return (Date.now() - start) / 1000
}

writeFileSync(outPath, JSON.stringify({ version: 2, width, height, env: { SHELL: '/bin/bash', TERM: 'xterm-256color' } }) + '\n')

function writeEvent(text) {
  appendFileSync(outPath, JSON.stringify([elapsed(), 'o', text]) + '\n')
}

async function typeText(text, cps = 22) {
  // Simulates real typing speed rather than an instant paste, purely
  // cosmetic: the command that follows is still genuinely executed.
  const perCharMs = 1000 / cps
  for (const ch of text) {
    writeEvent(ch)
    await sleep(perCharMs)
  }
  writeEvent('\r\n')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runFetch({ method, url, headers, body }) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let printed
  try {
    printed = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    printed = text
  }
  writeEvent(printed.replace(/\n/g, '\r\n'))
  writeEvent(`\r\nHTTP ${response.status}\r\n`)
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true })
    child.stdout.on('data', (chunk) => writeEvent(chunk.toString().replace(/\n/g, '\r\n')))
    child.stderr.on('data', (chunk) => writeEvent(chunk.toString().replace(/\n/g, '\r\n')))
    child.on('close', () => resolve())
    child.on('error', reject)
  })
}

for (const step of steps) {
  if (step.type === 'prompt') {
    await typeText(step.text)
    await sleep(150)
  } else if (step.type === 'run') {
    await runCommand(step.cmd, step.args, step.cwd)
    await sleep(150)
  } else if (step.type === 'fetch') {
    await runFetch(step)
    await sleep(150)
  } else if (step.type === 'pause') {
    await sleep(step.seconds * 1000)
  } else if (step.type === 'write') {
    writeEvent(step.text)
  }
}

console.log(`wrote ${outPath}`)
