/**
 * The labelled set behind Learning Resources' matching cut-offs, and the
 * scoring that turns a model's similarities into the best ones. Pure — no
 * network, no database; calibrateEmbeddings.ts runs it against a real model.
 *
 * Each share belongs to one subject; each stage says which subjects truly
 * help it. A share "should show" on a stage when its subject is wanted. The
 * stage titles are worded the way generated roadmaps word them — vague verbs,
 * role in front — because that is what the model has to read in production.
 */
import { normalizeTag, shareEmbedText, stageMatchTerms, stageRoleTags, topicEmbedText } from './learning.js'

/** `also`: other subjects the share truly helps with (Pandas is ML groundwork). */
export interface LabelledShare { subject: string; also?: string[]; title: string; why: string; skills: string[] }
export interface LabelledStage { role: string; title: string; wants: string[] }
/** A share filed under a stage by its sharer: should it survive the
 *  same-stage screen? (The DEMO case: a web link filed under an AWS stage.) */
export interface FiledCase { stage: string; share: string; belongs: boolean }

export const SHARES: LabelledShare[] = [
  { subject: 'cloud', title: 'Amazon VPC User Guide', why: 'Finally understood subnets, route tables and security groups.', skills: ['AWS', 'Networking'] },
  { subject: 'cloud', title: 'AWS Well-Architected Framework', why: 'Gave me the five pillars to review any design against.', skills: ['AWS', 'System Design'] },
  { subject: 'cloud', title: 'Terraform: Get Started on AWS', why: 'Infrastructure as code was the jump from clicking to engineering.', skills: ['Terraform'] },
  { subject: 'cloud', title: 'AZ-900 Azure Fundamentals path', why: 'Cloud concepts, pricing and core services explained without jargon.', skills: ['Azure'] },
  { subject: 'cloud', title: 'IAM roles explained', why: 'How roles and policies let EC2 reach S3 without hard-coded keys.', skills: ['AWS', 'Security'] },
  { subject: 'cloud', title: 'Deploy a container on Amazon ECS', why: 'Shipped my first container to production on ECS.', skills: ['Docker', 'AWS'] },
  { subject: 'ml', title: 'Andrew Ng Machine Learning Specialization', why: 'Gradient descent and regularisation finally made sense.', skills: ['Machine Learning'] },
  { subject: 'ml', title: 'Scikit-learn crash course', why: 'Train/test splits, pipelines and cross-validation in one afternoon.', skills: ['Python', 'Scikit-learn'] },
  { subject: 'ml', title: 'StatQuest: bias and variance', why: 'Understood why my model overfit and how to fix it.', skills: ['Statistics'] },
  { subject: 'ml', title: 'Kaggle Titanic walkthrough', why: 'Feature engineering on a real dataset end to end.', skills: ['Python', 'ML'] },
  { subject: 'ml', title: 'Build a RAG chatbot over your notes', why: 'Embeddings, a vector store and an LLM wired together.', skills: ['LLM/RAG', 'Python'] },
  { subject: 'ml', title: 'Hugging Face transformers course', why: 'Fine-tuning a pretrained model for my own text classifier.', skills: ['NLP', 'Deep Learning'] },
  { subject: 'data', title: 'SQL for data analysts (Mode)', why: 'Window functions and joins for real reporting questions.', skills: ['SQL'] },
  { subject: 'data', title: 'Power BI dashboard in a day', why: 'Built a sales dashboard my manager actually used.', skills: ['Power BI'] },
  { subject: 'data', also: ['ml'], title: 'Pandas for analysts', why: 'Cleaning messy CSVs and group-by reports.', skills: ['Python', 'Pandas'] },
  { subject: 'data', title: 'Excel pivot tables masterclass', why: 'Summarised 50k rows of transactions in minutes.', skills: ['Excel'] },
  { subject: 'data', title: 'Storytelling with Data', why: 'How to choose the right chart and remove clutter.', skills: ['Data Visualization'] },
  { subject: 'data', title: 'A/B testing basics', why: 'Sample size and significance for a product experiment.', skills: ['Statistics'] },
  { subject: 'web', title: 'A complete guide to React hooks', why: 'useEffect and custom hooks finally clicked.', skills: ['React', 'JavaScript'] },
  { subject: 'web', title: 'MDN: CSS Flexbox and Grid', why: 'Stopped fighting layouts on every page I built.', skills: ['CSS'] },
  { subject: 'web', title: 'Build a REST API with Express', why: 'Routing, middleware and error handling for my first backend.', skills: ['Node.js', 'Express'] },
  { subject: 'web', title: 'TypeScript handbook', why: 'Types caught bugs before my users did.', skills: ['TypeScript'] },
  { subject: 'web', title: 'Next.js tutorial', why: 'Server rendering and routing for a portfolio site.', skills: ['React', 'Next.js'] },
  { subject: 'web', title: 'DEMO', why: 'web development basics I used for my first website.', skills: ['Web'] },
  { subject: 'dsa', title: 'NeetCode 150', why: 'Patterns instead of memorising 500 problems.', skills: ['DSA'] },
  { subject: 'dsa', title: 'Striver SDE sheet', why: 'Structured daily practice before placements.', skills: ['DSA'] },
  { subject: 'dsa', title: 'Big-O cheat sheet', why: 'Quick revision of time complexity before interviews.', skills: ['Algorithms'] },
  { subject: 'dsa', title: 'Mock interviews on Pramp', why: 'Practising out loud made the real interview calm.', skills: ['Interview Prep'] },
  { subject: 'sysdesign', title: 'System design primer', why: 'Load balancers, caching and sharding in one repo.', skills: ['System Design'] },
  { subject: 'sysdesign', title: 'Designing Data-Intensive Applications', why: 'Replication and consistency trade-offs, properly explained.', skills: ['System Design', 'Databases'] },
  { subject: 'sysdesign', title: 'Martin Fowler on microservices', why: 'When to split a monolith, and when not to.', skills: ['Architecture'] },
  { subject: 'devops', title: 'GitHub Actions: build and test on every push', why: 'My first CI pipeline caught a broken build before review.', skills: ['CI/CD', 'GitHub Actions'] },
  { subject: 'devops', title: 'Kubernetes basics (official tutorial)', why: 'Pods, deployments and services made sense hands on.', skills: ['Kubernetes'] },
  { subject: 'devops', title: 'Linux command line for beginners', why: 'Stopped being scared of the terminal on servers.', skills: ['Linux'] },
  { subject: 'devops', title: 'Prometheus and Grafana monitoring', why: 'Dashboards and alerts for my services before users noticed.', skills: ['Monitoring'] },
  { subject: 'design', title: 'Figma for beginners', why: 'Frames, auto layout and components for my first prototype.', skills: ['Figma'] },
  { subject: 'design', title: 'Laws of UX', why: 'Short principles I now check every screen against.', skills: ['UX'] },
  { subject: 'design', title: 'How to run a user interview', why: 'Open questions that got real answers from users.', skills: ['User Research'] },
  { subject: 'design', title: 'Refactoring UI', why: 'Spacing, colour and hierarchy tips that fixed my ugly screens.', skills: ['UI Design'] },
  { subject: 'pm', title: 'Writing a good PRD', why: 'Problem first, then success metrics, then scope.', skills: ['Product Management'] },
  { subject: 'pm', title: 'Prioritisation with RICE', why: 'Reach, impact, confidence and effort to rank the backlog.', skills: ['Product Management'] },
  { subject: 'pm', title: 'Inspired by Marty Cagan', why: 'How strong product teams discover what to build.', skills: ['Product'] },
  { subject: 'pm', title: 'Product metrics: north star and funnels', why: 'Picking the one number that shows real value.', skills: ['Analytics'] },
  { subject: 'pm', title: 'Running a sprint planning meeting', why: 'Turned a messy backlog into a two week plan.', skills: ['Agile'] },
  // Shares as members wrote them on the local copy (2026-10-08), including the
  // case that set the cut-offs: an AWS course must not reach "Learn
  // Fundamentals of ML", while Pandas/NumPy shares must.
  { subject: 'cloud', title: 'AWS Cloud Practitioner Essentials course', why: 'Covered core AWS services, IAM, EC2, S3 and VPC basics — the foundation I needed before architecture work.', skills: ['AWS', 'Cloud'] },
  { subject: 'data', title: 'SQL joins and window functions practice workbook', why: 'Working every exercise made joins and window functions click, so I could write the analytics queries my reports needed.', skills: ['SQL', 'Data Analysis'] },
  { subject: 'data', also: ['ml'], title: 'Python for Data Analysis: Pandas and NumPy hands-on', why: 'Cleaning and reshaping data with Pandas and NumPy was the groundwork every ML exercise depended on.', skills: ['Pandas', 'NumPy', 'Python'] },
  { subject: 'ml', title: 'Building RAG pipelines with LangChain: my notes', why: 'Explains chunking, embeddings and retrieval for LLM apps step by step; I built my first RAG chatbot with it.', skills: ['LLM', 'RAG'] },
  { subject: 'cloud', title: 'Amazon S3 getting started', why: 'Buckets, objects and permissions finally made sense once I followed this step by step.', skills: ['AWS', 'S3'] },
  { subject: 'cloud', title: 'Azure Fundamentals: describe cloud concepts', why: 'Cloud concepts, pricing and service models explained without jargon, great for comparing with AWS.', skills: ['Azure', 'Cloud'] },
  { subject: 'cloud', title: 'Build a 2-tier VPC by hand', why: 'Interviewers always ask how traffic reaches a private subnet.', skills: ['AWS', 'Networking', 'System Design'] },
  { subject: 'cloud', title: 'Python boto3 crash course', why: 'Automating my first infra tasks in Python is what got me noticed.', skills: ['Python', 'AWS'] },
  { subject: 'data', also: ['ml'], title: 'Pandas 10 minutes to pandas', why: 'Cleaning messy CSV files and building group-by reports became quick after this guide.', skills: ['Python', 'Pandas'] },
  { subject: 'ml', title: 'RAG chatbot over your notes', why: 'Every cloud team I talk to now wants someone who has shipped one.', skills: ['LLM/RAG', 'Python', 'Machine Learning'] },
  { subject: 'data', title: 'Seaborn and Matplotlib charts for analysts', why: 'Turned my notebook tables into charts stakeholders understood at a glance.', skills: ['Python', 'Data Visualization'] },
]

