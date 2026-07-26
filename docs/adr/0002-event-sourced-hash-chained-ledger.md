# 0002. Event-sourced, hash-chained ledger as the source of truth

**Status:** Accepted
**Date:** 22 July 2026

## Context

In the scenario, customer databases survived but institutions still could not serve a single
customer, because backups preserved data rather than operations. Separately, a bank reopening after a
global compromise has to answer a question it cannot answer with a conventional database: how does
anyone know these balances were not tampered with while the system was down?

## Decision

The ledger is an append-only chain of double-entry records. Each block carries the hash of its
predecessor, its entries, and its own hash. Nothing updates or deletes a ledger row.

The ledger is the single source of financial truth. Balances and transaction history are
**projections**: derived read models that can be discarded and rebuilt by replay at any time.

Money is `bigint` in minor units everywhere. No floating point representation of money exists in the
system, in calculation, transport or storage.

The same primitive is reused for the operator audit trail.

## Alternative considered

Conventional mutable balance tables with an audit log kept alongside.

Rejected because an audit log stored beside the data can be edited by whoever can edit the data. It
records history only for an attacker who does not think to alter it. A hash chain makes tampering
detectable by mathematics rather than by trust in access controls.

## Consequences

Accepted costs. Storage grows monotonically and is never reclaimed. Querying is harder: any question
about current state is answered from a projection rather than from the authoritative table.
Projections and the chain can diverge if projection code is wrong, which is a class of bug that does
not exist in a mutable-balances design.

What is bought. Tampering is detectable and, more usefully, **locatable**: verification reports the
sequence number of the first break. Recovery becomes replay rather than restore, which is why zero
ledger records lost is a standard rather than an aspiration. The integrity evidence is exportable, so
the bank can prove its state to a regulator rather than assert it.

Enforcement. `packages/ledger-core` has zero runtime dependencies specifically so it can be tested
exhaustively and read quickly by a reviewer. Its test suite asserts that mutating any historical entry
is detected at the correct index, and that balances replayed from genesis equal the stored projection.
