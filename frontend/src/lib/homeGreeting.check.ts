// Sanity checks for the Home greeting. Run with:
//   npm --prefix frontend run check
import assert from 'node:assert'
import { timeGreeting } from './homeGreeting'

assert.equal(timeGreeting(0), 'Up late')
assert.equal(timeGreeting(4), 'Up late')
assert.equal(timeGreeting(5), 'Good morning')
assert.equal(timeGreeting(11), 'Good morning')
assert.equal(timeGreeting(12), 'Good afternoon')
assert.equal(timeGreeting(16), 'Good afternoon')
assert.equal(timeGreeting(17), 'Good evening')
assert.equal(timeGreeting(23), 'Good evening')

console.log('homeGreeting.check.ts — all assertions passed')
