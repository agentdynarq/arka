# 0001. Cells with no route between them

**Status:** Accepted
**Date:** 22 July 2026

## Context

The 2065 collapse in the competition scenario happened because banking systems shared one trust
domain. Once the malware crossed the perimeter, every internal call trusted it and it moved laterally
without resistance. Containing a future compromise is the central design problem, not a feature.

## Decision

Partition the customer base across independent Cells. Each Cell runs the full service stack with its
own databases and its own event bus. **No network route exists between Cells.** Customers are pinned
to exactly one Cell by stable hash, and only the gateway's Cell Router knows more than one Cell
exists.

A Cell is produced by configuration, never by a code branch. There is exactly one copy of each
service in the repository.

## Alternative considered

One large microservice estate with network policies restricting traffic between services.

Rejected because policies are configuration and configuration drifts. Someone widens a rule during an
incident and never narrows it again. An absent route cannot drift: there is nothing to misconfigure.

## Consequences

Accepted costs. Infrastructure is duplicated per Cell, so running costs scale with Cell count rather
than purely with load. Cross-Cell operations, such as a transfer between customers in different
Cells, need an explicit mechanism rather than a database join. Load balancing loses flexibility
because a customer cannot be moved to a quieter Cell on demand.

What is bought. Blast radius becomes a design parameter chosen in advance rather than a number
discovered during an incident. The isolation claim is reviewable in ten seconds by comparing two
configuration files, rather than requiring an audit of a policy engine.

Enforcement. A test asserts that no service source file branches on `CELL_ID`, and that no credential
in one Cell's configuration authenticates against another Cell's data stores. Isolation that is only
documented is not isolation.
