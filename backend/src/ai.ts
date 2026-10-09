import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { type ResumeParseResult } from './data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Thrown when parsing fails for a reason the user can act on. */
export class ResumeParseError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// pdf-parse ships an old bundled pdf.js that throws at module-init time when
// loaded under tsx — tsx installs a process-wide require-transform hook (not
// just for top-level imports) that this legacy webpack bundle doesn't survive.
// Running the extraction in a genuine plain `node` child process (no tsx hook
// active there at all) sidesteps this entirely — confirmed working standalone.

// A hung extraction must not be able to pin a request or leak a process:
// pdf.js can spin forever on a malformed or crafted file, in which case `close`
// never fires — the promise would never settle and the child would survive the
// request. Since /api/resume/parse accepts uploads, an unbounded spawn is a
// process-exhaustion lever, so every child gets a hard deadline and a SIGKILL.
// 20s is ~10x the worst real extraction seen in testing (a 12-page PDF).
const PDF_EXTRACT_TIMEOUT_MS = 20_000

function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // The bundled pdf.js writes font warnings ("Warning: TT: undefined
    // function: 32", emitted for many real-world PDFs with embedded TrueType
    // fonts) to STDOUT, not stderr — which would corrupt the JSON we read back.
    // So the child silences stdout while parsing, then restores it to emit only
    // the JSON result.
    const script =
      "const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{" +
      'const w=process.stdout.write.bind(process.stdout);' +
      'process.stdout.write=()=>true;' +
      'const done=o=>{process.stdout.write=w;w(JSON.stringify(o))};' +
      "require('pdf-parse')(Buffer.concat(c))" +
      '.then(r=>done({text:r.text}))' +
      '.catch(e=>done({error:e.message}))})'
    const child = spawn(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'), // backend/ — so require('pdf-parse') resolves via its node_modules
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    // Collect raw chunks and decode once at the end. Concatenating each chunk
    // as a string decodes it in isolation, so a multi-byte character (an
    // accented name, ₹) straddling a pipe-chunk boundary is corrupted into
    // replacement characters — which can also break the JSON.parse below.
    const outChunks: Buffer[] = []
    const errChunks: Buffer[] = []
    // Every exit path runs through settle(), so the deadline is always cleared
    // and neither resolve nor reject can fire twice (a timeout kill emits
    // 'close' right after we have already rejected).
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      fn()
    }
    const deadline = setTimeout(() => {
      // SIGKILL, not SIGTERM: a pdf.js parse stuck in a tight loop never
      // reaches a handler that could act on a polite signal.
      child.kill('SIGKILL')
      settle(() =>
        reject(
          new ResumeParseError(
            422,
            'That PDF took too long to read and was stopped. Please try a simpler PDF, or fill in your details manually.',
          ),
        ),
      )
    }, PDF_EXTRACT_TIMEOUT_MS)

    child.stdout.on('data', (d: Buffer) => outChunks.push(d))
    child.stderr.on('data', (d: Buffer) => errChunks.push(d))
    child.on('error', (err) => settle(() => reject(err)))
    child.stdin.on('error', (err) => settle(() => reject(err))) // e.g. EPIPE if the child dies mid-write
    child.on('close', () =>
      settle(() => {
        const out = Buffer.concat(outChunks).toString('utf8')
        try {
          // Defensive: slice to the JSON object in case anything still leaks to
          // stdout ahead of/after it.
          const start = out.indexOf('{')
          const end = out.lastIndexOf('}')
          const json = start !== -1 && end > start ? out.slice(start, end + 1) : out
          const parsed = JSON.parse(json) as { text?: string; error?: string }
          if (parsed.error) return reject(new Error(parsed.error))
          resolve(parsed.text ?? '')
        } catch {
          const errOut = Buffer.concat(errChunks).toString('utf8')
          reject(new Error(errOut || 'pdf extraction process returned no usable output'))
        }
      }),
    )
    child.stdin.write(buffer)
    child.stdin.end()
  })
}

// ANT_KEY is this app's config name; ANTHROPIC_API_KEY is the standard SDK var.
const apiKey = process.env.ANT_KEY || process.env.ANTHROPIC_API_KEY
const client = apiKey ? new Anthropic({ apiKey }) : null

const openRouterApiKey = process.env.OPENROUTER_API_KEY
// Ask Roo: small/fast model — free chat, works well, no reason to use anything bigger.
const OPENROUTER_ASKROO_MODEL = 'nvidia/nemotron-3.5-lightning:free'
// Resume parsing: needs reliable structured JSON. Unlike Lightning and Ultra
// (neither supports `response_format`, so both needed prompt-and-pray JSON with
// defensive parsing — Lightning echoed prose, Ultra's free endpoint is routinely
// "temporarily overloaded"), Nemotron 3 Super natively supports json_schema
// enforcement, which makes the output structurally guaranteed. It's also far
// faster in testing (~1-2s vs. 30-60s+ on Ultra).
const OPENROUTER_RESUME_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

// Which provider answers Ask Roo and resume parsing.
// 'openrouter' = free NVIDIA Nemotron models via OPENROUTER_API_KEY. The
//   DEFAULT: this is the intended provider for both AI features. Capped at
//   ~50 requests/day on OpenRouter's free tier, and the upstream NVIDIA
//   endpoints are frequently overloaded, hence the retry logic below.
// 'anthropic'  = paid Claude via ANT_KEY. Escape hatch, kept working so a
//   deployment that needs no rate ceiling can set AI_PROVIDER=anthropic.
//
// A server that selects a provider whose key is missing serves no AI at all
// (see aiEnabled) and every call fails with an explicit 503 naming the
// variable — it never falls back to the other provider, and never to canned
// data, because both would misrepresent where an answer came from.
const AI_PROVIDER = process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openrouter'

