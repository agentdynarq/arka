# 0003. No master key, 3-of-5 quorum recovery

**Status:** Accepted
**Date:** 22 July 2026

## Context

The competition scenario turns on a Master Key: the artifact needed to unlock the banking network,
hidden behind security layers, holding the entire system hostage. Every dependent service died the
moment that one secret became unavailable. The availability of a global system hinged on a single
object.

Reproducing that structure while claiming to have fixed the disaster would be incoherent.

## Decision

Arka has no master key. There is no single artifact whose possession unlocks the platform and no
single artifact whose loss disables it.

Signing keys are **per Cell**, so the blast radius of a key compromise is one Cell. Cryptographic root
recovery requires a quorum ceremony in which **3 of 5** independent keyholders participate.

## Alternative considered

A single, very well protected root key held in an HSM.

Rejected because it is precisely the failure mode the scenario describes. A better-guarded single
point of failure is still a single point of failure. The 2065 outage was not caused by a weak key. It
was caused by there being one.

## Consequences

Accepted costs. Recovery is slower **on purpose**. It requires coordinating several people rather than
one administrator with the right credential, and that is an operational burden during exactly the
moments when speed feels most urgent. Keyholder availability becomes a real planning concern:
three must be reachable.

What is bought. There is nothing to steal, ransom or lose that unlocks the system. An attacker who
compromises one keyholder gains nothing. An attacker who compromises one Cell's signing key reaches
one Cell.

Operational note. No exception to the quorum exists for urgency. A quorum with an emergency override
is not a quorum, it is a master key with extra steps. Procedure is in `docs/RUNBOOK.md`, P4.
