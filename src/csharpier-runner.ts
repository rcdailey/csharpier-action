/**
 * Module for installing and running CSharpier
 */

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import type { CSharpierResult } from './types.js'

/**
 * Install CSharpier as a global dotnet tool
 *
 * @param version - The version of CSharpier to install (e.g., '0.30.2' or 'latest')
 */
export async function installCSharpier(version: string): Promise<void> {
  core.info(`Installing CSharpier version: ${version}`)

  const args = ['tool', 'install', '-g', 'csharpier']

  if (version !== 'latest') {
    args.push('--version', version)
  }

  await exec.exec('dotnet', args)
  core.info('CSharpier installed successfully')
}

/**
 * Run CSharpier check on the specified files
 *
 * @param files - Array of file paths to check
 * @returns CSharpierResult containing exit code, output, and list of unformatted files
 */
export async function checkFiles(files: string[]): Promise<CSharpierResult> {
  if (files.length === 0) {
    core.info('No files to check')
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      unformattedFiles: []
    }
  }

  core.info(`Checking ${files.length} file(s) with CSharpier`)

  let stdout = ''
  let stderr = ''

  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
      stderr: (data: Buffer) => {
        stderr += data.toString()
      }
    }
  }

  // Run: dotnet csharpier check <files...>
  const args = ['csharpier', 'check', ...files]
  const exitCode = await exec.exec('dotnet', args, options)

  core.debug(`CSharpier exit code: ${exitCode}`)
  core.debug(`CSharpier stdout: ${stdout}`)
  if (stderr) {
    core.debug(`CSharpier stderr: ${stderr}`)
  }

  const unformattedFiles = parseCSharpierOutput(stdout, exitCode)

  return {
    exitCode,
    stdout,
    stderr,
    unformattedFiles
  }
}

/**
 * Parse CSharpier output to extract list of unformatted files
 *
 * @param output - The stdout from CSharpier
 * @param exitCode - The exit code from CSharpier
 * @returns Array of file paths that are not formatted
 */
function parseCSharpierOutput(output: string, exitCode: number): string[] {
  // Exit code 0 means all files are formatted
  if (exitCode === 0) {
    return []
  }

  // Exit code 1 means there are unformatted files
  // Exit code 2+ means there was an error
  if (exitCode >= 2) {
    return []
  }

  // Parse the output to find unformatted files
  // CSharpier outputs each unformatted file on a separate line
  const lines = output.split('\n').map((line) => line.trim())

  // Filter out empty lines and informational messages
  const unformattedFiles = lines.filter(
    (line) =>
      line.length > 0 &&
      !line.includes('Checking') &&
      !line.includes('files') &&
      !line.includes('formatted')
  )

  return unformattedFiles
}