// Career Guidance can run on its own OpenRouter key and model, set apart from
// Ask Roo and resume parsing. Both are optional and fall back to the shared
// ones. Two reasons this exists:
//   - Quota: the free tier is capped per key per day, so roadmap generation
//     competing with resume parsing means one can exhaust the other.
//   - Reliability: the free NVIDIA endpoints are frequently "temporarily
//     overloaded" (which the retry logic below absorbs, but not always), so
//     being able to point this one feature at a different model without a
//     code change is the difference between a five-second fix and a deploy.
const careerApiKey = process.env.OPENROUTER_CAREER_API_KEY || openRouterApiKey
const OPENROUTER_CAREER_MODEL =
  process.env.OPENROUTER_CAREER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free'

export const aiEnabled = AI_PROVIDER === 'anthropic' ? !!client : !!openRouterApiKey

/** Career Guidance is available when its own key (or the shared one) is set. */
export const careerAiEnabled = AI_PROVIDER === 'anthropic' ? !!client : !!careerApiKey

// Must stay in sync with DOMAINS / EMPLOYMENT_TYPES in frontend/src/types.ts.
// "" means "could not tell from the resume" — the form keeps its own value then.
const DOMAINS = ['Cloud', 'AI/ML', 'Cybersecurity', 'DevOps', 'Data', 'Web Dev', 'Mobile', 'UI/UX', '']
const EMPLOYMENT_TYPES = [
  'Employed',
  'Freelancer',
  'Entrepreneur',
  'Looking for opportunity',
  'Student',
  'Just looking around',
  '',
]
// Must stay in sync with INDUSTRIES in frontend/src/types.ts.
const INDUSTRIES = [
  'IT Services',
  'Product / SaaS',
  'Fintech',
  'E-commerce',
  'Healthcare',
  'EdTech',
  'Consulting',
  'Manufacturing',
  'Telecom',
  'Government / PSU',
  'Media',
  'Other',
  '',
]

// JSON Schema the model must fill — mirrors ResumeParseResult minus `source`.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: "Candidate's full name" },
    email: { type: 'string', description: 'Email address exactly as written, "" if absent' },
    phone: { type: 'string', description: 'Phone number exactly as written, "" if absent' },
    linkedin: { type: 'string', description: 'Full LinkedIn URL, "" if absent' },
    city: { type: 'string', description: 'Current city, "" if absent' },
    headline: { type: 'string', description: 'One-line professional headline, e.g. "Senior Backend Engineer · 6 years experience"' },
    bio: { type: 'string', description: 'A 2-3 sentence first-person professional bio grounded strictly in the resume' },
    batchYear: { type: 'string', description: '4-digit year the candidate finished their most relevant training/degree, "" if unclear' },
    course: { type: 'string', description: 'Name of that course/degree/certification, "" if unclear' },
    experienceYears: { type: 'string', description: 'Total years of professional experience as digits, "" if unclear' },
    domain: { type: 'string', enum: DOMAINS, description: 'Closest expertise domain, "" only if none fits' },
    employmentType: { type: 'string', enum: EMPLOYMENT_TYPES, description: 'Current employment status, "" if unclear. Use "Student" if currently enrolled in further education with no job, "Looking for opportunity" if job-hunting with no current role.' },
    college: { type: 'string', description: 'Name of the college/institution currently being attended, only if employmentType is "Student" — "" otherwise' },
    github: { type: 'string', description: 'Full GitHub profile URL, "" if absent' },
    portfolio: { type: 'string', description: 'Full personal website/portfolio URL, "" if absent' },
    industry: { type: 'string', enum: INDUSTRIES, description: 'Industry of the most recent employer, "" only if none fits' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: 'string' },
          company: { type: 'string' },
          period: { type: 'string', description: 'Like "2022 — Present"' },
          summary: { type: 'string', description: 'One achievement-focused sentence' },
        },
        required: ['role', 'company', 'period', 'summary'],
      },
    },
    education: {
      type: 'array',
      description: 'Every degree/diploma listed, newest first',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          degree: { type: 'string', description: 'Like "B.E. Computer Science"' },
          institution: { type: 'string' },
          year: { type: 'string', description: 'Year of completion, "" if unclear' },
          score: { type: 'string', description: 'CGPA or percentage exactly as written, "" if absent' },
        },
        required: ['degree', 'institution', 'year', 'score'],
      },
    },
    projects: {
      type: 'array',
      description: 'Personal, academic or side projects — not employment',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'One or two sentences on what it does' },
          link: { type: 'string', description: 'Repo or demo URL, "" if absent' },
          tech: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'link', 'tech'],
      },
    },
    certifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          issuer: { type: 'string', description: 'Issuing body, "" if not stated' },
          year: { type: 'string', description: 'Year earned, "" if not stated' },
        },
        required: ['name', 'issuer', 'year'],
      },
    },
    achievements: {
      type: 'array',
      description: 'Awards, honours, competition wins, publications',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          year: { type: 'string', description: 'Year, "" if not stated' },
        },
        required: ['title', 'year'],
      },
    },
    languagesKnown: {
      type: 'array',
      description: 'Spoken/written human languages only — never programming languages',
      items: { type: 'string' },
    },
    interests: {
      type: 'array',
      description:
        'Personal interests or hobbies from any "Interests"/"Hobbies"/"Extracurricular" section — not skills or technologies',
      items: { type: 'string' },
    },
    skills: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'name', 'email', 'phone', 'linkedin', 'city', 'headline', 'bio',
    'batchYear', 'course', 'experienceYears', 'domain', 'employmentType', 'college',
    'github', 'portfolio', 'industry',
    'experience', 'education', 'projects', 'certifications', 'achievements',
    'languagesKnown', 'interests', 'skills',
  ],
}

