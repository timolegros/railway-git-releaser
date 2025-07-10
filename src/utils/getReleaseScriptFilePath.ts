import path from 'path';

export function getReleaseScriptFilePath(filepath?: string) {
  if (filepath) {
    return path.join(__dirname, filepath);
  }
  return path.join(__dirname, '../clone.sh');
}