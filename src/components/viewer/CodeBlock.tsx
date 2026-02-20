import clsx from 'clsx'
import { Check, Copy, WrapText } from 'lucide-react'
import type { Language } from 'prism-react-renderer'
import { Highlight, Prism, themes } from 'prism-react-renderer'
import { useEffect, useMemo, useState } from 'react'

interface CodeBlockProps {
  text: string
  lang?: string
  highlightLine?: number
}

const prismWindow = globalThis as typeof globalThis & { Prism?: typeof Prism }
if (!prismWindow.Prism) {
  prismWindow.Prism = Prism
}

const componentLoaders: Record<string, string[]> = {
  text: [],
  javascript: ['javascript'],
  jsx: ['javascript', 'jsx'],
  css: ['css'],
  scss: ['css', 'scss'],
  sass: ['sass'],
  typescript: ['javascript', 'typescript'],
  tsx: ['javascript', 'jsx', 'typescript', 'tsx'],
  ini: ['ini'],
  yaml: ['yaml'],
  toml: ['toml'],
  bash: ['bash'],
  powershell: ['powershell'],
  markup: ['markup'],
  markdown: ['markup', 'markdown'],
  python: ['python'],
  go: ['go'],
  php: ['php'],
  docker: ['docker'],
  json: ['json'],
  lua: ['lua'],
  sql: ['sql'],
}

const componentImporters: Record<string, () => Promise<unknown>> = {
  javascript: () => import('prismjs/components/prism-javascript.js'),
  jsx: () => import('prismjs/components/prism-jsx.js'),
  css: () => import('prismjs/components/prism-css.js'),
  scss: () => import('prismjs/components/prism-scss.js'),
  sass: () => import('prismjs/components/prism-sass.js'),
  typescript: () => import('prismjs/components/prism-typescript.js'),
  tsx: () => import('prismjs/components/prism-tsx.js'),
  ini: () => import('prismjs/components/prism-ini.js'),
  yaml: () => import('prismjs/components/prism-yaml.js'),
  toml: () => import('prismjs/components/prism-toml.js'),
  bash: () => import('prismjs/components/prism-bash.js'),
  powershell: () => import('prismjs/components/prism-powershell.js'),
  markup: () => import('prismjs/components/prism-markup.js'),
  markdown: () => import('prismjs/components/prism-markdown.js'),
  python: () => import('prismjs/components/prism-python.js'),
  go: () => import('prismjs/components/prism-go.js'),
  php: () => import('prismjs/components/prism-php.js'),
  docker: () => import('prismjs/components/prism-docker.js'),
  json: () => import('prismjs/components/prism-json.js'),
  lua: () => import('prismjs/components/prism-lua.js'),
  sql: () => import('prismjs/components/prism-sql.js'),
}

const aliasMap: Record<string, keyof typeof componentLoaders> = {
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  conf: 'ini',
  ini: 'ini',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  powershell: 'powershell',
  pwsh: 'powershell',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  python: 'python',
  go: 'go',
  php: 'php',
  dockerfile: 'docker',
  docker: 'docker',
  json: 'json',
  lua: 'lua',
  sql: 'sql',
  sqlite: 'sql',
  txt: 'text',
  text: 'text',
}

const loadedComponents = new Set<string>()
const languageLoadTasks = new Map<string, Promise<void>>()

export function CodeBlock({ text, lang, highlightLine }: CodeBlockProps) {
  const [languageReady, setLanguageReady] = useState(false)
  const [wrapLines, setWrapLines] = useState(false)
  const [copied, setCopied] = useState(false)
  const resolvedLanguage = useMemo(() => resolveLanguage(lang), [lang])

  useEffect(() => {
    let cancelled = false
    setLanguageReady(false)
    ensureLanguageLoaded(resolvedLanguage).finally(() => {
      if (!cancelled) {
        setLanguageReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [resolvedLanguage])

  const lines = useMemo(() => text.split(/\r?\n/), [text])
  const displayText = useMemo(() => lines.join('\n'), [lines])

  return (
    <div className={clsx('code-block', wrapLines && 'is-wrap')}>
      {lang && <div className="code-block-lang">{lang}</div>}
      <div className="code-block-toolbar">
        <button
          type="button"
          className="icon-button code-tool-btn"
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied code block' : 'Copy code block'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className={clsx('icon-button code-tool-btn', wrapLines && 'active')}
          title={wrapLines ? 'Disable line wrap' : 'Wrap long lines'}
          aria-label={wrapLines ? 'Disable line wrap' : 'Wrap long lines'}
          onClick={() => setWrapLines((prev) => !prev)}
        >
          <WrapText size={13} />
        </button>
      </div>
      <div className="code-block-preview">
        {languageReady && resolvedLanguage !== 'text' ? (
          <Highlight theme={themes.oneDark} code={displayText} language={resolvedLanguage as Language}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={className} style={style}>
                {tokens.map((line, lineIndex) => {
                  const actualLine = lineIndex
                  const isHit = typeof highlightLine === 'number' && actualLine === highlightLine
                  const lineProps = getLineProps({ line, key: lineIndex })
                  return (
                    <div
                      key={lineIndex}
                      {...lineProps}
                      className={clsx('code-line', lineProps.className, isHit && 'hit')}
                    >
                      <span className="code-line-number">{actualLine + 1}</span>
                      <span className="code-line-content">
                        {line.length === 0 ? (
                          <span>&nbsp;</span>
                        ) : (
                          line.map((token, tokenIndex) => (
                            <span key={tokenIndex} {...getTokenProps({ token, key: tokenIndex })} />
                          ))
                        )}
                      </span>
                    </div>
                  )
                })}
              </pre>
            )}
          </Highlight>
        ) : (
          lines.map((line, idx) => {
            const actualLine = idx
            const isHit = typeof highlightLine === 'number' && actualLine === highlightLine
            return (
              <pre key={`${line}-${idx}`} className={clsx('code-line', isHit && 'hit')}>
                <span className="code-line-number">{actualLine + 1}</span>
                <code className="code-line-content">{line || '\u00A0'}</code>
              </pre>
            )
          })
        )}
      </div>
    </div>
  )
}

function resolveLanguage(lang?: string): keyof typeof componentLoaders {
  if (!lang) {
    return 'text'
  }
  const key = lang.trim().toLowerCase()
  return aliasMap[key] ?? 'text'
}

async function ensureLanguageLoaded(language: keyof typeof componentLoaders): Promise<void> {
  const existingTask = languageLoadTasks.get(language)
  if (existingTask) {
    return existingTask
  }
  const task = loadComponents(language)
  languageLoadTasks.set(language, task)
  await task
}

async function loadComponents(language: keyof typeof componentLoaders): Promise<void> {
  const components = componentLoaders[language] ?? []
  for (const component of components) {
    if (loadedComponents.has(component)) {
      continue
    }
    const importComponent = componentImporters[component]
    if (!importComponent) {
      continue
    }
    try {
      await importComponent()
      loadedComponents.add(component)
    } catch {
      // Ignore missing language definitions and keep plain text rendering fallback.
    }
  }
}