const PROMPT =
  'Extract this resume into structured data for an alumni-network profile. ' +
  'Work experience is listed newest-first. ' +
  'Use only information present in the document — never invent employers, contact details, or dates. ' +
  'Use "" (or []) for anything the document does not state. ' +
  'For domain, employmentType and industry, pick the closest allowed value based on the overall profile. ' +
  'If currently a student, also fill college with the institution name. ' +
  'Keep employment under `experience` and personal/academic work under `projects` — never the same item in both. ' +
  'languagesKnown means spoken languages (English, Hindi, Kannada…), never programming languages: those belong in skills.'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type UserContent = Anthropic.MessageParam['content']

/** Turn the uploaded file into message content Claude can read. */
async function buildContent(dataBase64: string, mediaType?: string): Promise<UserContent> {
  const clean = dataBase64.replace(/\s/g, '')

  if (mediaType === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: clean } },
      { type: 'text', text: PROMPT },
    ]
  }

  if (mediaType === DOCX_MIME) {
    let text = ''
    try {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(clean, 'base64') })
      text = value.trim()
    } catch {
      throw new ResumeParseError(422, 'Could not read that Word document. Please export it as a PDF and try again.')
    }
    if (!text) {
      throw new ResumeParseError(422, 'That Word document appears to be empty. Please check the file or upload a PDF.')
    }
    return [{ type: 'text', text: `Resume text extracted from the uploaded document:\n\n${text}\n\n---\n\n${PROMPT}` }]
  }

  if (mediaType === 'application/msword') {
    throw new ResumeParseError(415, 'Legacy .doc files are not supported. Please save your resume as PDF or .docx and try again.')
  }

  throw new ResumeParseError(415, 'Unsupported file type. Please upload a PDF or .docx resume.')
}

// ---------------------------------------------------------------------------
// OpenRouter (free, dev-only) — plain fetch, no SDK. OpenAI-compatible REST API.
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** Minimal OpenRouter chat-completions call. Returns the assistant's raw text.
 * `reasoningEnabled` is model-specific: Lightning writes its chain-of-thought
 * straight into `content` unless reasoning is explicitly disabled (garbles
 * Ask Roo's answers) — pass `false` for it. Nemotron 3 Ultra's JSON output
 * only worked in testing with the `reasoning` field omitted entirely (passing
 * an explicit `enabled: true` produced empty responses, not equivalent to
 * omitting it) — pass `undefined` for it. */
/** Marks an error as worth retrying — the free NVIDIA endpoints are frequently
 * "temporarily overloaded", which OpenRouter reports as a transient upstream
 * failure rather than a problem with the request itself. */
class TransientOpenRouterError extends Error {}

/** The provider refused the call because a usage limit was hit. A distinct type
 * rather than a message substring: callers need to map this to 503 (and show
 * the reason verbatim), and matching on wording silently broke the moment the
 * message said "free tier limit" instead of "rate limit". */
export class AiRateLimitError extends Error {}

const isAbort = (err: unknown): boolean => err instanceof Error && err.name === 'AbortError'

// Per-attempt ceiling, and a ceiling on everything spent inside one AI call
// (all retries plus, for resume parsing, the corrective re-ask). Without the
// second one a single upload could occupy a handler for ~6 minutes — 3 attempts
// x 60s, then the same again for the re-ask — far past most proxy timeouts, so
// the client has already given up while the server keeps working.
const OPENROUTER_ATTEMPT_TIMEOUT_MS = 60_000
const OPENROUTER_TOTAL_BUDGET_MS = 75_000

async function callOpenRouterOnce(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  reasoningEnabled: boolean | undefined,
  jsonSchema: object | undefined,
  deadline: number,
  // Defaults to the shared key; Career Guidance may pass its own.
  apiKey: string | undefined = openRouterApiKey,
): Promise<string> {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.')

  const remaining = Math.min(OPENROUTER_ATTEMPT_TIMEOUT_MS, deadline - Date.now())
  if (remaining <= 0) {
    throw new TransientOpenRouterError('Ran out of time waiting for OpenRouter — the free tier is congested.')
  }

  const controller = new AbortController()
  // The abort has to stay armed until the body has been read, not just until
  // the headers arrive: fetch() resolves on headers, so clearing the timeout
  // there leaves a stalled body stream hanging with nothing left to abort it.
  const timeout = setTimeout(() => controller.abort(), remaining)
  try {
    let res: Response
    try {
      const payload: Record<string, unknown> = { model, messages, max_tokens: maxTokens }
      if (reasoningEnabled !== undefined) payload.reasoning = { enabled: reasoningEnabled }
      // Native schema enforcement, when the model supports it — structurally
      // guarantees parseable output instead of relying on the prompt alone.
      if (jsonSchema) {
        payload.response_format = {
          type: 'json_schema',
          json_schema: { name: 'result', strict: true, schema: jsonSchema },
        }
      }
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      if (isAbort(err)) {
        throw new TransientOpenRouterError('OpenRouter took too long to respond — the free tier can be slow or congested.')
      }
      throw new TransientOpenRouterError('Could not reach OpenRouter.')
    }

    if (!res.ok) {
      if (res.status === 401) throw new Error('OpenRouter rejected the API key. Check OPENROUTER_API_KEY.')
      if (res.status === 429) {
        throw new AiRateLimitError(
          "OpenRouter's free tier limit was reached. Please try again later, or set AI_PROVIDER=anthropic to use Claude via ANT_KEY instead.",
        )
      }
      const body = await res.text().catch(() => '')
      if (res.status >= 500) throw new TransientOpenRouterError(`OpenRouter upstream error (${res.status}).`)
      throw new Error(`OpenRouter request failed (${res.status}): ${body.slice(0, 200)}`)
    }

    // OpenRouter reports upstream provider failures as HTTP 200 with an `error`
    // field in the body (e.g. {"message":"Upstream error from Nvidia: Service
    // temporarily overloaded","code":502}) — so a 200 alone does not mean success.
    let data: {
      choices?: { message?: { content?: string } }[]
      error?: { message?: string; code?: number }
    }
    try {
      data = await res.json()
    } catch (err) {
      throw new TransientOpenRouterError(
        isAbort(err)
          ? 'OpenRouter stopped sending its reply partway through — the free tier can be slow or congested.'
          : 'OpenRouter returned a malformed response body.',
      )
    }
    if (data.error) {
      const message = data.error.message ?? 'Unknown OpenRouter error'
      const code = data.error.code ?? 0
      if (code >= 500 || /overloaded|timeout|temporarily/i.test(message)) {
        throw new TransientOpenRouterError(message)
      }
      throw new Error(`OpenRouter error: ${message}`)
    }

    const text = data.choices?.[0]?.message?.content
    if (!text) throw new TransientOpenRouterError('OpenRouter returned an empty response.')
    return text
  } finally {
    clearTimeout(timeout)
  }
}

/** Calls OpenRouter, retrying a couple of times when the free upstream endpoint
 * reports a transient failure (very common on the free NVIDIA tier). */
async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  reasoningEnabled: boolean | undefined,
  jsonSchema?: object,
  // Shared wall-clock budget. Callers that make more than one request (see
  // callOpenRouterJson) pass the same deadline to every one of them, so the
  // whole operation stays inside a single bound instead of multiplying.
  deadline: number = Date.now() + OPENROUTER_TOTAL_BUDGET_MS,
  apiKey: string | undefined = openRouterApiKey,
): Promise<string> {
  const MAX_ATTEMPTS = 3
  let lastTransient: Error | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadline) break
    try {
      return await callOpenRouterOnce(model, messages, maxTokens, reasoningEnabled, jsonSchema, deadline, apiKey)
    } catch (err) {
      if (!(err instanceof TransientOpenRouterError)) throw err
      lastTransient = err
      console.warn(`OpenRouter attempt ${attempt}/${MAX_ATTEMPTS} failed (transient): ${err.message}`)
      const backoff = 2000 * attempt
      // Don't sleep into (or past) the deadline — that burns the remaining
      // budget on waiting and leaves nothing for the retry itself.
      if (attempt < MAX_ATTEMPTS && Date.now() + backoff < deadline) {
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  }
  throw new Error(
    `${lastTransient?.message ?? 'OpenRouter request failed.'} The free tier is busy — please try again in a moment, or set AI_PROVIDER=anthropic to use Claude via ANT_KEY.`,
  )
}

