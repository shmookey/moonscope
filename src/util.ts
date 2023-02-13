import type {Quat, Vec3} from './ratite/types'
import {vec3, mat4, quat} from 'gl-matrix'

const RANDOM_SEED = 'hello, world'

/** Hash a string to a 128-bit integer. 
 * Used for seeding RNG.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

/** xorshiro128** PRNG. */
function xoshiro128ss(a, b, c, d) {
  return function() {
      var t = b << 9, r = a * 5; r = (r << 7 | r >>> 25) * 9;
      c ^= a; d ^= b;
      b ^= c; a ^= d; c ^= t;
      d = d << 11 | d >>> 21;
      return (r >>> 0) / 4294967296;
  }
}

/** Seeded RNG. */
export const random = xoshiro128ss(...cyrb128(RANDOM_SEED))

export function randomUnitVec3(): Vec3 {
  const v = vec3.create()
  v[0] = gaussianRandom()
  v[1] = gaussianRandom()
  v[2] = gaussianRandom()
  return vec3.normalize(v, v) as Vec3
}

/** Standard Normal variate using Box-Muller transform. */
export function gaussianRandom(mean=0, stdev=1) {
  let u = 1 - random(); //Converting [0,1) to (0,1)
  let v = random();
  let z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  // Transform to the desired mean and standard deviation:
  return z * stdev + mean;
}

/** Random unit quaternion, with seeded RNG. */
export function randomUnitQuat(): Quat {
  // Stolen from gl-matrix, modified to use seeded RNG and create new Quat
  // Implementation of http://planning.cs.uiuc.edu/node198.html
  // TODO: Calling random 3 times is probably not the fastest solution
  const u1 = random();
  const u2 = random();
  const u3 = random();
  const out = quat.create()
  const sqrt1MinusU1 = Math.sqrt(1 - u1);
  const sqrtU1 = Math.sqrt(u1);

  out[0] = sqrt1MinusU1 * Math.sin(2.0 * Math.PI * u2);
  out[1] = sqrt1MinusU1 * Math.cos(2.0 * Math.PI * u2);
  out[2] = sqrtU1 * Math.sin(2.0 * Math.PI * u3);
  out[3] = sqrtU1 * Math.cos(2.0 * Math.PI * u3);

  return out as Quat

}