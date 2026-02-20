#!/usr/bin/env node

import process from 'node:process'

const tagPattern = /^v\d+\.\d+\.\d+$/

function isValidTag(tag) {
  return tagPattern.test(tag)
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1 || index + 1 >= process.argv.length) return null
  return process.argv[index + 1]
}

function validateTagOrFail(tag) {
  if (!isValidTag(tag)) {
    fail(`Invalid tag '${tag}'. Expected format: vMAJOR.MINOR.PATCH (e.g. v1.2.3).`)
  }
}

const explicitRef = getArgValue('--ref')
if (explicitRef) {
  validateTagOrFail(explicitRef)
  process.exit(0)
}

const useStdin = process.argv.includes('--stdin')
if (useStdin) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    input += chunk
  })
  process.stdin.on('end', () => {
    const lines = input.trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const [localRef] = line.split(/\s+/)
      if (!localRef?.startsWith('refs/tags/')) continue
      const tag = localRef.replace('refs/tags/', '')
      validateTagOrFail(tag)
    }
    process.exit(0)
  })
  process.stdin.on('error', () => process.exit(0))
} else if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
  validateTagOrFail(process.env.GITHUB_REF_NAME)
  process.exit(0)
} else {
  process.exit(0)
}