/** Extracts the JSON object from a free-form model response, defensively:
 * strips a ```json ... ``` fence if present, then — since a small free model
 * may still wrap the object in a sentence or two despite instructions —
 * slices from the first `{` to the matching last `}` rather than requiring
 * the entire response to be nothing but JSON. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  const end = body.lastIndexOf('}')
  if (end === -1) return body
  // Try each '{' as a start position until one parses. A plain first-brace slice
  // isn't enough: some models emit a stray leading brace or a line of prose
  // before the real object (Nemotron 3 Super reliably prefixes an extra "{"),
  // which would make the whole slice unparseable.
  for (let i = body.indexOf('{'); i !== -1 && i < end; i = body.indexOf('{', i + 1)) {
    const candidate = body.slice(i, end + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // not a valid object starting here — try the next brace
    }
  }
  return body
}

/** Calls OpenRouter and parses the response as JSON, defensively — the free
 * model has no enforced schema, so retry once with a corrective follow-up
 * before giving up. Throws if still invalid after the retry. */
async function callOpenRouterJson(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonSchema?: object,
  reasoningEnabled?: boolean,
  apiKey: string | undefined = openRouterApiKey,
): Promise<unknown> {
  // One budget for the first call and the corrective re-ask together.
  const deadline = Date.now() + OPENROUTER_TOTAL_BUDGET_MS
  const first = await callOpenRouter(model, messages, maxTokens, reasoningEnabled, jsonSchema, deadline, apiKey)
  try {
    return JSON.parse(extractJsonObject(first))
  } catch {
    // Only reachable when the model has no real schema enforcement; kept as a
    // safety net for models where response_format is advisory.
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: 'Your entire reply must be ONLY the JSON object — starting with { and ending with }. No words before or after it, no markdown, no code fence. Output the JSON object now.',
      },
    ]
    const second = await callOpenRouter(model, retryMessages, maxTokens, reasoningEnabled, jsonSchema, deadline, apiKey)
    return JSON.parse(extractJsonObject(second)) // still invalid → let it throw, caller maps to a clean error
  }
}

// A concrete filled-in example (rather than a formal JSON Schema definition)
// — smaller free models follow a shown example far more reliably than an
// abstract schema, and putting it AFTER the resume text (closest to where
// generation starts) keeps the instruction from getting "lost" in a long
// prompt.
const OPENROUTER_RESUME_EXAMPLE = JSON.stringify(
  {
    name: 'Full Name',
    email: 'name@example.com (or "" if not stated)',
    phone: '+91 98765 43210 (or "")',
    linkedin: 'https://linkedin.com/in/... (or "")',
    city: 'City (or "")',
    headline: 'One-line professional headline',
    bio: '2-3 sentence first-person professional bio grounded in the resume',
    batchYear: '4-digit year, e.g. "2018" (or "")',
    course: 'Degree/course name (or "")',
    experienceYears: 'Total years as digits, e.g. "6" (or "")',
    domain: `one of: ${DOMAINS.filter(Boolean).join(', ')} (or "")`,
    employmentType: `one of: ${EMPLOYMENT_TYPES.filter(Boolean).join(', ')} (or "")`,
    college: 'Institution name if currently a Student, else ""',
    experience: [{ role: 'Job title', company: 'Company name', period: '2022 — Present', summary: 'One achievement-focused sentence' }],
    skills: ['skill one', 'skill two'],
  },
  null,
  2,
)

