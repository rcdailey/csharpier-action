/**
 * Mock GitHub API implementation for testing
 */

import type {
  GitHubAPI,
  PRFile,
  ReviewComment,
  CreateReviewCommentParams,
  UpdateReviewCommentParams,
  CreateReplyParams
} from '../src/github-api.js'

/**
 * In-memory mock implementation of GitHubAPI for testing
 */
export class MockGitHubAPI implements GitHubAPI {
  private files: PRFile[] = []
  private comments: ReviewComment[] = []
  private nextCommentId = 1

  /** Set the files that should be returned by listFiles */
  setFiles(files: PRFile[]): void {
    this.files = files
  }

  /** Set the comments that should be returned by listReviewComments */
  setComments(comments: ReviewComment[]): void {
    this.comments = comments
  }

  /** Get all current comments (for assertions) */
  getComments(): ReviewComment[] {
    return this.comments
  }

  async listFiles(): Promise<PRFile[]> {
    return this.files
  }

  async listReviewComments(): Promise<ReviewComment[]> {
    return this.comments
  }

  async createReviewComment(params: CreateReviewCommentParams): Promise<void> {
    const comment: ReviewComment = {
      id: this.nextCommentId++,
      path: params.path,
      body: params.body,
      line: params.line
    }
    this.comments.push(comment)
  }

  async updateReviewComment(params: UpdateReviewCommentParams): Promise<void> {
    const comment = this.comments.find((c) => c.id === params.comment_id)
    if (comment) {
      comment.body = params.body
    }
  }

  async createReplyForReviewComment(params: CreateReplyParams): Promise<void> {
    const comment = this.comments.find((c) => c.id === params.comment_id)
    if (comment) {
      comment.in_reply_to_id = params.comment_id
    }
  }
}
