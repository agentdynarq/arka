// Narrative title card, not a technical demo: there is no old system to run,
// so this doesn't pretend to hack one. It types the same incident framing
// already reviewed in README.md/the landing page, clearly presented as the
// scenario's story, not fabricated technical output.
function line(text, delayAfterMs = 500) {
  return [
    { type: 'prompt', text },
    { type: 'pause', seconds: delayAfterMs / 1000 },
  ]
}

export const width = 100
export const height = 14

export default [
  { type: 'write', text: '2065 INCIDENT REPORT\r\n' },
  { type: 'write', text: '\x1b[2m' + '-'.repeat(60) + '\x1b[0m\r\n\r\n' },
  ...line('root cause: one trust domain, one network, one Master Key', 900),
  ...line('one compromise reached every service, every Cell, every account', 1200),
  ...line('the ledger was never designed to be rebuilt, only trusted', 1200),
  { type: 'write', text: '\r\n\x1b[2m' + '-'.repeat(60) + '\x1b[0m\r\n' },
  ...line('customer data survived in backups. operations did not.', 1500),
  { type: 'pause', seconds: 1 },
]
