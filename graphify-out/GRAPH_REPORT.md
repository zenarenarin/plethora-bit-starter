# Graph Report - plethora-bit-starter  (2026-05-02)

## Corpus Check
- 222 files · ~508,644 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1127 nodes · 1179 edges · 28 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 140|Community 140]]
- [[_COMMUNITY_Community 142|Community 142]]
- [[_COMMUNITY_Community 143|Community 143]]
- [[_COMMUNITY_Community 206|Community 206]]

## God Nodes (most connected - your core abstractions)
1. `assertSourcePackageContract()` - 14 edges
2. `_startGame()` - 10 edges
3. `_drop()` - 9 edges
4. `normalizeBitManifest()` - 9 edges
5. `cmdUpload()` - 8 edges
6. `cmdCheck()` - 8 edges
7. `extractBitSourceMeta()` - 8 edges
8. `validateAssetInput()` - 8 edges
9. `checkPackageDirectory()` - 8 edges
10. `resume()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `checkSourceBit()` --calls--> `assertSourcePackageContract()`  [INFERRED]
  build.js → lib\bit-contract.js
- `cmdCheck()` --calls--> `find()`  [INFERRED]
  plethora.js → puzzle-bits\solve_all.js
- `init()` --calls--> `find()`  [INFERRED]
  education_bits\calorie_density.js → puzzle-bits\solve_all.js
- `_handleDown()` --calls--> `resume()`  [INFERRED]
  education_bits\doppler_effect.js → zip-build\surrealutopia.js
- `_playCompositeThud()` --calls--> `resume()`  [INFERRED]
  education_bits\prime_sieve.js → zip-build\surrealutopia.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (59): assertSourcePackageContract(), buildAssetDescriptor(), byteLength(), canonicalPackageByteLength(), canonicalRawAssetPath(), checkPackageDirectory(), cleanString(), describeAsset() (+51 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (21): _initAudio(), _getBuyingPower(), _getCPI(), init(), _lerp(), _setYear(), _startAnimation(), _tick() (+13 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (8): init(), _draw(), _drawCymbal(), _drawDrum(), _lighten(), _withAlpha(), find(), union()

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (22): _computeLayout(), _draw(), _drawBpmBtn(), _drawHeader(), _drawPad(), _drawPlayBtn(), _drawStepColumnHighlight(), _drawTrackRow() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (19): _boot(), _buildDominos(), _createDomino(), destroy(), init(), _initAudio(), _kickChain(), _loadPC() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (19): _buildHUD(), _buildTrack(), destroy(), init(), _initAudio(), _loadAmmo(), _loadLibs(), _makeBox() (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (17): destroy(), _drop(), _hideOverlay(), _initAudio(), _makeBlock(), _makeIceMat(), _showCutShard(), _showOverlay() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (17): _bindInput(), _buildTower(), _checkBlocks(), _checkWin(), _clearBlocks(), destroy(), init(), _initAudio() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (7): fail(), ok(), verifyKakuro(), verifyKillerSudoku(), verifyStr8ts(), verifyYosenabe(), warn()

### Community 9 - "Community 9"
Cohesion: 0.24
Nodes (9): _addEdge(), _bindPointer(), _buildGraph(), _doRewire(), init(), _removeEdge(), _startBit(), _update() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (11): _cancelAnimation(), destroy(), _drawCalendar(), init(), _initAudio(), _makeControl(), _onChange(), _recalc() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (9): _computeObservedFreq(), _emitWave(), _handleDown(), init(), _loop(), _resize(), _roundRect(), _startAudio() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.2
Nodes (2): destroy(), _stopEngineHum()

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (5): init(), _soundLand(), _soundMilestone(), _soundMiss(), _startGame()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (6): _advance(), _growFullCanopy(), _growSapling(), _growSprout(), _growYoungTree(), _updateDots()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (5): _fmt(), init(), _maybePlaySound(), _render(), _startAutoAnimate()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (6): init(), _log(), _step2(), _step3(), _step4(), _summary()

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (2): mod289(), permute()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (2): init(), _updateSliderVisuals()

### Community 20 - "Community 20"
Cohesion: 0.48
Nodes (5): init(), _log(), _summarize(), _testScript(), _testUrls()

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (2): _spawnPlanet(), _startAnimations()

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (2): init(), _start()

### Community 112 - "Community 112"
Cohesion: 0.67
Nodes (2): init(), _startBit()

### Community 113 - "Community 113"
Cohesion: 0.67
Nodes (2): init(), _startBit()

### Community 140 - "Community 140"
Cohesion: 0.67
Nodes (2): genValid(), randInt()

### Community 142 - "Community 142"
Cohesion: 0.83
Nodes (3): buildAndTest(), buildPuzzle(), validateNurikabe()

### Community 143 - "Community 143"
Cohesion: 0.83
Nodes (3): buildPuzzle(), test(), validateNurikabe()

### Community 206 - "Community 206"
Cohesion: 1.0
Nodes (2): test(), validateNurikabe()

## Knowledge Gaps
- **Thin community `Community 12`** (11 nodes): `destroy()`, `init()`, `_initAudio()`, `_soundExplode()`, `_soundGameOver()`, `_soundLifeLost()`, `_soundShoot()`, `_start()`, `_startEngineHum()`, `_stopEngineHum()`, `asteroid_drift.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (8 nodes): `pylons.js`, `init()`, `makeFBM()`, `mod289()`, `pause()`, `permute()`, `resume()`, `taylorInvSqrt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (7 nodes): `fourier_wave.js`, `destroy()`, `_drawWave()`, `init()`, `_initAudio()`, `_updateGains()`, `_updateSliderVisuals()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (6 nodes): `lonely_astronaut.js`, `destroy()`, `_doWave()`, `init()`, `_spawnPlanet()`, `_startAnimations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (5 nodes): `liquid_chrome.js`, `_addRipple()`, `destroy()`, `init()`, `_start()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (4 nodes): `destroy()`, `init()`, `_startBit()`, `aurora_tunnel.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (4 nodes): `destroy()`, `init()`, `_startBit()`, `crystal_geode.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (4 nodes): `gen_nurikabe.js`, `genValid()`, `randInt()`, `validateNurikabe()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (3 nodes): `gen_nurikabe6.js`, `test()`, `validateNurikabe()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resume()` connect `Community 1` to `Community 3`, `Community 11`, `Community 4`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `find()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `_initAudio()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `assertSourcePackageContract()` (e.g. with `checkBuiltBit()` and `checkSourceBit()`) actually correct?**
  _`assertSourcePackageContract()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `cmdUpload()` (e.g. with `formatBytes()` and `extractBitSourceMeta()`) actually correct?**
  _`cmdUpload()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._