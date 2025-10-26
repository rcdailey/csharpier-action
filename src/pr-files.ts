/**
 * Module for fetching and filtering pull request files
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PRFile } from './types.js'

/**
 * Get C# files that were changed in the pull request
 *
 * @param octokit - Authenticated GitHub API client
 * @param context - GitHub Actions context
 * @returns Array of changed C# files
 */
export async function getChangedCSharpFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context
): Promise<PRFile[]> {
  if (!context.payload.pull_request) {
    throw new Error('This action can only be run on pull request events')
  }

  const pullNumber = context.payload.pull_request.number

  core.info(`Fetching changed files for PR #${pullNumber}`)

  // Fetch files changed in the PR
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullNumber
  })

  core.debug(`Total files changed: ${files.length}`)

  // Filter for C# files only
  const csharpFiles = files
    .filter(
      (file) =>
        (file.filename.endsWith('.cs') || file.filename.endsWith('.csx')) &&
        file.status !== 'removed'
    )
    .map((file) => ({
      path: file.filename,
      sha: file.sha,
      status: file.status
    }))

  core.info(`Found ${csharpFiles.length} C# file(s) to check`)

  return csharpFiles
}