function buildOpenRouterResumePrompt(resumeText: string): string {
  return (
    `Resume text:\n\n${resumeText}\n\n---\n\n${PROMPT}\n\n` +
    `Fill in real values from the resume above into exactly this JSON shape:\n${OPENROUTER_RESUME_EXAMPLE}\n\n` +
    'Your entire response must be ONLY that JSON object — starting with { and ending with }. No markdown, no code fence, no explanation, no text before or after it.'
  )
}

/** Extracts plain text from the uploaded resume — used by the OpenRouter path,
 * which (unlike Claude) has no confirmed native PDF/document understanding. */
async function extractResumeText(dataBase64: string, mediaType?: string): Promise<string> {
  const clean = dataBase64.replace(/\s/g, '')
  const buffer = Buffer.from(clean, 'base64')

  if (mediaType === 'application/pdf') {
    try {
      const text = await extractPdfText(buffer)
      const trimmed = text.trim()
      if (!trimmed) {
        throw new ResumeParseError(422, 'Could not read text from that PDF — it may be a scanned image. Please fill in your details manually.')
      }
      return trimmed
    } catch (err) {
      if (err instanceof ResumeParseError) throw err
      console.error('extractResumeText (PDF) failed:', err instanceof Error ? err.stack ?? err.message : err)
      throw new ResumeParseError(422, 'Could not read that PDF. Please check the file or fill in your details manually.')
    }
  }

  if (mediaType === DOCX_MIME) {
    let text = ''
    try {
      const { value } = await mammoth.extractRawText({ buffer })
      text = value.trim()
    } catch {
      throw new ResumeParseError(422, 'Could not read that Word document. Please export it as a PDF and try again.')
    }
    if (!text) {
      throw new ResumeParseError(422, 'That Word document appears to be empty. Please check the file or upload a PDF.')
    }
    return text
  }

  if (mediaType === 'application/msword') {
    throw new ResumeParseError(415, 'Legacy .doc files are not supported. Please save your resume as PDF or .docx and try again.')
  }

  throw new ResumeParseError(415, 'Unsupported file type. Please upload a PDF or .docx resume.')
}

async function parseResumeOpenRouter(dataBase64: string, mediaType?: string): Promise<ResumeParseResult> {
  const text = await extractResumeText(dataBase64, mediaType)
  const messages: ChatMessage[] = [{ role: 'user', content: buildOpenRouterResumePrompt(text) }]

  let parsed: unknown
  try {
    // reasoning disabled: with it on, this model spent ~1,000-1,900 of its token
    // budget on internal reasoning and got truncated mid-JSON (finish_reason
    // "length"), which is what produced the malformed/garbled output. Off, it
    // completes far faster and extracts more accurately.
    // 8192: the schema now covers experience, education, projects,
    // certifications and achievements, so a dense multi-page resume can
    // legitimately need ~2,500 tokens where the old 15-field schema needed
    // ~650. Truncation here is the exact failure mode that produced garbled
    // output before, so the ceiling stays several times the realistic need.
    parsed = await callOpenRouterJson(OPENROUTER_RESUME_MODEL, messages, 8192, SCHEMA, false)
  } catch (err) {
    console.error('Resume parse (OpenRouter) failed:', err instanceof Error ? err.message : err)
    // Usage limits are actionable, so pass the reason through verbatim.
    if (err instanceof AiRateLimitError) throw new ResumeParseError(503, err.message)
    throw new ResumeParseError(502, 'Resume parsing failed. Please try again, or fill in your details manually.')
  }

  return validateParsedResume(parsed)
}

/**
 * An entry survives only if every field the frontend reads is really a string.
 * Built as a factory because the profile now stores five of these arrays and
 * each one is indexed directly by the editors and the profile page.
 */
function entryFilter<T>(keys: readonly string[], listKeys: readonly string[] = []) {
  return (v: unknown): v is T => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return (
      keys.every((k) => typeof o[k] === 'string') &&
      listKeys.every((k) => Array.isArray(o[k]) && o[k].every((s: unknown) => typeof s === 'string'))
    )
  }
}

const isExperienceEntry = entryFilter<ResumeParseResult['experience'][number]>([
  'role', 'company', 'period', 'summary',
])
const isEducationEntry = entryFilter<ResumeParseResult['education'][number]>([
  'degree', 'institution', 'year', 'score',
])
const isProjectEntry = entryFilter<ResumeParseResult['projects'][number]>(
  ['title', 'description', 'link'],
  ['tech'],
)
const isCertificationEntry = entryFilter<ResumeParseResult['certifications'][number]>([
  'name', 'issuer', 'year',
])
const isAchievementEntry = entryFilter<ResumeParseResult['achievements'][number]>(['title', 'year'])

/**
 * Never trust the free model's JSON blindly, and never hand a partial object to
 * the caller. The onboarding form indexes `experience[0]` and calls
 * `skills.length` / `skills.join()` directly, so a reply of `{"name":"Jane"}` —
 * which a free model with advisory schema adherence can absolutely return —
 * would pass a name-only check and then throw a TypeError in the browser,
 * killing the upload flow instead of showing a "fill it in manually" error.
 *
 * Every field is therefore checked and rebuilt rather than spread through:
 * missing strings become "", malformed experience entries are dropped, and a
 * reply missing `name`, `experience` or `skills` outright is rejected.
 */
