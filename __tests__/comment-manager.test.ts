/**
 * Unit tests for GitHub PR comment creation and updates
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
  getExistingComments,
  createViolationComments,
  resolveFixedComments
} from '../src/comment-manager.js'
import { MockGitHubAPI } from './mock-github-api.js'
import type { PRFile, ReviewComment } from '../src/github-api.js'
import { writeFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Comment Manager', () => {
  let mockAPI: MockGitHubAPI
  let mockContext: {
    repo: { owner: string; repo: string }
    payload: { pull_request: { number: number; head: { sha: string } } }
  }
  let testDir: string

  beforeEach(async () => {
    mockAPI = new MockGitHubAPI()

    // Create a temporary directory for test files
    testDir = join(tmpdir(), `comment-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    mockContext = {
      repo: {
        owner: 'testowner',
        repo: 'testrepo'
      },
      payload: {
        pull_request: {
          number: 6,
          head: {
            sha: '51636e948d21171db9e00dd63207e52b7ee21210'
          }
        }
      }
    }
  })

  afterEach(async () => {
    // Clean up test files
    await rm(testDir, { recursive: true, force: true })
  })

  describe('createViolationComments', () => {
    it('creates new comment when none exists', async () => {
      // Create test file with unformatted content
      const testFilePath = join(testDir, 'test.cs')
      const unformattedContent = 'class  Test\n{\n}'
      const formattedContent = 'class Test\n{\n}'
      await writeFile(testFilePath, unformattedContent, 'utf8')

      const file: PRFile = {
        filename: testFilePath,
        patch: '@@ -1,3 +1,3 @@\n-class  Test\n+class Test\n {\n }'
      }
      mockAPI.setFiles([file])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        []
      )

      const comments = mockAPI.getComments()
      expect(comments).toHaveLength(1)
      expect(comments[0].path).toBe(testFilePath)
      expect(comments[0].body).toContain('<!-- csharpier-action -->')
      expect(comments[0].body).toContain('```suggestion')
      // Should contain the formatted version
      expect(comments[0].body).toContain('class Test')
      // Should NOT contain the full file if only one line changed
      expect(comments[0].body).not.toContain('class  Test')
    })

    it('replaces comment when existing comment has different content', async () => {
      // Create test file
      const testFilePath = join(testDir, 'test2.cs')
      const unformattedContent = 'class Test\n{\n//Updated\n}'
      const formattedContent = 'class Test\n{\n    // Updated\n}'
      await writeFile(testFilePath, unformattedContent, 'utf8')

      const file: PRFile = {
        filename: testFilePath,
        patch:
          '@@ -1,4 +1,4 @@\n class Test\n {\n-//Updated\n+    // Updated\n }'
      }
      mockAPI.setFiles([file])

      const existingComment: ReviewComment = {
        id: 100,
        path: testFilePath,
        line: 3,
        body: '<!-- csharpier-action -->\nOld formatting suggestion\n\n```suggestion\nold content\n```'
      }
      mockAPI.setComments([existingComment])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        [
          {
            id: 100,
            path: testFilePath,
            body: existingComment.body,
            isResolved: false,
            line: 3
          }
        ]
      )

      const comments = mockAPI.getComments()
      expect(comments).toHaveLength(1)
      // Old comment should be deleted, new comment should have ID 1
      expect(comments[0].id).toBe(1)
      expect(comments[0].body).toContain('// Updated')
      expect(comments[0].body).toContain('<!-- csharpier-action -->')
    })

    it('creates multiple comments for multiple hunks', async () => {
      // Create test file with TWO separate formatting violations
      const testFilePath = join(testDir, 'multi-hunk.cs')
      const unformattedContent = `namespace  TestNamespace
{
    public class Test
    {
        public void Method1() { }
    }
}

public class  AnotherClass
{
    public void Method2() { }
}`
      const formattedContent = `namespace TestNamespace
{
    public class Test
    {
        public void Method1() { }
    }
}

public class AnotherClass
{
    public void Method2() { }
}`
      await writeFile(testFilePath, unformattedContent, 'utf8')

      // PR patch shows changes at line 1 and line 9
      const file: PRFile = {
        filename: testFilePath,
        patch:
          '@@ -1,11 +1,11 @@\n-namespace  TestNamespace\n+namespace TestNamespace\n {\n     public class Test\n     {\n         public void Method1() { }\n     }\n }\n \n-public class  AnotherClass\n+public class AnotherClass\n {\n     public void Method2() { }\n }'
      }
      mockAPI.setFiles([file])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        []
      )

      const comments = mockAPI.getComments()
      // Should create 2 comments: one for each hunk
      expect(comments.length).toBe(2)
      expect(comments[0].line).toBe(1)
      expect(comments[1].line).toBe(9)
      expect(comments[0].body).toContain('namespace TestNamespace')
      expect(comments[1].body).toContain('public class AnotherClass')
    })

    it('generates minimal diff showing only changed sections', async () => {
      // Create test file with multiple lines where only middle section changes
      const testFilePath = join(testDir, 'test-minimal.cs')
      const unformattedContent = `using System;

namespace  TestNamespace
{
    public class  ClassName
    {
        public   string   Field1;
        public int Field2;
    }
}

public class AnotherClass
{
    public void Method() { }
}`
      const formattedContent = `using System;

namespace TestNamespace
{
    public class ClassName
    {
        public string Field1;
        public int Field2;
    }
}

public class AnotherClass
{
    public void Method() { }
}`
      await writeFile(testFilePath, unformattedContent, 'utf8')

      const file: PRFile = {
        filename: testFilePath,
        patch:
          '@@ -1,10 +1,10 @@\n using System;\n \n-namespace  TestNamespace\n+namespace TestNamespace'
      }
      mockAPI.setFiles([file])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        []
      )

      const comments = mockAPI.getComments()
      // Should create multiple comments for multiple hunks
      expect(comments.length).toBeGreaterThanOrEqual(1)
      const body = comments[0].body

      // Should contain the changed section
      expect(body).toContain('namespace TestNamespace')

      // Each comment should be for a specific hunk
      expect(body).toContain('```suggestion')
    })

    it('replaces existing comment even when content is identical', async () => {
      // Create test file
      const testFilePath = join(testDir, 'test3.cs')
      const unformattedContent = 'class  Test\n{\n}'
      const formattedContent = 'class Test\n{\n}'
      await writeFile(testFilePath, unformattedContent, 'utf8')

      const file: PRFile = {
        filename: testFilePath,
        patch: '@@ -1,3 +1,3 @@\n-class  Test\n+class Test\n {\n }'
      }
      mockAPI.setFiles([file])

      const commentBody = `<!-- csharpier-action -->
This section is not formatted according to CSharpier rules.

\`\`\`suggestion
${formattedContent}
\`\`\`

Run \`dotnet csharpier format ${testFilePath}\` to fix the formatting.`

      const existingComment: ReviewComment = {
        id: 100,
        path: testFilePath,
        line: 1,
        body: commentBody
      }
      mockAPI.setComments([existingComment])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        [
          {
            id: 100,
            path: testFilePath,
            body: commentBody,
            isResolved: false,
            line: 1
          }
        ]
      )

      const comments = mockAPI.getComments()
      expect(comments).toHaveLength(1)
      // Old comment deleted, new one created with ID 1
      expect(comments[0].id).toBe(1)
      expect(comments[0].body).toBe(commentBody)
    })
  })

  describe('getExistingComments', () => {
    it('returns only comments created by this action', async () => {
      mockAPI.setComments([
        {
          id: 1,
          path: 'test1.cs',
          body: '<!-- csharpier-action -->\nFormatting issue'
        },
        {
          id: 2,
          path: 'test2.cs',
          body: 'Regular comment without marker'
        },
        {
          id: 3,
          path: 'test3.cs',
          body: '<!-- csharpier-action -->\nAnother formatting issue'
        }
      ])

      const result = await getExistingComments(mockAPI, mockContext)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(3)
    })

    it('identifies resolved comments', async () => {
      mockAPI.setComments([
        {
          id: 1,
          path: 'test.cs',
          body: '<!-- csharpier-action -->\nFormatting issue',
          in_reply_to_id: 999
        }
      ])

      const result = await getExistingComments(mockAPI, mockContext)

      expect(result).toHaveLength(1)
      expect(result[0].isResolved).toBe(true)
    })
  })

  describe('resolveFixedComments', () => {
    it('creates replies for fixed files', async () => {
      const existingComments = [
        {
          id: 1,
          path: 'test1.cs',
          body: '<!-- csharpier-action -->\nIssue',
          isResolved: false
        },
        {
          id: 2,
          path: 'test2.cs',
          body: '<!-- csharpier-action -->\nIssue',
          isResolved: false
        }
      ]

      mockAPI.setComments([
        { id: 1, path: 'test1.cs', body: existingComments[0].body },
        { id: 2, path: 'test2.cs', body: existingComments[1].body }
      ])

      await resolveFixedComments(mockAPI, mockContext, existingComments, [
        'test1.cs'
      ])

      const comments = mockAPI.getComments()
      expect(comments[0].in_reply_to_id).toBe(1)
      expect(comments[1].in_reply_to_id).toBeUndefined()
    })
  })

  describe('PR diff boundary handling', () => {
    it('creates no comments when violations are outside PR diff', async () => {
      // Scenario: File has violations but none in PR-changed lines
      // Behavior: No comments created
      const testFilePath = join(testDir, 'test-outside-diff.cs')
      const unformattedContent = `namespace  TestNamespace
{
    public class Test
    {
        public void Method()
        {
            var x = 1;
        }
    }
}`
      const formattedContent = `namespace TestNamespace
{
    public class Test
    {
        public void Method()
        {
            var x = 1;
        }
    }
}`
      await writeFile(testFilePath, unformattedContent, 'utf8')

      // PR patch shows only unchanged context lines
      const file: PRFile = {
        filename: testFilePath,
        patch: `@@ -5,5 +5,5 @@ namespace  TestNamespace
         public void Method()
         {
             var x = 1;
         }
     }`
      }
      mockAPI.setFiles([file])

      await createViolationComments(
        mockAPI,
        mockContext,
        testFilePath,
        'abc123',
        formattedContent,
        []
      )

      const comments = mockAPI.getComments()
      expect(comments.length).toBe(0)
    })
  })
})
