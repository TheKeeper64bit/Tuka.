# Verification — 3 November 2026

Tested local Baseten integration commit `bfee93b511471343be4f14af86a39ed191b4da7c`.

- Full automated suite: 188 Node tests passed, plus all standalone regressions.
- Meta build and Wrangler deployment dry run passed. No deployment performed.
- Import browser checks passed at 320, 390 and 1280 pixels: import worker, native-script search, route/journey selection, saved-state isolation, reload, updates, deletion, invalid imports, offline reader, news fallback and preventing Copilot from answering about another city.
- Public Metlink ZIP browser check passed: 245 lines, route selection and reload; review took 5.494 seconds in this environment. This single timing is not an optimization benchmark.
- No browser page errors. Neutral basemaps and controlled network responses were used; these checks do not verify live street tiles or a field journey.
- Baseten routing, credential isolation, fallback, tool replay and request formats were tested with mocked responses. Local Baseten key/model configuration was absent, so the bounded live smoke request was skipped: zero live AI requests and zero provider tokens consumed.

No source fixes were needed during this test pass. The broader profiling/optimization work and live Baseten verification remain separate outstanding work.