function validateParsedResume(parsed: unknown): ResumeParseResult {
  const reject = () => {
    throw new ResumeParseError(
      502,
      'The AI returned an unexpected response. Please try again or fill in your details manually.',
    )
  }
  if (typeof parsed !== 'object' || parsed === null) reject()
  const raw = parsed as Record<string, unknown>
  if (typeof raw.name !== 'string' || !Array.isArray(raw.experience) || !Array.isArray(raw.skills)) reject()

  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  // A missing optional array is fine (treated as empty); a malformed one is
  // never passed through, because the editors index into these directly.
  const list = <T>(v: unknown, keep: (x: unknown) => x is T): T[] =>
    Array.isArray(v) ? v.filter(keep) : []
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

  return {
    name: str(raw.name),
    email: str(raw.email),
    phone: str(raw.phone),
    linkedin: str(raw.linkedin),
    city: str(raw.city),
    headline: str(raw.headline),
    bio: str(raw.bio),
    batchYear: str(raw.batchYear),
    course: str(raw.course),
    experienceYears: str(raw.experienceYears),
    domain: str(raw.domain),
    employmentType: str(raw.employmentType),
    college: str(raw.college),
    github: str(raw.github),
    portfolio: str(raw.portfolio),
    industry: str(raw.industry),
    experience: list(raw.experience, isExperienceEntry),
    education: list(raw.education, isEducationEntry),
    projects: list(raw.projects, isProjectEntry),
    certifications: list(raw.certifications, isCertificationEntry),
    achievements: list(raw.achievements, isAchievementEntry),
    languagesKnown: strings(raw.languagesKnown),
    interests: strings(raw.interests),
    skills: strings(raw.skills),
    source: 'ai',
  }
}

/**
 * Parse a resume — real extraction for PDF and DOCX via whichever provider is
 * configured (see AI_PROVIDER above).
 *
 * There is no demo mode. An unconfigured server fails loudly instead of
 * returning the sample profile: the caller merges whatever comes back straight
 * into the onboarding form, so canned data would land in a real member's
 * profile as if it had been read off their resume.
 */
export async function parseResume(
  dataBase64?: string,
  mediaType?: string,
): Promise<ResumeParseResult> {
  if (!aiEnabled) {
    throw new ResumeParseError(
      503,
      AI_PROVIDER === 'openrouter'
        ? 'Resume parsing is not configured on this server (OPENROUTER_API_KEY missing). Please fill in your details manually.'
        : 'Resume parsing is not configured on this server (ANT_KEY missing). Please fill in your details manually.',
    )
  }

  if (!dataBase64) {
    throw new ResumeParseError(400, 'No file received — please re-upload your resume.')
  }

  if (AI_PROVIDER === 'openrouter') {
    return parseResumeOpenRouter(dataBase64, mediaType)
  }

  // aiEnabled already guarantees a client on the anthropic path; this keeps the
  // narrowing explicit rather than asserting non-null.
  if (!client) {
    throw new ResumeParseError(503, 'Resume parsing is not configured on this server (ANT_KEY missing).')
  }

  const content = await buildContent(dataBase64, mediaType)

  try {
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    } as Anthropic.MessageCreateParamsNonStreaming)

    if (res.stop_reason === 'refusal') {
      throw new ResumeParseError(422, 'The AI declined to process this document. Please fill in your details manually.')
    }
    if (res.stop_reason === 'max_tokens') {
      throw new ResumeParseError(422, 'This resume is too long to parse. Please upload a shorter version.')
    }

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
    if (!text) {
      throw new ResumeParseError(502, 'The AI returned an empty response. Please try again.')
    }
    // Schema-enforced here, so this should always pass — validated anyway so
    // both providers are guaranteed to return the same complete shape.
    return validateParsedResume(JSON.parse(text))
  } catch (err) {
    if (err instanceof ResumeParseError) throw err
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Resume parse: ANT_KEY rejected by the API')
      throw new ResumeParseError(502, 'The AI service rejected the server API key. Contact the administrator.')
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ResumeParseError(503, 'The AI service is busy right now. Please try again in a minute.')
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ResumeParseError(502, 'Could not reach the AI service. Please try again.')
    }
    console.error('Resume parse failed:', err instanceof Error ? err.message : err)
    throw new ResumeParseError(502, 'Resume parsing failed. Please try again, or fill in your details manually.')
  }
}

// ---------------------------------------------------------------------------
// Career Guidance: roadmap generation.
//
// Reuses OPENROUTER_RESUME_MODEL (Nemotron 3 Super) rather than introducing a
// new model — it's the one model in this codebase already proven to fill a
// strict JSON schema reliably (see the comment on OPENROUTER_RESUME_MODEL
// above). If quality needs improving later, that's a model swap here, not a
// new integration.
//
// What the backend sends is a small, pre-filtered packet (assessment answers
// + already-retrieved candidate alumni/services/paths — see careerRoadmap.ts),
// never a database dump. Claude/Nemotron only sequences stages and picks
// which of the GIVEN candidate ids are relevant to each stage; it cannot
// introduce an id that wasn't in the packet it was handed. The caller
// (careerRoadmap.ts) is responsible for stripping any id that slips through
// anyway that isn't in the candidate set — this function only guarantees the
// *shape* is well-formed, not that every id is real.
// ---------------------------------------------------------------------------

export interface CareerRoadmapContext {
  assessment: {
    currentSituation: string
    goalType: string
    targetRole: string | null
    hoursPerWeek: number
    timelineMonths: number
    learningPreferences: string[]
    helpTypesWanted: string[]
    freeText: string
  }
  userSkills: { expertise: string[]; recentRoles: string[]; certifications: string[] }
  candidatePaths: { fromRole: string; toRole: string; alumniCount: number }[]
  /** Whole routes real alumni walked from the member's current role to their
   *  target, oldest role first. Empty when nobody has walked it. */
  walkedRoutes: string[][]
  candidateAlumni: { id: string; currentRole: string; topSkills: string[] }[]
  candidateServices: { id: string; type: string; tags: string[] }[]
}

export interface CareerRoadmapStageResult {
  stepKey: string
  title: string
  status: 'completed' | 'in_progress' | 'upcoming'
  durationWeeks: number | null
  relevantAlumniIds: string[]
  relevantServiceIds: string[]
}