export const STAGES: LabelledStage[] = [
  { role: 'Cloud Architect', title: 'Deepen AWS and Cloud Fundamentals', wants: ['cloud'] },
  { role: 'DevOps Engineer', title: 'Master Containerisation and Cloud Deployment', wants: ['cloud', 'devops'] },
  { role: 'DevOps Engineer', title: 'Build CI/CD Pipelines and Automation', wants: ['devops'] },
  { role: 'AI Engineer', title: 'Learn Fundamentals of ML', wants: ['ml'] },
  { role: 'Data Scientist', title: 'Build Predictive Models with Real Data', wants: ['ml'] },
  { role: 'Data Analyst', title: 'Strengthen SQL and Reporting Skills', wants: ['data'] },
  { role: 'Business Analyst', title: 'Learn Dashboarding and Data Visualisation', wants: ['data'] },
  { role: 'Frontend Developer', title: 'Build Modern Web Apps with React', wants: ['web'] },
  { role: 'Software Engineer', title: 'Prepare for Coding Interviews', wants: ['dsa'] },
  { role: 'Backend Engineer', title: 'Learn Scalable System Design', wants: ['sysdesign'] },
  { role: 'UX Designer', title: 'Develop UX Research and Prototyping Skills', wants: ['design'] },
  { role: 'Product Manager', title: 'Learn Product Discovery and Prioritisation', wants: ['pm'] },
  // Generic stages: the role is the only signal, so its own field is the fair answer.
  { role: 'Data Analyst', title: 'Skill Gap Analysis', wants: ['data'] },
  { role: 'Product Manager', title: 'Build Your Portfolio', wants: ['pm'] },
  // Stages as generated roadmaps worded them on the local copy (2026-10-08).
  { role: 'AI Engineer', title: 'Gain LLM and RAG Expertise', wants: ['ml'] },
  { role: 'AI Engineer', title: 'Transition to ML Engineer via Internship or Project', wants: ['ml'] },
  { role: 'Cloud Architect', title: 'Learn Cloud Architecture Principles and Design', wants: ['cloud', 'sysdesign'] },
  { role: 'Cloud Architect', title: 'Complete Cloud Engineering Projects', wants: ['cloud'] },
  { role: 'Data Analyst', title: 'Learn SQL and Data Analysis Fundamentals', wants: ['data'] },
  { role: 'Data Analyst', title: 'Master Pandas, NumPy, and Data Visualization', wants: ['data'] },
  { role: 'Data Analyst', title: 'Build Portfolio Projects with Real Datasets', wants: ['data'] },
  { role: 'Data Analyst', title: 'Interview Preparation', wants: ['data', 'dsa'] },
  // The job hunt itself: no course belongs, whatever the role.
  { role: 'Data Analyst', title: 'Resume and LinkedIn Optimization', wants: [] },
  // Outside the role's own field: an AI engineer's cloud stages want cloud
  // shares, not the role's ML ones — what keeps the role key off stages that
  // name their own subject.
  { role: 'AI Engineer', title: 'Deepen AWS and Cloud Fundamentals', wants: ['cloud'] },
  { role: 'AI Engineer', title: 'Learn Cloud Architecture Principles and Design', wants: ['cloud', 'sysdesign'] },
  { role: 'AI Engineer', title: 'Complete Cloud Engineering Projects', wants: ['cloud'] },
]

