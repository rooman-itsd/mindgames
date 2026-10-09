import assert from 'node:assert'
import {
  appendPage, assignmentOrigin, displayLink, fileSizeLabel, isBlockedFile, opensInTab, resourceDomains, resourceFormProblem, helpedByLabel, isFiltering, monthsLabel, ratingSummary, stepPosition,
  canReplaceWork, resubmitRequested, submissionState, supportLabel, toggleValue, waitingLabel, workable,
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
// A follow-up given after the session that asks for nothing back is still a follow-up.
assert.equal(assignmentOrigin({ sessionId: 's', sessionTopic: 'AWS basics', afterSession: true }), 'Follow-up from AWS basics')
assert.equal(assignmentOrigin({ sessionId: 's', sessionTopic: 'AWS basics', afterSession: false }), 'Prep for AWS basics')

// --- submission state ------------------------------------------------------
assert.equal(submissionState({}), 'not_needed')
assert.equal(submissionState({ requiresSubmission: true }), 'needed')
assert.equal(submissionState({ requiresSubmission: true, submissionUrl: 'https://x.dev' }), 'submitted')
// Files-only evidence has no link — submissionAt alone means it was sent.
assert.equal(submissionState({ requiresSubmission: true, submissionAt: '2026-10-09T00:00:00Z' }), 'submitted')

// --- correcting work sent back ----------------------------------------------
const sent = '2026-10-09T10:00:00.000Z'
// Asked again AFTER it was sent → needed again; a request older than the
// latest submission (already answered) changes nothing.
assert.equal(submissionState({ requiresSubmission: true, submissionAt: sent, resubmitRequestedAt: '2026-10-09T11:00:00.000Z' }), 'needed')
assert.equal(submissionState({ requiresSubmission: true, submissionAt: sent, resubmitRequestedAt: '2026-10-09T09:00:00.000Z' }), 'submitted')
assert.equal(resubmitRequested({ submissionAt: undefined, resubmitRequestedAt: sent }), false)
// Replaceable until the mentor opens it; after that only if asked again.
assert.equal(canReplaceWork({ submissionAt: sent }), true)
assert.equal(canReplaceWork({ submissionAt: sent, evidenceSeenAt: '2026-10-09T10:30:00.000Z' }), false)
assert.equal(canReplaceWork({ submissionAt: sent, evidenceSeenAt: '2026-10-09T10:30:00.000Z', resubmitRequestedAt: '2026-10-09T11:00:00.000Z' }), true)
assert.equal(canReplaceWork({}), false)

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
assert.equal(ratingSummary(4.6, 23, 23), '4.6 · helped 23 members')
assert.equal(ratingSummary(4.5, 5, 2), '4.5 from 2 ratings · helped 5 members')
assert.equal(ratingSummary(4, 3, 1), '4.0 from 1 rating · helped 3 members')
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

// --- Add resource ------------------------------------------------------------
assert.ok(isBlockedFile('setup.EXE') && isBlockedFile('page.html') && isBlockedFile('logo.svg'))
assert.ok(!isBlockedFile('notes.pdf') && !isBlockedFile('clip.mp4') && !isBlockedFile('slides.pptx'))
// Windows drops trailing dots/spaces on save, so these are setup.exe / run.hta.
assert.ok(isBlockedFile('setup.exe.') && isBlockedFile('setup.exe . ') && isBlockedFile('run.hta') && isBlockedFile('link.lnk'))
assert.ok(!isBlockedFile('v1.2.') && !isBlockedFile('report.final.pdf'))
assert.ok(opensInTab('application/pdf') && opensInTab('video/mp4') && opensInTab('image/png'))
assert.ok(!opensInTab('image/svg+xml') && !opensInTab('text/html') && !opensInTab('application/zip'), 'risky or unknown types download')
assert.equal(fileSizeLabel(900), '900 B')
assert.equal(fileSizeLabel(420 * 1024), '420 KB')
assert.equal(fileSizeLabel(8.6 * 1024 * 1024), '8.6 MB')
assert.equal(fileSizeLabel(10 * 1024 * 1024), '10 MB')
assert.deepEqual(resourceDomains(['Data', 'Cloud'], [' Blockchain ', 'data', 'Game  Dev']), ['Data', 'Cloud', 'Blockchain', 'Game Dev'])
assert.deepEqual(resourceDomains([], []), [])
const ok = { domains: ['Data'], title: 'SQL guide', files: 2, uploading: 0, whyHelped: 'x'.repeat(30) }
assert.equal(resourceFormProblem(ok), null)
assert.equal(resourceFormProblem({ ...ok, domains: [] }), 'Pick a domain.')
assert.equal(resourceFormProblem({ ...ok, files: 0 }), 'Attach at least one file.')
assert.equal(resourceFormProblem({ ...ok, uploading: 1 }), 'Wait for the files to finish uploading.')
assert.match(resourceFormProblem({ ...ok, whyHelped: 'short' }) ?? '', /at least 30/)

console.log('learningHub.check.ts — all assertions passed')

