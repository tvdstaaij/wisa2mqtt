'use strict';

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

module.exports = {retryPromise};
