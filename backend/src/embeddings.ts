/**
 * Text → embedding (a list of numbers that captures meaning), via OpenRouter.
 *
 * Used only by background work (learningEmbed.ts) and the calibration script,
 * never on a page request: a share or a stage is embedded once, stored, and
 * every later match is a database lookup.
 *
 * SWITCHING MODELS is a setting, not a code change:
 *   OPENROUTER_EMBED_MODEL=openai/text-embedding-3-small   (any OpenRouter id)
 *   OPENROUTER_EMBED_API_KEY=…                              (optional own key)
 * then `npm run learning:calibrate` measures the new model on a labelled set
 * and prints the three EMBED_* cut-offs to put in .env. On the next start the
 * worker re-embeds everything with the new model on its own — rows record
 * which model embedded them, because two models' numbers are not comparable.
 */

const apiKey = process.env.OPENROUTER_EMBED_API_KEY || process.env.OPENROUTER_API_KEY

/** Matches halfvec(1024) in schema.sql. A model that returns more numbers is
 *  asked for 1024 when it supports that (`dimensions`), else cut to its first
 *  1024 — measured to rank the same as the full list for the default model. */
export const EMBED_DIMS = 1024

/**
 * What differs between embedding models, kept in one place.
 *
 * The cut-offs are cosine similarities (1 = same meaning, ~0 = unrelated) and
 * every model spreads them differently, so each model carries its own — set
 * by `npm run learning:calibrate`, never guessed.
 */
export interface EmbedProfile {
  /** Related on meaning alone. */
  relatedMin: number
  /** Related when the share also carries one of the stage's skill tags. */
  relatedWithTagMin: number
  /** Filed under this very stage: only screens out an unrelated link. */
  sameStageMin: number
  /** Send `dimensions: EMBED_DIMS` (models that shorten their own output). */
  sendDimensions?: boolean
  /** Text put before a stage (the "question") / a share (the "document"),
   *  for models trained to expect it. */
  queryPrefix?: string
  docPrefix?: string
}

/** Measured profiles. Add a line here (from `npm run learning:calibrate`) when
 *  a model is adopted for good; until then the EMBED_* env values apply. */
const PROFILES: Record<string, EmbedProfile> = {
  // Measured on the labelled set (learningCalibration.ts: 44 shares, 14
  // stages), tuned so ≥80% of the cards shown are right:
  //   Nemotron 3 Embed 1B   82% right, finds 58%   ← best free, the default
  //   Liquid LFM2.5 350M    82% right, finds 53%
  //   Nemotron Embed VL 1B  83% right, finds 51%
  'nvidia/nemotron-3-embed-1b:free': { relatedMin: 0.25, relatedWithTagMin: 0.05, sameStageMin: 0.2 },
  'liquid/lfm-2.5-embedding-350m:free': { relatedMin: 0.27, relatedWithTagMin: 0.07, sameStageMin: 0.2 },
  'nvidia/llama-nemotron-embed-vl-1b-v2:free': { relatedMin: 0.27, relatedWithTagMin: 0.07, sameStageMin: 0.15 },
}

/** For a model with no measured profile yet: OpenAI-family models shorten
 *  their own output; everything else is cut. Cut-offs are a cautious middle
 *  until calibrated. */
export function profileFor(model: string): EmbedProfile {
  const known = PROFILES[model]
  const base: EmbedProfile = known ?? {
    relatedMin: 0.3,
    relatedWithTagMin: 0.2,
    sameStageMin: 0.2,
    sendDimensions: model.startsWith('openai/'),
  }
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v)
    return v !== undefined && v !== '' && Number.isFinite(n) && n > -1 && n < 1 ? n : fallback
  }
  return {
    ...base,
    relatedMin: num(process.env.EMBED_RELATED_MIN, base.relatedMin),
    relatedWithTagMin: num(process.env.EMBED_RELATED_WITH_TAG_MIN, base.relatedWithTagMin),
    sameStageMin: num(process.env.EMBED_SAME_STAGE_MIN, base.sameStageMin),
  }
}

// NVIDIA Nemotron 3 Embed 1B, free tier — the best-matching free model on
// OpenRouter when measured (learningCalibration.ts).
export const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'nvidia/nemotron-3-embed-1b:free'
export const EMBED_PROFILE = profileFor(EMBED_MODEL)
export const embeddingsEnabled = !!apiKey

/** Rate-limited or out of quota: wait before the next batch. */
export class EmbedRateLimitError extends Error {}

const TIMEOUT_MS = 30_000

/**
 * Embeds a batch of texts in ONE call, returned in input order. `role` says
 * whether they are stages (query) or shares (document), for models that want
 * a prefix. `model` defaults to the configured one; calibration passes others.
 */
export async function embedTexts(
  texts: string[],
  role: 'query' | 'document',
  model: string = EMBED_MODEL,
): Promise<number[][]> {
  if (!apiKey) throw new Error('No OpenRouter key configured for embeddings.')
  if (!texts.length) return []
  const profile = model === EMBED_MODEL ? EMBED_PROFILE : profileFor(model)
  const prefix = (role === 'query' ? profile.queryPrefix : profile.docPrefix) ?? ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: texts.map((t) => prefix + t),
        ...(profile.sendDimensions ? { dimensions: EMBED_DIMS } : {}),
      }),
      signal: controller.signal,
    })
    const body = (await res.json().catch(() => null)) as {
      data?: { index?: number; embedding?: unknown }[]
      error?: { message?: string }
    } | null
    if (res.status === 429 || res.status === 402) {
      throw new EmbedRateLimitError(body?.error?.message ?? `OpenRouter ${res.status}`)
    }
    if (!res.ok || !Array.isArray(body?.data)) {
      throw new Error(`Embedding call failed (${res.status}): ${body?.error?.message ?? 'no data'}`)
    }
    const out: number[][] = new Array(texts.length)
    body.data.forEach((d, i) => {
      const v = d.embedding
      if (!Array.isArray(v) || v.length < EMBED_DIMS || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        throw new Error(`Embedding ${i} is not a list of at least ${EMBED_DIMS} numbers`)
      }
      const at = typeof d.index === 'number' ? d.index : i
      if (!Number.isInteger(at) || at < 0 || at >= texts.length) throw new Error(`Embedding index ${at} is out of range`)
      out[at] = (v as number[]).slice(0, EMBED_DIMS)
    })
    // A plain loop, not .some(): .some() skips the empty slots of new Array(n),
    // so a missing item would pass and be stored as a NULL embedding.
    for (let i = 0; i < texts.length; i++) {
      if (!out[i]) throw new Error('Embedding response is missing items')
    }
    return out
  } finally {
    clearTimeout(timeout)
  }
}

/** pgvector's text form, "[0.1,0.2,…]" — what a halfvec parameter accepts. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
