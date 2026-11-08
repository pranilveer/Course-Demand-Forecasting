# YottaFlex Course Demand & Faculty Allocation

A TypeScript MERN application for forecasting course demand and allocating faculty and sections under capacity, skill, availability, workload, room, and prerequisite constraints.

## Status

Phase 1: monorepo scaffold, shared schema/types, deterministic RNG/ID helpers, Docker configuration, and build scripts.

The implementation is being committed phase by phase.

## Stack

- Node.js 20+
- TypeScript
- Express
- MongoDB 7
- Mongoose
- React + Vite
- Vitest
- Docker Compose

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop (for MongoDB)

## Quick start

```powershell
npm install
docker compose up -d mongo
npm run build
```

The pipeline, API, and dashboard commands are added in later phases.

## Repository layout

```text
shared/   Shared TypeScript types, schema metadata, constants, deterministic RNG, ID helpers
server/   Express API, Mongoose models, synthetic data pipeline, validation, exports
client/   React analytics dashboard
data/     Generated datasets and seed exports
reports/  Validation summaries, metrics, checksums, static report
```

## Fixed seed and terms

- Seed: `20261022`
- Target term: `2026-Fall`
- Historical windows: `2023-Fall`, `2024-Fall`, `2025-Fall`

## AI disclosure

AI-assisted implementation is documented in the prompt history. The candidate is responsible for reviewing, running, and explaining the final solution.
