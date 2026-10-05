import assert from 'node:assert'
import {
  appendPage, assignmentOrigin, displayLink, helpedByLabel, isFiltering, monthsLabel, ratingSummary, stepPosition,
  submissionState, supportLabel, toggleValue, waitingLabel, workable,
} from './learningHub'
import type { LearningStageLite } from '../types'

const st = (stepKey: string, status: LearningStageLite['status'] = 'upcoming'): LearningStageLite => ({
  stepKey,
  title: stepKey.toUpperCase(),
  status,
})

// --- workable stages: the bookends never count ----------------------------
const plan = [st('here', 'completed'), st('a', 'completed'), st('b'), st('c'), st('goal')]
assert.deepEqual(workable(plan).map((s) => s.stepKey), ['a', 'b', 'c'])
assert.deepEqual(workable([st('x'), st('y')]), [], 'a two-stage plan has nothing workable')

// --- "Step X of N" ---------------------------------------------------------
assert.deepEqual(stepPosition(plan, 'b'), { index: 2, total: 3 })
assert.equal(stepPosition(plan, 'here'), null, 'the "you are here" bookend is not a step')
assert.equal(stepPosition(plan, null), null)

// --- assignment captions ---------------------------------------------------
assert.equal(assignmentOrigin({ sessionId: 's', sessionTopic: 'AWS basics' }), 'Prep for AWS basics')
assert.equal(
  assignmentOrigin({ sessionId: 's', sessionTopic: 'AWS basics', requiresSubmission: true }),
  'Follow-up from AWS basics',
)
assert.equal(assignmentOrigin({ requiresSubmission: true }), 'Assigned directly')

// --- submission state ------------------------------------------------------
assert.equal(submissionState({}), 'not_needed')
assert.equal(submissionState({ requiresSubmission: true }), 'needed')
assert.equal(submissionState({ requiresSubmission: true, submissionUrl: 'https://x.dev' }), 'submitted')

// --- paging never shows a row twice ----------------------------------------
assert.deepEqual(
  appendPage([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }]).map((x) => x.id),
  ['1', '2', '3'],
)

// --- filters: a checkbox toggles one value; empty means no filter ---------
assert.deepEqual(toggleValue(['aws'], 'python'), ['aws', 'python'])
assert.deepEqual(toggleValue(['aws', 'python'], 'aws'), ['python'])
assert.equal(isFiltering({ q: '', tags: [], types: [], difficulty: [] }), false)
assert.equal(isFiltering({ q: '  ', tags: [], types: [], difficulty: [] }), false, 'blank search is no search')
assert.equal(isFiltering({ q: '', tags: ['aws'], types: [], difficulty: [] }), true)

// --- standing is a count of PEOPLE, never a score -------------------------
assert.equal(helpedByLabel(0), 'Be the first to say it helped')
assert.equal(helpedByLabel(1), 'Helped 1 member')
assert.equal(helpedByLabel(12), 'Helped 12 members')
assert.equal(ratingSummary(4, 1), '4.0 · helped 1 member')
assert.equal(ratingSummary(4.6, 23), '4.6 · helped 23 members')
assert.equal(waitingLabel(0), 'No one here yet')
assert.equal(waitingLabel(1), '1 member is on this step')
assert.equal(waitingLabel(4), '4 members are on this step')

// --- small labels ----------------------------------------------------------
assert.equal(displayLink('https://www.docs.aws.amazon.com/vpc/latest/x.html'), 'docs.aws.amazon.com/vpc/…')
assert.equal(displayLink('https://aws.amazon.com/architecture/'), 'aws.amazon.com/architecture')
assert.equal(displayLink('https://example.com'), 'example.com')
assert.equal(supportLabel('free_or_paid'), 'Free or paid')
assert.equal(supportLabel('nonsense'), null)
assert.equal(monthsLabel(1), '1 month')

console.log('learningHub.check.ts — all assertions passed')
