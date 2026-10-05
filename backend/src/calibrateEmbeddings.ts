/**
 * npm run learning:calibrate [-- <model id> …]
 *
 * Measures how well an embedding model matches Learning Resources shares to
 * roadmap stages, on the labelled set in learningCalibration.ts, and prints
 * the cut-offs to use. Run it whenever OPENROUTER_EMBED_MODEL changes (e.g.
 * moving to OpenAI) and copy the printed EMBED_* lines into .env — or into
 * PROFILES in embeddings.ts once the model is adopted for good.
 *
 * With no model given it measures the configured one; "free" measures every
 * free embedding model OpenRouter lists. Costs one or two embedding calls per
 * model — no database is touched.
 */
// First: loads .env before embeddings.ts reads its key and model.
import './env.js'
import { EMBED_MODEL, embedTexts } from './embeddings.js'
import { FILED, MIN_PRECISION, SHARES, STAGES, cosine, recommend, sameStageCut, shareText, stageText, sweep } from './learningCalibration.js'

async function freeModels(): Promise<string[]> {
  const key = process.env.OPENROUTER_EMBED_API_KEY || process.env.OPENROUTER_API_KEY
  const r = await fetch('https://openrouter.ai/api/v1/embeddings/models', { headers: { Authorization: `Bearer ${key}` } })
  const j = (await r.json()) as { data?: { id: string; pricing?: { prompt?: string } }[] }
  return (j.data ?? []).filter((m) => Number(m.pricing?.prompt) === 0).map((m) => m.id)
}

async function measure(model: string) {
  const shareVecs = await embedTexts(SHARES.map(shareText), 'document', model)
  const stageVecs = await embedTexts(STAGES.map(stageText), 'query', model)
  const sim = stageVecs.map((sv) => shareVecs.map((v) => cosine(sv, v)))
  const best = recommend(sweep(sim))
  const simOf = (stage: string, share: string) =>
    sim[STAGES.findIndex((s) => s.title === stage)][SHARES.findIndex((s) => s.title === share)]
  const same = sameStageCut(simOf)
  return { model, best, same }
}

const args = process.argv.slice(2)
const models = args[0] === 'free' ? await freeModels() : args.length ? args : [EMBED_MODEL]
console.log(`Labelled set: ${SHARES.length} shares, ${STAGES.length} stages, ${FILED.length} filed-stage checks.\n`)
const results = []
for (const model of models) {
  try {
    const r = await measure(model)
    results.push(r)
    const pct = (x: number) => `${Math.round(x * 100)}%`
    console.log(`${model}`)
    console.log(`  cut-offs (≥${pct(MIN_PRECISION)} of shown cards correct, most found): related ${r.best.relatedMin}, with a skill tag ${r.best.relatedWithTagMin}`)
    console.log(`  of the shown cards correct ${pct(r.best.precision)} · of the relevant found ${pct(r.best.recall)} · F1 ${r.best.f1.toFixed(2)}`)
    console.log(
      r.same.cut === null
        ? `  same-stage screen: cannot separate (belongs ≥ ${r.same.keepMin.toFixed(2)}, off-topic up to ${r.same.dropMax.toFixed(2)}) — keep the default`
        : `  same-stage screen: ${r.same.cut} (off-topic ≤ ${r.same.dropMax.toFixed(2)}; ${r.same.keepMin >= 1 ? 'every share that belongs carries a stage tag' : `belongs ≥ ${r.same.keepMin.toFixed(2)}`})`,
    )
    console.log(
      `  .env → OPENROUTER_EMBED_MODEL=${model}  EMBED_RELATED_MIN=${r.best.relatedMin}  ` +
        `EMBED_RELATED_WITH_TAG_MIN=${r.best.relatedWithTagMin}  EMBED_SAME_STAGE_MIN=${r.same.cut ?? 0.2}\n`,
    )
  } catch (e) {
    console.log(`${model}\n  could not measure: ${e instanceof Error ? e.message : e}\n`)
  }
}
if (results.length > 1) {
  // Most relevant cards found while keeping the shown ones right.
  const top = [...results].sort((a, b) => b.best.recall - a.best.recall || b.best.precision - a.best.precision)[0]
  console.log(`Best here: ${top.model} (finds ${Math.round(top.best.recall * 100)}% with ${Math.round(top.best.precision * 100)}% of shown cards correct)`)
}
