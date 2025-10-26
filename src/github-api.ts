/**
 * Abstraction layer for GitHub API operations
 */

import type * as github from '@actions/github'

/** PR file information */
export interface PRFile {
  filename: string
  patch?: string
}

/** PR review comment */
export interface ReviewComment {
  id: number
  path: string
  body: string | null
  in_reply_to_id?: number
  line?: number
  original_line?: number
}

/** Parameters for creating a review comment */
export interface CreateReviewCommentParams {
  owner: string
  repo: string
  pull_number: number
  body: string
  commit_id: string
  path: string
  line: number
  side: string
}

/** Parameters for updating a review comment */
export interface UpdateReviewCommentParams {
  owner: string
  repo: string
  comment_id: number
  body: string
}

/** Parameters for creating a reply to a review comment */
export interface CreateReplyParams {
  owner: string
  repo: string
  pull_number: number
  comment_id: number
  body: string
}

/**
 * GitHub API abstraction for testability
 */
export interface GitHubAPI {
  /** List files in a pull request */
  listFiles(params: {
    owner: string
    repo: string
    pull_number: number
  }): Promise<PRFile[]>

  /** List review comments on a pull request */
  listReviewComments(params: {
    owner: string
    repo: string
    pull_number: number
  }): Promise<ReviewComment[]>

  /** Create a new review comment */
  createReviewComment(params: CreateReviewCommentParams): Promise<void>

  /** Update an existing review comment */
  updateReviewComment(params: UpdateReviewCommentParams): Promise<void>

  /** Create a reply to an existing review comment */
  createReplyForReviewComment(params: CreateReplyParams): Promise<void>
}

/**
 * Real GitHub API implementation using Octokit
 */
export class OctokitGitHubAPI implements GitHubAPI {
  constructor(private octokit: ReturnType<typeof github.getOctokit>) {}

  async listFiles(params: {
    owner: string
    repo: string
    pull_number: number
  }): Promise<PRFile[]> {
    const { data } = await this.octokit.rest.pulls.listFiles(params)
    return data.map((f) => ({
      filename: f.filename,
      patch: f.patch
    }))
  }

  async listReviewComments(params: {
    owner: string
    repo: string
    pull_number: number
  }): Promise<ReviewComment[]> {
    const { data } = await this.octokit.rest.pulls.listReviewComments(params)
    return data.map((c) => ({
      id: c.id,
      path: c.path,
      body: c.body,
      line: c.line ?? undefined,
      original_line: c.original_line ?? undefined,
      in_reply_to_id: c.in_reply_to_id
    }))
  }

  async createReviewComment(params: CreateReviewCommentParams): Promise<void> {
    await this.octokit.rest.pulls.createReviewComment({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pull_number,
      body: params.body,
      commit_id: params.commit_id,
      path: params.path,
      line: params.line,
      side: params.side as 'LEFT' | 'RIGHT'
    })
  }

  async updateReviewComment(params: UpdateReviewCommentParams): Promise<void> {
    await this.octokit.rest.pulls.updateReviewComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: params.comment_id,
      body: params.body
    })
  }

  async createReplyForReviewComment(params: CreateReplyParams): Promise<void> {
    await this.octokit.rest.pulls.createReplyForReviewComment({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pull_number,
      comment_id: params.comment_id,
      body: params.body
    })
  }
}