export const FILED: FiledCase[] = [
  { stage: 'Deepen AWS and Cloud Fundamentals', share: 'Amazon VPC User Guide', belongs: true },
  { stage: 'Deepen AWS and Cloud Fundamentals', share: 'IAM roles explained', belongs: true },
  { stage: 'Deepen AWS and Cloud Fundamentals', share: 'DEMO', belongs: false },
  { stage: 'Learn Fundamentals of ML', share: 'Andrew Ng Machine Learning Specialization', belongs: true },
  { stage: 'Learn Fundamentals of ML', share: 'Excel pivot tables masterclass', belongs: false },
  { stage: 'Strengthen SQL and Reporting Skills', share: 'SQL for data analysts (Mode)', belongs: true },
  { stage: 'Strengthen SQL and Reporting Skills', share: 'A complete guide to React hooks', belongs: false },
  { stage: 'Develop UX Research and Prototyping Skills', share: 'Figma for beginners', belongs: true },
  { stage: 'Develop UX Research and Prototyping Skills', share: 'NeetCode 150', belongs: false },
]

/** The exact texts production embeds, so calibration measures what ships. */
export const shareText = (s: LabelledShare) =>
  shareEmbedText({ title: s.title, kind: 'article', why_helped: s.why, about: null, skills: s.skills.map(normalizeTag) })
