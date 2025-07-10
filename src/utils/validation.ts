export function validateCommitSha(commitSha: string,) {
  if (!commitSha) {
    throw new Error('Commit SHA is required');
  }

  if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) {
    throw new Error('Invalid commit SHA format');
  }
}