export interface CareerRoadmapResult {
  stages: CareerRoadmapStageResult[]
}

const ROADMAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stages: {
      type: 'array',
      description: 'Ordered roadmap stages, current role first, target role last.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stepKey: { type: 'string', description: 'Short unique slug, e.g. "step-2".' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['completed', 'in_progress', 'upcoming'] },
          durationWeeks: { type: ['integer', 'null'], description: 'Null for the current/target bookend stages.' },
          relevantAlumniIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only ids copied from the candidateAlumni list given below — never invent one.',
          },
          relevantServiceIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only ids copied from the candidateServices list given below — never invent one.',
          },
        },
        required: ['stepKey', 'title', 'status', 'durationWeeks', 'relevantAlumniIds', 'relevantServiceIds'],
      },
    },
  },
  required: ['stages'],
}

const ROADMAP_SYSTEM =
  'You build a personalized career roadmap for a Rooman Technologies alumni-network member. ' +
  'Use ONLY the information given below — never invent people, services, employers or facts not present. ' +
  'The first stage is always their current situation (status "completed" or "in_progress", durationWeeks null); ' +
  'the last stage is always their target role (durationWeeks null). Between them, break the gap between their ' +
  'current skills and target role into realistic, ordered stages whose durationWeeks roughly sum to the given ' +
  'timelineMonths at the given hoursPerWeek pace. For each middle stage, list only the ids of candidateAlumni ' +
  'and candidateServices (given below) that are genuinely relevant to that specific stage — an empty list is ' +
  'fine and better than a forced, irrelevant match. If targetRole is null (member is unsure), build an ' +
  'exploration-oriented roadmap (self-assessment, alumni conversations, trial projects) instead of a skill-gap one.'

function buildRoadmapPrompt(context: CareerRoadmapContext): string {
  return `Member's assessment and retrieved context (JSON):\n${JSON.stringify(context, null, 2)}\n\nReturn the roadmap JSON now.`
}

/** Structural validation only — every id really existing in the candidate
 * lists is checked by the caller, which is the one that knows those lists. */
function validateRoadmapResult(parsed: unknown): CareerRoadmapResult {
  const reject = (): never => {
    throw new Error('The AI returned an unexpected roadmap shape.')
  }
  if (typeof parsed !== 'object' || parsed === null) reject()
  const raw = parsed as Record<string, unknown>
  if (!Array.isArray(raw.stages)) reject()

  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
  const stages: CareerRoadmapStageResult[] = (raw.stages as unknown[])
    .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {}))
    .filter((s) => typeof s.stepKey === 'string' && typeof s.title === 'string')
    .map((s) => ({
      stepKey: String(s.stepKey),
      title: String(s.title),
      status: s.status === 'completed' || s.status === 'in_progress' ? s.status : 'upcoming',
      durationWeeks: typeof s.durationWeeks === 'number' ? s.durationWeeks : null,
      relevantAlumniIds: strings(s.relevantAlumniIds),
      relevantServiceIds: strings(s.relevantServiceIds),
    }))
  if (stages.length === 0) reject()
  return { stages: pinStartMarker(stages) }
}

/** The timeline labels the first stage "Current" purely by position, but the
 * model has been seen to drop its "current situation" marker mid-plan, which
 * then shows as a step with a Reopen button while a real stage is labelled
 * "Current". The prompt's own rule is that the marker has no duration, so a
 * duration-less stage between real ones is moved back to the front. */
function pinStartMarker(stages: CareerRoadmapStageResult[]): CareerRoadmapStageResult[] {
  if (stages.length < 3 || stages[0].durationWeeks === null) return stages
  const stray = stages.findIndex((s, i) => i > 0 && i < stages.length - 1 && s.durationWeeks === null)
  if (stray === -1) return stages
  return [stages[stray], ...stages.filter((_, i) => i !== stray)]
}

/** Generate a career roadmap from a pre-built context packet. Throws the same
 * way parseResume/askRoo do (no silent fallback to canned data) — a member
 * seeing a wrong roadmap is worse than seeing an explicit "try again" error. */
export async function generateCareerRoadmap(context: CareerRoadmapContext): Promise<CareerRoadmapResult> {
  if (!careerAiEnabled) {
    throw new Error(
      AI_PROVIDER === 'openrouter'
        ? 'Career Guidance is not configured on this server (OPENROUTER_API_KEY missing).'
        : 'Career Guidance is not configured on this server (ANT_KEY missing).',
    )
  }

  const prompt = buildRoadmapPrompt(context)

  if (AI_PROVIDER === 'openrouter') {
    const messages: ChatMessage[] = [
      { role: 'system', content: ROADMAP_SYSTEM },
      { role: 'user', content: prompt },
    ]
    const parsed = await callOpenRouterJson(
      OPENROUTER_CAREER_MODEL, messages, 4096, ROADMAP_SCHEMA, false, careerApiKey,
    )
    return validateRoadmapResult(parsed)
  }

  if (!client) {
    throw new Error('Career Guidance is not configured on this server (ANT_KEY missing).')
  }
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: ROADMAP_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: ROADMAP_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  } as Anthropic.MessageCreateParamsNonStreaming)
  if (res.stop_reason === 'refusal') {
    throw new Error('The AI declined to build a roadmap for this assessment.')
  }
  // Without this a truncated reply fell through to JSON.parse and surfaced a
  // raw SyntaxError as the 502 body, which tells the member nothing.
  if (res.stop_reason === 'max_tokens') {
    throw new Error('The roadmap came back truncated. Please try again.')
  }
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) throw new Error('The AI returned an empty roadmap response.')
  return validateRoadmapResult(JSON.parse(text))
}