export const stageText = (t: LabelledStage) => topicEmbedText({ role_label: t.role.toLowerCase(), stage_label: t.title })

export const cosine = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2 }
  return d / Math.sqrt(x * y)
}

/** Cards members have judged by hand: whatever the totals say, cut-offs that
 *  get one of these wrong are never recommended. Added 2026-10-08 — the AWS
 *  course scored 0.31 on the ML stage, above the Pandas shares (~0.1), so no
 *  single cut-off on meaning can get both right; the skill tag decides. */
export const MUST: { stage: string; share: string; shown: boolean }[] = [
  { stage: 'Learn Fundamentals of ML', share: 'AWS Cloud Practitioner Essentials course', shown: false },
  { stage: 'Learn Fundamentals of ML', share: 'Python for Data Analysis: Pandas and NumPy hands-on', shown: true },
  { stage: 'Learn Fundamentals of ML', share: 'Pandas for analysts', shown: true },
  { stage: 'Learn Fundamentals of ML', share: 'Pandas 10 minutes to pandas', shown: true },
]

export interface Scored {
  precision: number; recall: number; f1: number
  relatedMin: number; relatedWithTagMin: number; relatedWithRoleMin: number
  /** Every MUST card comes out the way members judged it. */
  mustOk: boolean
}

/**
 * Every (relatedMin, relatedWithTagMin, relatedWithRoleMin) on a grid, scored
 * exactly the way the stage query decides: shown when sim ≥ relatedMin, or a
 * stage tag matches and sim ≥ relatedWithTagMin, or — on a stage whose title
 * names no skill — a skill of the role matches and sim ≥ relatedWithRoleMin.
 * sim[i][j] = stage i vs share j.
 */
