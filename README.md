# CSharpier Action

[![CI](https://github.com/rcdailey/csharpier-action/actions/workflows/ci.yml/badge.svg)](https://github.com/rcdailey/csharpier-action/actions/workflows/ci.yml)
[![Check
dist/](https://github.com/rcdailey/csharpier-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/rcdailey/csharpier-action/actions/workflows/check-dist.yml)

A GitHub Action that runs [CSharpier](https://csharpier.com) formatting checks
on pull requests and provides inline review comments for formatting violations.

## Features

- **Automated Formatting Checks**: Runs `dotnet csharpier check` on C# files
  changed in pull requests
- **Inline Review Comments**: Leaves review comments on files with formatting
  violations
- **Auto-Resolution**: Automatically resolves comments when formatting
  violations are fixed
- **Silent Success**: No comments posted when all files are properly formatted
- **Error Handling**: Fails the check run if CSharpier encounters errors

## Usage

### Basic Example

```yaml
name: CSharpier Check

on:
  pull_request:

concurrency:
  group: csharpier-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  format-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0'

      - uses: rcdailey/csharpier-action@v1
        with:
          command: check
```

### With Specific CSharpier Version

```yaml
- uses: rcdailey/csharpier-action@v1
  with:
    command: check
    csharpier-version: '0.30.2'
```

## Inputs

| Input               | Description                                          | Required | Default               |
| ------------------- | ---------------------------------------------------- | -------- | --------------------- |
| `command`           | Command to run (currently only `check` is supported) | Yes      | -                     |
| `csharpier-version` | Version of CSharpier to install                      | No       | `latest`              |
| `github-token`      | GitHub token for API access                          | No       | `${{ github.token }}` |

## Outputs

| Output             | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `violations-found` | Whether formatting violations were found (`true`/`false`) |

## How It Works

1. **Installation**: Installs CSharpier as a global dotnet tool
1. **File Detection**: Fetches all C# files (`.cs`, `.csx`) changed in the pull
   request
1. **Format Check**: Runs `dotnet csharpier check` on changed files
1. **Comment Management**:
   - Creates review comments on files with formatting violations
   - Resolves existing comments when violations are fixed
   - Avoids duplicate comments on already-flagged files
1. **Status**: Fails the check run if violations are found or if CSharpier
   errors occur

## Requirements

- Runs only on `pull_request` events
- Requires `pull-requests: write` permission
- Requires .NET to be installed (via `actions/setup-dotnet`)

## Concurrency

To cancel previous runs when new commits are pushed, use the `concurrency`
configuration:

```yaml
concurrency:
  group: csharpier-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
