/**
 * Module for managing pull request review comments
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import type { GitHubAPI } from './github-api.js'
import { readFile } from 'fs/promises'
import { structuredPatch } from 'diff'
import parseDiff from 'parse-diff'

/** Marker used to identify comments created by this action */
const COMMENT_MARKER = '<!-- csharpier-action -->'

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
  /** Line number where the comment is placed */
  line: number
}

interface FormattingHunk {
  /** Starting line number in the formatted file */
  lineNumber: number
  /** Formatted code content to show in the suggestion */
  content: string
  /** Original line range for reference */
  originalLineRange: { start: number; end: number }
}

/**
 * Generate structured hunks for formatting violations
 * Splits large hunks into separate comments for each group of changes
 *
 * @param originalContent - The original unformatted content
 * @param formattedContent - The formatted content
 * @param filePath - Path to the file (used in patch header)
 * @returns Array of hunks with line numbers and content
 */
function generateFormattingHunks(
  originalContent: string,
  formattedContent: string,
  filePath: string
): FormattingHunk[] {
  // Generate unified diff patch
  const patch = structuredPatch(
    filePath,
    filePath,
    originalContent,
    formattedContent,
    '',
    '',
    { context: 3 }
  )

  const hunks: FormattingHunk[] = []

  for (const hunk of patch.hunks) {
    core.debug(
      `Processing hunk: newStart=${hunk.newStart}, lines=${hunk.lines.length}`
    )

    // Find the first and last lines with changes, tracking line numbers
    let firstChangeIndex = -1
    let lastChangeIndex = -1
    let currentLine = hunk.newStart

    for (let i = 0; i < hunk.lines.length; i++) {
      const line = hunk.lines[i]
      const isContext = line.startsWith(' ')
      const isAddition = line.startsWith('+')
      const isDeletion = line.startsWith('-')

      if (isAddition || isDeletion) {
        if (firstChangeIndex === -1) {
          firstChangeIndex = i
        }
        lastChangeIndex = i
      }

      if (isContext || isAddition) {
        currentLine++
      }
    }

    if (firstChangeIndex === -1) {
      continue
    }

    // Calculate the line number where the first change occurs
    let firstChangeLine = hunk.newStart
    for (let i = 0; i < firstChangeIndex; i++) {
      const line = hunk.lines[i]
      if (line.startsWith(' ') || line.startsWith('+')) {
        firstChangeLine++
      }
    }

    // Collect only the changed section (additions only, no context)
    const formattedLines: string[] = []
    for (let i = firstChangeIndex; i <= lastChangeIndex; i++) {
      const line = hunk.lines[i]
      if (line.startsWith('+')) {
        formattedLines.push(line.substring(1))
      }
    }

    if (formattedLines.length === 0) {
      continue
    }

    hunks.push({
      lineNumber: firstChangeLine,
      content: formattedLines.join('\n'),
      originalLineRange: {
        start: hunk.oldStart,
        end: hunk.oldStart + hunk.oldLines - 1
      }
    })
  }

  return hunks
}

/**
 * Get existing review comments created by this action
 *
 * @param api - GitHub API client
 * @param context - GitHub Actions context
 * @returns Array of existing violation comments
 */
export async function getExistingComments(
  api: GitHubAPI,
  context: typeof github.context
): Promise<ViolationComment[]> {
  if (!context.payload.pull_request) {
    return []
  }

  const pullNumber = context.payload.pull_request.number

  core.debug(`Fetching existing review comments for PR #${pullNumber}`)

  const comments = await api.listReviewComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullNumber
  })

  // Filter for comments created by this action
  const actionComments = comments
    .filter((comment) => comment.body?.includes(COMMENT_MARKER))
    .map((comment) => ({
      id: comment.id,
      path: comment.path,
      body: comment.body || '',
      isResolved: comment.in_reply_to_id !== undefined,
      line: comment.line || comment.original_line || 0
    }))

  core.debug(`Found ${actionComments.length} existing action comment(s)`)

  return actionComments
}

/**
 * Find the line number in the PR diff that corresponds to a formatting hunk
 *
 * @param prPatch - The unified diff patch from GitHub PR
 * @param targetLine - The line number in the file where the hunk starts
 * @returns The line number in the PR diff, or 0 if not found
 */
