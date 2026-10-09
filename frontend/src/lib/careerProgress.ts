import type { CareerStage } from '../types'

/**
 * How far along a roadmap is, and which stages may be completed next.
 *
 * Pure on purpose: the timeline, the lock on "Mark done" and the completion
 * banner all have to agree on what "done" means, and the server enforces the
 * same rule in career.routes.ts. Two places implementing "is this finished"
 * differently is how a member gets congratulated on a plan they haven't
 * finished.
 */

/** Stages the member actually works through.
 *
 *  The first stage is the "you are here" marker and the last is the goal
 *  itself — neither is a task, and neither has a completion control in the
 *  timeline. A plan of fewer than three stages therefore has nothing
 *  workable in it. */
export function workableStages(stages: CareerStage[]): CareerStage[] {
  return stages.length >= 3 ? stages.slice(1, -1) : []
}

export interface RoadmapProgress {
  /** Number of stages the member can actually tick off. */
  total: number
  done: number
  /** 0–100, rounded. 0 when there is nothing workable. */
  percent: number
  /** True only when there is real work and all of it is finished. */
  complete: boolean
}

export function roadmapProgress(stages: CareerStage[]): RoadmapProgress {
  const workable = workableStages(stages)
  const done = workable.filter((s) => s.status === 'completed').length
  const total = workable.length
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    // `total > 0` matters: without it a two-stage plan has no work in it and
    // would report itself finished the moment it was created.
    complete: total > 0 && done === total,
  }
}

/**
 * Why a stage cannot be completed yet, or null when it can.
 *
 * Mirrors the server rule: everything before it — ignoring the "you are
 * here" bookend — must already be completed. Returned as the blocking
 * stage's title so the UI can say which one, rather than just disabling a
 * button and leaving the member to guess.
 */
export function blockedBy(stages: CareerStage[], stepKey: string): string | null {
  const index = stages.findIndex((s) => s.stepKey === stepKey)
  if (index <= 0) return null
  const blocker = stages.slice(1, index).find((s) => s.status !== 'completed')
  return blocker ? blocker.title : null
}

/**
 * Where to point the member once they finish `stepKey`: the next stage that
 * is still ahead of them. Skips any already done (a member who reopened an
 * earlier stage can have later ones complete), and returns null once only the
 * goal itself is left — the roadmap's congratulations banner covers that.
 */
export function nextStageAfter(stages: CareerStage[], stepKey: string): CareerStage | null {
  const i = stages.findIndex((s) => s.stepKey === stepKey)
  if (i === -1) return null
  for (let j = i + 1; j < stages.length - 1; j++) {
    if (stages[j].status !== 'completed') return stages[j]
  }
  return null
}

/** Stages the member added through Edit roadmap carry this key prefix;
 *  everything else came from the AI. It is how the timeline tells the two
 *  apart without a separate "added by" column. */
const MEMBER_STAGE_PREFIX = 'custom-'

export function newMemberStageKey(): string {
  return `${MEMBER_STAGE_PREFIX}${Date.now()}`
}

export function isMemberAdded(stage: Pick<CareerStage, 'stepKey'>): boolean {
  return stage.stepKey.startsWith(MEMBER_STAGE_PREFIX)
}

/** A blank title, or "New stage" — the placeholder the edit panel used to
 *  fill in. Either reads like an AI step with no meaning, so it can't be
 *  saved. The server refuses the same thing. */
export function isUnnamedStage(title: string): boolean {
  const t = title.trim().toLowerCase()
  return t === '' || t === 'new stage'
}