// ---------------------------------------------------------------------------
// Mentee briefing: what a mentor should read before meeting a student.
//
// Built from the same retrieval discipline as the roadmap — the backend
// gathers the student's profile, plan and history, and the model turns it
// into something a mentor can act on in the five minutes before a call.
// It never invents facts about the student; everything it says has to come
// from the packet it is given.
// ---------------------------------------------------------------------------

export interface MenteeBriefContext {
  name: string
  currentRole: string
  company: string
  experienceYears: number
  skills: string[]
  goal: { currentRole: string; targetRole: string | null }
  timelineMonths: number
  hoursPerWeek: number
  stages: { title: string; status: string; durationWeeks: number | null }[]
  askedFor: string[]
  ownWords: string
  sessionsTogether: number
  pastTopics: string[]
}

export interface MenteeBrief {
  summary: string
  strengths: string[]
  gaps: string[]
  focusThisSession: string[]
  questionsToAsk: string[]
  watchOuts: string[]
}

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: '2-3 sentences on where this student is and what they are trying to do.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'What they already have going for them.' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'What stands between them and the target role.' },
    focusThisSession: { type: 'array', items: { type: 'string' }, description: 'Concrete things worth covering in the next session.' },
    questionsToAsk: { type: 'array', items: { type: 'string' }, description: 'Questions that would tell the mentor the most.' },
    watchOuts: { type: 'array', items: { type: 'string' }, description: 'Risks in their plan — pace, scope, unrealistic timelines.' },
  },
  required: ['summary', 'strengths', 'gaps', 'focusThisSession', 'questionsToAsk', 'watchOuts'],
}

const BRIEF_SYSTEM =
  'You brief a mentor before they meet a student in the Rooman alumni network. ' +
  'Use ONLY the information given — never invent employers, skills, achievements or facts about the student. ' +
  'Be specific and practical: a mentor should be able to open the session knowing what to ask and what to cover. ' +
  'Keep each list to 2-4 short items. Where the plan looks unrealistic for the hours available, say so plainly ' +
  'in watchOuts rather than being encouraging about it.'

/** Generate the mentor's briefing. Throws like the other AI calls rather than
 *  returning a placeholder — a made-up briefing about a real student is worse
 *  than none. */
export async function generateMenteeBrief(context: MenteeBriefContext): Promise<MenteeBrief> {
  if (!careerAiEnabled) {
    throw new Error('AI briefings are not configured on this server.')
  }
  const prompt = `Student context (JSON):\n${JSON.stringify(context, null, 2)}\n\nReturn the briefing JSON now.`

  if (AI_PROVIDER === 'openrouter') {
    const messages: ChatMessage[] = [
      { role: 'system', content: BRIEF_SYSTEM },
      { role: 'user', content: prompt },
    ]
    const parsed = await callOpenRouterJson(
      OPENROUTER_CAREER_MODEL, messages, 2048, BRIEF_SCHEMA, false, careerApiKey,
    )
    return validateBrief(parsed)
  }

  if (!client) throw new Error('AI briefings are not configured on this server (ANT_KEY missing).')
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: BRIEF_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  } as Anthropic.MessageCreateParamsNonStreaming)
  if (res.stop_reason === 'refusal') throw new Error('The AI declined to write this briefing.')
  if (res.stop_reason === 'max_tokens') throw new Error('The briefing came back truncated. Please try again.')
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) throw new Error('The AI returned an empty briefing.')
  return validateBrief(JSON.parse(text))
}

function validateBrief(parsed: unknown): MenteeBrief {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('The AI returned an unexpected briefing shape.')
  const raw = parsed as Record<string, unknown>
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 6) : []
  const summary = typeof raw.summary === 'string' ? raw.summary : ''
  if (!summary) throw new Error('The AI returned a briefing with no summary.')
  return {
    summary,
    strengths: list(raw.strengths),
    gaps: list(raw.gaps),
    focusThisSession: list(raw.focusThisSession),
    questionsToAsk: list(raw.questionsToAsk),
    watchOuts: list(raw.watchOuts),
  }
}

const ROO_SYSTEM =
  'You are Roo, the friendly assistant inside Root Connect — the Rooman Technologies alumni network. ' +
  'Answer questions using ONLY the network data snapshot provided below. Never invent people, jobs, ' +
  'events or numbers. Be brief (2-4 sentences), warm and practical. When it helps, tell the user ' +
  'where to click: the Jobs page for openings, Mentorship for booking sessions, Events for RSVPs, ' +
  'My Network to connect, or a person’s profile. If the data does not contain the answer, say so ' +
  'plainly and suggest the closest thing it does contain.'

export interface RooTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Ask the configured AI provider a question grounded in a snapshot of the
 * network's data (see AI_PROVIDER above). */
export async function askRoo(question: string, history: RooTurn[], context: string): Promise<string> {
  const systemWithContext = `${ROO_SYSTEM}\n\n=== NETWORK DATA SNAPSHOT ===\n${context}`

  if (AI_PROVIDER === 'openrouter') {
    if (!openRouterApiKey) {
      throw new Error('AI is not configured on this server (OPENROUTER_API_KEY missing).')
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: systemWithContext },
      ...history.slice(-6).map((h): ChatMessage => ({ role: h.role, content: h.content })),
      { role: 'user', content: question },
    ]
    // Reasoning OFF — Lightning writes its chain-of-thought straight into
    // `content` otherwise, garbling the visible answer (confirmed in testing).
    return callOpenRouter(OPENROUTER_ASKROO_MODEL, messages, 1024, false)
  }

  if (!client) {
    throw new Error('AI is not configured on this server (ANT_KEY missing).')
  }
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemWithContext,
    messages: [...history.slice(-6), { role: 'user', content: question }],
  } as Anthropic.MessageCreateParamsNonStreaming)
  if (res.stop_reason === 'refusal') {
    return "Sorry — I can't help with that one."
  }
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return text || 'Sorry — I came up empty. Try rephrasing?'
}
