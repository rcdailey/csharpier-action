/**
 * Main entry point for the CSharpier GitHub Action
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import { installCSharpier, checkFiles } from './csharpier-runner.js'
import { getChangedCSharpFiles } from './pr-files.js'
import {
  getExistingComments,
  createViolationComment,
  resolveFixedComments
} from './comment-manager.js'

/**
 * Main function for the action
 *
 * @returns Resolves when the action is complete
 */
export async function run(): Promise<void> {
  try {
    // Validate this is running on a pull request
    if (!github.context.payload.pull_request) {
      core.info(
        'This action only runs on pull request events. Skipping execution.'
      )
      return
    }

    // Get inputs
    const command = core.getInput('command', { required: true })
    const csharpierVersion = core.getInput('csharpier-version') || 'latest'
    const githubToken = core.getInput('github-token', { required: true })

    // Validate command
    if (command !== 'check') {
      throw new Error(
        `Invalid command: ${command}. Only 'check' is currently supported.`
      )
    }

    // Create GitHub API client
    const octokit = github.getOctokit(githubToken)
    const context = github.context

    // Install CSharpier
    await installCSharpier(csharpierVersion)

    // Get changed C# files
    const changedFiles = await getChangedCSharpFiles(octokit, context)

    if (changedFiles.length === 0) {
      core.info('No C# files changed in this PR. Nothing to check.')
      core.setOutput('violations-found', 'false')
      return
    }

    // Get existing comments
    const existingComments = await getExistingComments(octokit, context)

    // Run CSharpier check
    const filePaths = changedFiles.map((f) => f.path)
    const result = await checkFiles(filePaths)

    // Handle CSharpier errors (exit code 2+)
    if (result.exitCode >= 2) {
      core.error('CSharpier encountered an error:')
      core.error(result.stderr || result.stdout)
      core.setFailed('CSharpier check failed with errors')
      return
    }

    // Determine which files are fixed (were unformatted before, but formatted now)
    const previouslyUnformattedFiles = existingComments.map((c) => c.path)
    const fixedFiles = previouslyUnformattedFiles.filter(
      (file) => !result.unformattedFiles.includes(file)
    )

    // Resolve comments for fixed files
    if (fixedFiles.length > 0) {
      await resolveFixedComments(octokit, context, existingComments, fixedFiles)
    }

    // Create comments for new violations
    const commitSha = context.payload.pull_request!.head.sha
    const existingCommentPaths = existingComments.map((c) => c.path)

    for (const file of result.unformattedFiles) {
      // Only create a comment if one doesn't already exist for this file
      if (!existingCommentPaths.includes(file)) {
        await createViolationComment(octokit, context, file, commitSha)
      }
    }

    // Set outputs
    const hasViolations = result.unformattedFiles.length > 0
    core.setOutput('violations-found', hasViolations.toString())

    // Report results
    if (hasViolations) {
      core.setFailed(
        `Found ${result.unformattedFiles.length} file(s) with formatting violations`
      )
    } else {
      core.info('All C# files are properly formatted!')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unexpected error occurred')
    }
  }
}
