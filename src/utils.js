'use strict';

const assert = require('assert');

async function retryPromise(fn, minInterval, maxInterval) {
  try {
    const result = await fn();
    return result;
  } catch (err) {
    await new Promise(resolve => setTimeout(resolve, minInterval));
    const newInterval = Math.min(minInterval * 2, maxInterval);
    return retryPromise(fn, newInterval, maxInterval);
  }
}

function makeSignedByteFromInt(n) {
  assert.ok(Number.isInteger(n));
  assert.ok(n >= -128 && n <= 127);
  return n < 0 ? n + 256 : n;
}

function makeIntFromSignedByte(n) {
  assert.ok(Number.isInteger(n));
  assert.ok(n >= 0 && n <= 255);
  return n > 127 ? n - 256 : n;
}

module.exports = {retryPromise, makeSignedByteFromInt, makeIntFromSignedByte};
