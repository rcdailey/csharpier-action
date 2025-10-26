/**
 * Unit tests for CSharpier runner
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { formatFiles } from '../src/csharpier-runner.js'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('CSharpier formatFiles', () => {
  let testDir: string

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = join(tmpdir(), `csharpier-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up test files
    await rm(testDir, { recursive: true, force: true })
  })

  it('formats multiple files in batch', async () => {
    // Arrange: Create test files with bad formatting
    const file1Path = join(testDir, 'file1.cs')
    const file2Path = join(testDir, 'file2.cs')

    await writeFile(file1Path, 'namespace  Test1 { }', 'utf8')
    await writeFile(file2Path, 'namespace  Test2 { }', 'utf8')

    // Act: Format both files
    const result = await formatFiles([file1Path, file2Path])

    // Assert: Should return formatted content for both files
    expect(result.size).toBe(2)
    expect(result.get(file1Path)).toContain('namespace Test1')
    expect(result.get(file2Path)).toContain('namespace Test2')
  }, 30000)

  it('handles empty file list', async () => {
    // Act: Format no files
    const result = await formatFiles([])

    // Assert: Should return empty map
    expect(result.size).toBe(0)
  }, 30000)

  it('formats complex C# code correctly', async () => {
    // Arrange: Create file with complex formatting issues
    const filePath = join(testDir, 'complex.cs')
    const unformattedCode = `namespace  TestNamespace
{
    public class  ClassName
    {
        public   string   Field1;
        public int  Field2;
    }
}`

    await writeFile(filePath, unformattedCode, 'utf8')

    // Act: Format the file
    const result = await formatFiles([filePath])

    // Assert: Should return properly formatted code
    const formatted = result.get(filePath)!
    expect(formatted).toContain('namespace TestNamespace')
    expect(formatted).toContain('public class ClassName')
    expect(formatted).toContain('public string Field1;')
    expect(formatted).toContain('public int Field2;')
    // Verify no multiple consecutive spaces in declarations (indentation is ok)
    expect(formatted).not.toMatch(/\w  +\w/) // No double+ spaces between words
  }, 30000)
})
