import { readFileSync } from 'node:fs'

const MEDIA = 'E:/DYNARQ/profile/university/duothan/arka/docs/media'
const TOKEN = readFileSync(`${MEDIA}/.token`, 'utf8').trim()
const AUTH = { Authorization: `Bearer ${TOKEN}` }

const transfer = (idempotencyKey) => ({
  type: 'fetch',
  method: 'POST',
  url: 'http://127.0.0.1:3001/v1/payments/transfers',
  headers: { ...AUTH, 'Idempotency-Key': idempotencyKey },
  body: { fromAccountId: 'customer:alice', toAccountId: 'customer:bob', amount: '5000' },
})

export const width = 110
export const height = 32

export default [
  { type: 'prompt', text: '# alice sends a real transfer. nothing unusual yet.' },
  { type: 'prompt', text: '$ curl :3001/v1/payments/transfers -d \'{"fromAccountId":"customer:alice","toAccountId":"customer:bob","amount":"5000"}\'' },
  transfer('demo-1'),
  { type: 'pause', seconds: 1.5 },
  { type: 'write', text: '\r\n' },

  { type: 'prompt', text: '# Cell 1 is now suspected compromised. two operators quarantine it, dual approval, neither alone.' },
  { type: 'prompt', text: '$ curl :3002/v1/recovery/quarantine/request -d \'{"cellId":"cell-1","requestedBy":"operator-priya"}\'' },
  {
    type: 'fetch',
    method: 'POST',
    url: 'http://127.0.0.1:3002/v1/recovery/quarantine/request',
    body: { cellId: 'cell-1', reason: 'suspected compromise, demo', requestedBy: 'operator-priya' },
  },
  { type: 'pause', seconds: 1 },
  { type: 'prompt', text: '$ curl :3002/v1/recovery/quarantine/approve -d \'{"cellId":"cell-1","approvedBy":"operator-nadeesha"}\'' },
  {
    type: 'fetch',
    method: 'POST',
    url: 'http://127.0.0.1:3002/v1/recovery/quarantine/approve',
    body: { cellId: 'cell-1', approvedBy: 'operator-nadeesha' },
  },
  { type: 'pause', seconds: 1.5 },
  { type: 'write', text: '\r\n' },

  { type: 'prompt', text: '# alice tries to send money again. this is the exact attempt FR-22 exists to stop.' },
  { type: 'prompt', text: '$ curl :3001/v1/payments/transfers -d \'{"fromAccountId":"customer:alice",...}\'' },
  transfer('demo-2'),
  { type: 'pause', seconds: 2 },
  { type: 'write', text: '\r\n' },

  { type: 'prompt', text: '# read-only, not down: her dashboard still works fine.' },
  { type: 'prompt', text: '$ curl :3001/v1/me/dashboard -H "Authorization: Bearer $TOKEN"' },
  { type: 'fetch', method: 'GET', url: 'http://127.0.0.1:3001/v1/me/dashboard', headers: AUTH },
  { type: 'pause', seconds: 1.5 },
  { type: 'write', text: '\r\n' },

  { type: 'prompt', text: '# operators lift the quarantine, dual approval again.' },
  { type: 'prompt', text: '$ curl :3002/v1/recovery/quarantine/lift/request ... && curl :3002/v1/recovery/quarantine/lift/approve ...' },
  {
    type: 'fetch',
    method: 'POST',
    url: 'http://127.0.0.1:3002/v1/recovery/quarantine/lift/request',
    body: { cellId: 'cell-1', requestedBy: 'operator-priya' },
  },
  {
    type: 'fetch',
    method: 'POST',
    url: 'http://127.0.0.1:3002/v1/recovery/quarantine/lift/approve',
    body: { cellId: 'cell-1', approvedBy: 'operator-nadeesha' },
  },
  { type: 'pause', seconds: 1.5 },
  { type: 'write', text: '\r\n' },

  { type: 'prompt', text: '# same transfer, same account. it just works again.' },
  transfer('demo-3'),
  { type: 'pause', seconds: 2 },
]
