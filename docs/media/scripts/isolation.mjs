const REPO = 'E:/DYNARQ/profile/university/duothan/arka'

export const width = 190
export const height = 26

export default [
  { type: 'prompt', text: '$ docker compose ps' },
  { type: 'run', cmd: 'docker', args: ['compose', 'ps'], cwd: REPO },
  { type: 'pause', seconds: 1 },
  { type: 'write', text: '\r\n' },
  { type: 'prompt', text: '$ docker exec arka-cell1-postgres ping -c 2 arka-cell2-postgres' },
  { type: 'run', cmd: 'docker', args: ['exec', 'arka-cell1-postgres', 'ping', '-c', '2', 'arka-cell2-postgres'], cwd: REPO },
  { type: 'pause', seconds: 2 },
  { type: 'write', text: '\r\n' },
  { type: 'prompt', text: '$ pnpm verify-ledger' },
  { type: 'run', cmd: 'pnpm', args: ['verify-ledger'], cwd: REPO },
  { type: 'pause', seconds: 2 },
]
