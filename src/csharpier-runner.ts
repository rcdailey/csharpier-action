/**
 * Module for installing and running CSharpier
 */

import * as core from '@actions/core'
import * as exec from '@actions/exec'

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
 * Format multiple files with CSharpier using pipe-files mode
 *
 * @param files - Array of file paths to format
 * @returns Map of file path to formatted content
 */
export async function formatFiles(
  files: string[]
): Promise<Map<string, string>> {
  if (files.length === 0) {
    core.info('No files to format')
    return new Map<string, string>()
  }

  core.info(`Formatting ${files.length} file(s) with CSharpier`)

  const fs = await import('fs/promises')
  const csharpierPath = `${process.env.HOME}/.dotnet/tools/csharpier`

  // Build input: path\u0003content\u0003path\u0003content\u0003
  const inputParts: string[] = []
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8')
    inputParts.push(filePath, '\u0003', content, '\u0003')
  }
  const input = inputParts.join('')

  let stdout = ''
  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    input: Buffer.from(input),
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      }
    }
  }

  // Run: csharpier pipe-files
  const exitCode = await exec.exec(csharpierPath, ['pipe-files'], options)

  core.debug(`CSharpier pipe-files exit code: ${exitCode}`)

  // Parse output: split on \u0003 delimiter
  const results = stdout.split('\u0003').filter((s) => s.length > 0)

  // Map files to their formatted content
  const formattedMap = new Map<string, string>()
  for (let i = 0; i < files.length && i < results.length; i++) {
    formattedMap.set(files[i], results[i])
  }

  return formattedMap
}
