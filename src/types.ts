/**
 * Type definitions for the CSharpier Action
 */

/**
 * Result from running CSharpier
 */
export interface CSharpierResult {
  /** Exit code from CSharpier (0 = success, 1 = formatting violations, 2+ = error) */
  exitCode: number
  /** Standard output from CSharpier */
  stdout: string
  /** Standard error from CSharpier */
  stderr: string
  /** List of files that are not formatted */
  unformattedFiles: string[]
}

/**
 * A file changed in the pull request
 */
export interface PRFile {
  /** Path to the file relative to repo root */
  path: string
  /** SHA of the file */
  sha: string
  /** File status (added, modified, removed, etc.) */
  status: string
}

/**
 * A review comment for a formatting violation
 */
export interface ViolationComment {
  /** Comment ID */
  id: number
  /** File path the comment is on */
  path: string
  /** Comment body */
  body: string
  /** Whether the comment is resolved */
  isResolved: boolean
}
