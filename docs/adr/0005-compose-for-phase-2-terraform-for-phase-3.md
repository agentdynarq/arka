# 0005. Docker Compose for Phase 2, Terraform deferred to Phase 3

**Status:** Accepted
**Date:** 26 July 2026

## Context

The Phase 1 blueprint describes the whole bank as code: Terraform modules with one module instantiated
once per Cell, deployed to AWS. That remains the intended production shape.

The Phase 2 brief asks for three things: a public repository, working source code, and a user guide.
It requires no deployment link and verifies no cloud environment. Phase 3, on 6 August, is the
deployment phase and has its own window from 1 to 5 August.

Phase 2 has five working days remaining and two people.

## Decision

Phase 2 ships a Docker Compose stack that brings up two complete, independent Cells locally. Terraform
is deferred to the Phase 3 window.

The property that matters is preserved either way, because a Cell is configuration rather than code.
Compose instantiates the same service definitions twice with different `CELL_ID`, database URL, Redis
URL and signing key, which is exactly what the Terraform module will do with two tfvars files. The
isolation model is demonstrated end to end in Phase 2 without a cloud account.

## Alternative considered

Building the Terraform modules during Phase 2 alongside the application.

Rejected because it earns close to nothing against the Phase 2 criteria while consuming a day that the
foundation work needs. Deferring it is scheduling, not scope reduction: the same work happens, one
week later, in the phase that actually rewards it.

## Consequences

Accepted costs. Phase 3 begins with infrastructure work still to do rather than with a deployment
already proven. That is a real risk and it is carried knowingly. The 1 to 5 August window is reserved
for it and is not available for feature work.

What is bought. Five days of Phase 2 go to the criteria that are actually weighted, and a reviewer can
run the entire platform on a laptop with one command rather than needing cloud credentials.

Follow-through. When the Terraform module is written, it must instantiate the identical service
definitions with per-Cell variables. If it needs a Cell-specific code path, ADR 0001 has been violated
and the defect is in the services, not in the infrastructure.
