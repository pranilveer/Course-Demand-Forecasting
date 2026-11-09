# YottaFlex Course Demand & Faculty Allocation

A TypeScript MERN application for forecasting course demand and allocating faculty and sections under capacity, skill, availability, workload, room, and prerequisite constraints.

## Status

Phases 1-6 complete: monorepo scaffold, deterministic data generation, forecasting, constraint-aware allocation, anomaly injection, and validation. Exports and the read-only dashboard are next.

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

### MongoDB version note

The Compose file defaults to `mongo:4.4` because MongoDB 5+ requires a CPU with AVX support. On an AVX-capable host, use MongoDB 7 explicitly:

```powershell
$env:MONGO_IMAGE = "mongo:7"
docker compose up -d mongo
```

Run the data pipeline, allocation, anomaly injection, and validation phases:

```powershell
npm run pipeline -- --scale starter
npm run forecast
npm run allocate
npm run inject -- --scale starter
npm run validate -- --scale starter
```

Validation writes `reports/validation_summary.json` and `reports/validation_violations.csv`.

The API and dashboard commands are added in later phases.

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