export function sweep(sim: number[][]): Scored[] {
  // "In use on the network" (the page asks learning_tags) is, here, every
  // skill the labelled shares carry.
  const vocab = new Set(SHARES.flatMap((s) => s.skills.map(normalizeTag)))
  const skillsOf = SHARES.map((s) => s.skills.map(normalizeTag))
  const tagHit: boolean[][] = []
  const roleHit: boolean[][] = []
  STAGES.forEach((st) => {
    const { tags } = stageMatchTerms(st.title)
    const roleTags = stageRoleTags(st.title, st.role, tags.some((t) => vocab.has(t)))
    tagHit.push(skillsOf.map((sk) => sk.some((t) => tags.includes(t))))
    roleHit.push(skillsOf.map((sk) => sk.some((t) => roleTags.includes(t))))
  })
  const wanted = STAGES.map((st) => SHARES.map((s) => [s.subject, ...(s.also ?? [])].some((x) => st.wants.includes(x))))
  const relevant = wanted.flat().filter(Boolean).length
  const must = MUST.map((m) => {
    const i = STAGES.findIndex((s) => s.title === m.stage)
    const j = SHARES.findIndex((s) => s.title === m.share)
    if (i < 0 || j < 0) throw new Error(`MUST case not in the labelled set: ${m.share} → ${m.stage}`)
    return { i, j, shown: m.shown }
  })
  const shownAt = (i: number, j: number, r: number, t: number, g: number) =>
    sim[i][j] >= r || (tagHit[i][j] && sim[i][j] >= t) || (roleHit[i][j] && sim[i][j] >= g)
  const out: Scored[] = []
  for (let r = 0.1; r <= 0.6001; r += 0.01) {
    // The backed bars can sit far below the meaning-only one: the skill tag
    // (or the role's skill) is the second key — a Pandas share on an ML stage
    // scores ~0.1.
    for (let t = 0.05; t <= r + 0.0001; t += 0.01) {
      for (let g = 0.05; g <= r + 0.0001; g += 0.01) {
        let right = 0, wrong = 0
        for (let i = 0; i < STAGES.length; i++) {
          for (let j = 0; j < SHARES.length; j++) {
            if (shownAt(i, j, r, t, g)) wanted[i][j] ? right++ : wrong++
          }
        }
        const precision = right / Math.max(1, right + wrong)
        const recall = right / Math.max(1, relevant)
        const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
        const mustOk = must.every((m) => shownAt(m.i, m.j, r, t, g) === m.shown)
        out.push({
          precision, recall, f1, mustOk,
          relatedMin: +r.toFixed(2), relatedWithTagMin: +t.toFixed(2), relatedWithRoleMin: +g.toFixed(2),
        })
      }
    }
  }
  return out.sort((a, b) => b.f1 - a.f1 || b.precision - a.precision)
}

/** The same-stage screen, as the page applies it: a filed share stays when it
 *  is close enough OR carries one of the stage's skill tags. So only shares
 *  WITHOUT a tag decide the cut-off — the highest that keeps every one that
 *  belongs and drops the off-topic ones; null when no cut-off can. */
export function sameStageCut(simOf: (stage: string, share: string) => number): { cut: number | null; keepMin: number; dropMax: number } {
  const tagHit = (c: FiledCase) => {
    const { tags } = stageMatchTerms(c.stage)
    return (SHARES.find((s) => s.title === c.share)?.skills ?? []).map(normalizeTag).some((t) => tags.includes(t))
  }
  const untagged = FILED.filter((c) => !tagHit(c))
  const keep = untagged.filter((c) => c.belongs).map((c) => simOf(c.stage, c.share))
  const drop = untagged.filter((c) => !c.belongs).map((c) => simOf(c.stage, c.share))
  const keepMin = keep.length ? Math.min(...keep) : 1
  const dropMax = drop.length ? Math.max(...drop) : 0
  return { cut: dropMax < keepMin ? +Math.min(dropMax + 0.02, (dropMax + keepMin) / 2).toFixed(2) : null, keepMin, dropMax }
}

/** The rule the page is tuned to: at least this share of the cards shown must
 *  be right — an unrelated card costs a member's trust more than a missing one
 *  costs them. Among the cut-offs that meet it, the one that finds the most.
 *  Raised from 0.8 once skill families (learning.ts) made 0.9 reachable
 *  without finding fewer: at 0.8 an AWS course still reached an ML stage. */
export const MIN_PRECISION = 0.9

export function recommend(scored: Scored[]): Scored {
  // The hand-judged cards first: only when no cut-off gets them all right (a
  // model that cannot) does the choice fall back to the totals alone — and
  // calibrateEmbeddings.ts says so.
  const pool = scored.some((s) => s.mustOk) ? scored.filter((s) => s.mustOk) : scored
  const ok = pool.filter((s) => s.precision >= MIN_PRECISION)
  return (ok.length ? ok.sort((a, b) => b.recall - a.recall || b.precision - a.precision) : [...pool].sort((a, b) => b.precision - a.precision))[0]
}