function findLineInPRDiff(prPatch: string, targetLine: number): number {
  const parsed = parseDiff(prPatch)
  if (parsed.length === 0) {
    return 0
  }

  const file = parsed[0]

  for (const chunk of file.chunks) {
    let currentLine = chunk.newStart

    for (const change of chunk.changes) {
      if (change.type === 'add' || change.type === 'normal') {
        if (currentLine === targetLine) {
          return currentLine
        }
        currentLine++
      }
    }
  }

  return 0
}

/**
 * Create or update review comments for formatting violations in a file
 *
 * @param api - GitHub API client
 * @param context - GitHub Actions context
 * @param filePath - Path to the file with the violation
 * @param commitSha - SHA of the commit to comment on
 * @param formattedContent - The formatted content of the file
 * @param existingComments - Existing comments for this file, if any
 */
export async function createViolationComments(
  api: GitHubAPI,
  context: typeof github.context,
  filePath: string,
  commitSha: string,
  formattedContent: string,
  existingComments: ViolationComment[]
): Promise<void> {
  if (!context.payload.pull_request) {
    return
  }

  const pullNumber = context.payload.pull_request.number

  core.info(`Creating comments for ${filePath}`)

  try {
    // Get the diff to find positions in the PR
    const files = await api.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullNumber
    })

    const file = files.find((f) => f.filename === filePath)
    if (!file || !file.patch) {
      core.warning(
        `Cannot create review comment for ${filePath}: file not found in PR diff`
      )
      return
    }

    // Read the original file content
    const originalContent = await readFile(filePath, 'utf8')

    // Generate formatting hunks
    const hunks = generateFormattingHunks(
      originalContent,
      formattedContent,
      filePath
    )

    if (hunks.length === 0) {
      core.debug(`No formatting hunks found for ${filePath}`)
      return
    }

    core.debug(`Found ${hunks.length} formatting hunk(s) in ${filePath}`)

    // Delete all existing unresolved comments for this file
    // This ensures we don't create duplicates when line numbers change
    const unresolvedComments = existingComments.filter((c) => !c.isResolved)
    if (unresolvedComments.length > 0) {
      core.debug(
        `Deleting ${unresolvedComments.length} existing comment(s) for ${filePath}`
      )
      for (const comment of unresolvedComments) {
        try {
          await api.deleteReviewComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: comment.id
          })
        } catch (error) {
          core.warning(
            `Failed to delete comment ${comment.id}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }

    // Create comments for each hunk
    for (const hunk of hunks) {
      // Find where this hunk appears in the PR diff
      const lineNumber = findLineInPRDiff(file.patch, hunk.lineNumber)

      if (lineNumber === 0) {
        core.debug(
          `Skipping hunk at line ${hunk.lineNumber} in ${filePath}: not in PR diff`
        )
        continue
      }

      // Create comment body with suggestion block
      const body = `${COMMENT_MARKER}
**CSharpier**: This section is not formatted correctly.

\`\`\`suggestion
${hunk.content}
\`\`\`

Run \`dotnet csharpier format ${filePath}\` to fix the formatting.`

      core.debug(`Creating comment at line ${lineNumber} in ${filePath}`)
      await api.createReviewComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pullNumber,
        body,
        commit_id: commitSha,
        path: filePath,
        line: lineNumber,
        side: 'RIGHT'
      })
    }
  } catch (error) {
    core.warning(
      `Failed to create review comments for ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Resolve comments for files that no longer have violations
 *
 * @param api - GitHub API client
 * @param context - GitHub Actions context
 * @param existingComments - Current comments on the PR
 * @param fixedFiles - Files that are now properly formatted
 */
export async function resolveFixedComments(
  api: GitHubAPI,
  context: typeof github.context,
  existingComments: ViolationComment[],
  fixedFiles: string[]
): Promise<void> {
  if (!context.payload.pull_request) {
    return
  }

  const pullNumber = context.payload.pull_request.number

  // Find comments for files that are now fixed
  const commentsToResolve = existingComments.filter(
    (comment) => !comment.isResolved && fixedFiles.includes(comment.path)
  )

  if (commentsToResolve.length === 0) {
    core.debug('No comments to resolve')
    return
  }

  core.info(`Resolving ${commentsToResolve.length} comment(s) for fixed files`)

  for (const comment of commentsToResolve) {
    core.debug(`Resolving comment ${comment.id} for ${comment.path}`)

    // Create a reply to resolve the comment
    await api.createReplyForReviewComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullNumber,
      comment_id: comment.id,
      body: '✓ Formatting has been fixed.'
    })
  }
}
