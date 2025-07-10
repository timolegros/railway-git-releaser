/**
 * Generates a random 40-character hexadecimal string, simulating a git commit SHA-1 hash.
 * @returns {string} A random git hash.
 */
export function generateRandomGitHash(): string {
  const hexChars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 40; i++) {
    hash += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  return hash;
}