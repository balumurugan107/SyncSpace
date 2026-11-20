import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';

/**
 * bcrypt is deliberately slow (2^BCRYPT_ROUNDS iterations) so a stolen hash is
 * expensive to brute-force. Rounds are configurable so tests can run fast.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Compared against when the email does not exist, so "unknown email" and
 * "wrong password" take the same time and attackers cannot enumerate accounts.
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('timing-attack-mitigation-placeholder', config.BCRYPT_ROUNDS);
  return dummyHash;
}
