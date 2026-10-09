// Sanity checks for roadmap progress + completion ordering. Run with:
//   npm --prefix frontend run check
import assert from 'node:assert'
import { blockedBy, isMemberAdded, isUnnamedStage, newMemberStageKey, nextStageAfter, roadmapProgress, workableStages } from './careerProgress'
import { servicesForStage } from './careerServices'
import { alumniCount } from './format'
import type { CareerStage, CareerStageStatus } from '../types'

const stage = (key: string, title: string, status: CareerStageStatus): CareerStage =>
  ({
    stepKey: key,
    title,
    status,
    durationWeeks: 4,
    relevantAlumniIds: [],
    relevantServiceIds: [],
  }) as CareerStage

// here -> a -> b -> c -> goal
const plan = (a: CareerStageStatus, b: CareerStageStatus, c: CareerStageStatus): CareerStage[] => [
  stage('s0', 'Working professional', 'completed'),
  stage('s1', 'Foundations', a),
  stage('s2', 'Projects', b),
  stage('s3', 'Interviews', c),
  stage('s4', 'AI Engineer', 'upcoming'),
]

// --- what counts as work ----------------------------------------------------

assert.deepStrictEqual(
  workableStages(plan('upcoming', 'upcoming', 'upcoming')).map((s) => s.title),
  ['Foundations', 'Projects', 'Interviews'],
  'bookends are not work',
)

// A plan with nothing between the bookends has no work in it.
assert.deepStrictEqual(workableStages([stage('a', 'Here', 'completed'), stage('b', 'Goal', 'upcoming')]), [])

// --- progress ---------------------------------------------------------------

assert.deepStrictEqual(roadmapProgress(plan('upcoming', 'upcoming', 'upcoming')), {
  total: 3, done: 0, percent: 0, complete: false,
})
assert.deepStrictEqual(roadmapProgress(plan('completed', 'upcoming', 'upcoming')), {
  total: 3, done: 1, percent: 33, complete: false,
})
assert.deepStrictEqual(roadmapProgress(plan('completed', 'completed', 'completed')), {
  total: 3, done: 3, percent: 100, complete: true,
})

// The goal stage being 'upcoming' must not stop the plan reading as finished —
// it is the destination, not a task.
assert.strictEqual(roadmapProgress(plan('completed', 'completed', 'completed')).complete, true)

// A two-stage plan has no work, so it must NOT report itself complete.
const empty = roadmapProgress([stage('a', 'Here', 'completed'), stage('b', 'Goal', 'upcoming')])
assert.strictEqual(empty.complete, false, 'a plan with no work is not a finished plan')
assert.strictEqual(empty.percent, 0)

// --- ordering ---------------------------------------------------------------

// The first workable stage is always open.
assert.strictEqual(blockedBy(plan('upcoming', 'upcoming', 'upcoming'), 's1'), null)

// The second is blocked by the first, and names it.
assert.strictEqual(blockedBy(plan('upcoming', 'upcoming', 'upcoming'), 's2'), 'Foundations')

// Once the first is done, the second opens.
assert.strictEqual(blockedBy(plan('completed', 'upcoming', 'upcoming'), 's2'), null)

// The blocker reported is the EARLIEST unfinished one, not the nearest.
assert.strictEqual(blockedBy(plan('upcoming', 'completed', 'upcoming'), 's3'), 'Foundations')

// A paused stage still blocks — pausing is not finishing.
assert.strictEqual(blockedBy(plan('paused', 'upcoming', 'upcoming'), 's2'), 'Foundations')

// The "you are here" bookend never blocks, even when it is not completed —
// it has no completion control, so requiring it would deadlock the plan.
const unfinishedStart = [
  stage('s0', 'Working professional', 'in_progress'),
  stage('s1', 'Foundations', 'upcoming'),
  stage('s2', 'Projects', 'upcoming'),
  stage('s3', 'AI Engineer', 'upcoming'),
]
assert.strictEqual(blockedBy(unfinishedStart, 's1'), null, 'stage 0 must never deadlock the plan')

// An unknown key is not blocked (the server rejects it separately).
assert.strictEqual(blockedBy(plan('upcoming', 'upcoming', 'upcoming'), 'nope'), null)

// --- nextStageAfter: where the "Next up" nudge points --------------------
{
  const st = (k: string, status: CareerStageStatus): CareerStage =>
    ({ stepKey: k, title: k, status, durationWeeks: null, relevantAlumniIds: [], relevantServiceIds: [] })
  const five = [st('s0', 'completed'), st('s1', 'completed'), st('s2', 'upcoming'), st('s3', 'upcoming'), st('s4', 'upcoming')]
  assert.strictEqual(nextStageAfter(five, 's1')?.stepKey, 's2')
  // Next is the goal itself -> no nudge; the congratulations banner covers it.
  assert.strictEqual(nextStageAfter(five, 's3'), null)
  // An already-completed later stage is skipped, not suggested.
  const gap = [st('s0', 'completed'), st('s1', 'completed'), st('s2', 'completed'), st('s3', 'upcoming'), st('s4', 'upcoming')]
  assert.strictEqual(nextStageAfter(gap, 's1')?.stepKey, 's3')
  assert.strictEqual(nextStageAfter(five, 'nope'), null)
}

// --- servicesForStage: the "N services" chip ------------------------------
{
  const svc = (id: string) => ({ id } as unknown as Parameters<typeof servicesForStage>[1][number])
  const loaded = [svc('a'), svc('b'), svc('a')] // 'a' loaded twice (matched + all)
  assert.deepStrictEqual(servicesForStage(['a', 'b', 'gone'], loaded).map((s) => s.id), ['a', 'b'])
  assert.deepStrictEqual(servicesForStage(['a', 'a'], loaded).map((s) => s.id), ['a'])
  assert.deepStrictEqual(servicesForStage([], loaded), [])
}

// --- alumniCount: singular for one, plural otherwise ---------------------
assert.strictEqual(alumniCount(1), '1 alum')
assert.strictEqual(alumniCount(2), '2 alumni')
assert.strictEqual(alumniCount(0), '0 alumni')

// Member-added stages are told apart from AI ones by their key.
assert.ok(isMemberAdded({ stepKey: newMemberStageKey() }), 'a stage added in the edit panel must read as member-added')
assert.ok(!isMemberAdded({ stepKey: 'current_situation' }), 'an AI stage must not read as member-added')

// A stage can't be saved blank or under the old placeholder name.
assert.ok(isUnnamedStage('   '))
assert.ok(isUnnamedStage(' New Stage '))
assert.ok(!isUnnamedStage('Build a RAG project'))

console.log('careerProgress.check.ts — all assertions passed')
