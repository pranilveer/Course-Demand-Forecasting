param(
  [string]$Scale = "starter",
  [int]$Seed = 20261022,
  [string]$Db = "yottaflex"
)

$ErrorActionPreference = "Stop"
npm run pipeline -- --scale $Scale --seed $Seed --db $Db
npm run validate -- --db $Db
npm run export -- --db $Db --scale $Scale
npm run report -- --db $Db --scale $Scale
