/**
 * Main entry point for the CSharpier GitHub Action
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import { installCSharpier, formatFiles } from './csharpier-runner.js'
import { getChangedCSharpFiles } from './pr-files.js'
import {
  getExistingComments,
  createViolationComments,
  resolveFixedComments
} from './comment-manager.js'
import { OctokitGitHubAPI } from './github-api.js'

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
    const api = new OctokitGitHubAPI(octokit)
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
    const existingComments = await getExistingComments(api, context)

    // Format all changed files in one batch
    const filePaths = changedFiles.map((f) => f.path)
    const formattedMap = await formatFiles(filePaths)

    // Identify unformatted files by comparing original vs formatted
    const fs = await import('fs/promises')
    const unformattedFiles: string[] = []
    for (const filePath of filePaths) {
      const originalContent = await fs.readFile(filePath, 'utf8')
      const formattedContent = formattedMap.get(filePath)

      if (formattedContent && originalContent !== formattedContent) {
        unformattedFiles.push(filePath)
      }
    }

    // Determine which files are fixed (were unformatted before, but formatted now)
    const previouslyUnformattedFiles = existingComments.map((c) => c.path)
    const fixedFiles = previouslyUnformattedFiles.filter(
      (file) => !unformattedFiles.includes(file)
    )

    // Resolve comments for fixed files
    if (fixedFiles.length > 0) {
      await resolveFixedComments(api, context, existingComments, fixedFiles)
    }

    // Create or update comments for violations
    const commitSha = context.payload.pull_request!.head.sha

    for (const file of unformattedFiles) {
      // Find existing comments for this file
      const fileComments = existingComments.filter((c) => c.path === file)
      const formattedContent = formattedMap.get(file)!

      await createViolationComments(
        api,
        context,
        file,
        commitSha,
        formattedContent,
        fileComments
      )
    }

    // Set outputs
    const hasViolations = unformattedFiles.length > 0
    core.setOutput('violations-found', hasViolations.toString())

    // Report results
    if (hasViolations) {
      core.setFailed(
        `Found ${unformattedFiles.length} file(s) with formatting violations`
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
