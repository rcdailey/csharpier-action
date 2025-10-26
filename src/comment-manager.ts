/**
 * Module for managing pull request review comments
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import type { ViolationComment } from './types.js'

/** Marker used to identify comments created by this action */
const COMMENT_MARKER = '<!-- csharpier-action -->'

/**
 * Get existing review comments created by this action
 *
 * @param octokit - Authenticated GitHub API client
 * @param context - GitHub Actions context
 * @returns Array of existing violation comments
 */
export async function getExistingComments(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context
): Promise<ViolationComment[]> {
  if (!context.payload.pull_request) {
    return []
  }

  const pullNumber = context.payload.pull_request.number

  core.debug(`Fetching existing review comments for PR #${pullNumber}`)

  const { data: comments } = await octokit.rest.pulls.listReviewComments({
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
      isResolved: comment.in_reply_to_id !== undefined
    }))

  core.debug(`Found ${actionComments.length} existing action comment(s)`)

  return actionComments
}

/**
 * Create a review comment for a formatting violation
 *
 * @param octokit - Authenticated GitHub API client
 * @param context - GitHub Actions context
 * @param filePath - Path to the file with the violation
 * @param commitSha - SHA of the commit to comment on
 */
export async function createViolationComment(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  filePath: string,
  commitSha: string
): Promise<void> {
  if (!context.payload.pull_request) {
    return
  }

  const pullNumber = context.payload.pull_request.number

  const body = `${COMMENT_MARKER}
This file is not formatted according to CSharpier rules.

Run \`dotnet csharpier format ${filePath}\` to fix the formatting.`

  core.info(`Creating comment for ${filePath}`)

  await octokit.rest.pulls.createReviewComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullNumber,
    body,
    commit_id: commitSha,
    path: filePath,
    line: 1
  })
}

/**
 * Resolve comments for files that no longer have violations
 *
 * @param octokit - Authenticated GitHub API client
 * @param context - GitHub Actions context
 * @param existingComments - Current comments on the PR
 * @param fixedFiles - Files that are now properly formatted
 */
export async function resolveFixedComments(
  octokit: ReturnType<typeof github.getOctokit>,
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
    await octokit.rest.pulls.createReplyForReviewComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullNumber,
      comment_id: comment.id,
      body: '✓ Formatting has been fixed.'
    })
  }
}
