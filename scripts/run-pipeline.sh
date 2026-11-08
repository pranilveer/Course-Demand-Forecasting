#!/usr/bin/env sh
set -eu

SCALE="${1:-starter}"
SEED="${2:-20261022}"
DB="${3:-yottaflex}"

npm run pipeline -- --scale "$SCALE" --seed "$SEED" --db "$DB"
npm run validate -- --db "$DB"
npm run export -- --db "$DB" --scale "$SCALE"
npm run report -- --db "$DB" --scale "$SCALE"
