#!/bin/bash
set -e
BASE="d:/Scroller/plethora-bit-starter"
cd "$BASE"

upload_bit() {
  local file="$1"
  local title="$2"
  local desc="$3"

  echo "==> Building $title..."
  cp "example_bits/$file" src/index.js
  npm run build

  echo "==> Uploading $title..."
  node plethora.js upload dist/bit.js --title "$title" --desc "$desc" --tags creative
  echo ""
}

upload_bit "fish_coloring.js"            "Fish Coloring"            "Color a fisherman and jumping fish scene"
upload_bit "dinosaur_coloring.js"        "Dinosaur Coloring"        "Color a cute kawaii dinosaur scene"
upload_bit "mandala_coloring.js"         "Mandala Coloring"         "Color an intricate floral mandala design"
upload_bit "liberty_coloring.js"         "Liberty Coloring"         "Color the Statue of Liberty and city skyline"
upload_bit "mushroom_forest_coloring.js" "Mushroom Forest Coloring" "Color a detailed mushroom forest scene"
