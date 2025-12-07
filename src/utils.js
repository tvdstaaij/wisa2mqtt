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

function mapEqGainToByte(gain) {
  gain = Number(gain);
  if (!Number.isInteger(gain) || gain < -6 || gain > 6) {
    throw new Error('gain must be integer between -6 and 6');
  }

  const explicit = {
    '-6': 250,
    '-5': 251,
    '-4': 252,
    '-3': 253,
    '-2': 254,
    '-1': 255,
    '0':   0,
    '1':   1,
    '2':   2,
    '3':   3,
    '4':   4,
    '5':   5,
    '6':   6
  };

  if (explicit.hasOwnProperty(String(gain))) {
    return explicit[String(gain)];
  }
  return gain;
}


function mapByteToEqGain(byte) {
  const b = Number(byte);
  if (!Number.isInteger(b) || b < 0 || b > 255) {
    throw new Error('byte must be integer 0..255');
  }

  const reverse = {
    '250': -6,
    '251': -5,
    '252': -4,
    '253': -3,
    '254': -2,
    '255': -1,
    '0': 0,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6
  };
  if (Object.prototype.hasOwnProperty.call(reverse, String(b))) {
    return reverse[String(b)];
  }

  const signed = (b > 127) ? b - 256 : b;
  if (signed >= -6 && signed <= 6) return signed;

  if (b >= 0 && b <= 12) {
    const gain = b - 6;
    if (gain >= -6 && gain <= 6) return gain;
  }

  return null;
}

module.exports = {retryPromise, mapEqGainToByte, mapByteToEqGain};
