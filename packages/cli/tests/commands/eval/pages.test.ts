import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCLI } from '#cli-tests/helpers/run'
import * as v from 'valibot'

import { BUILTIN_IO_FORMATS, IORegistry } from '@open-pencil/core/io'
import { SceneGraph } from '@open-pencil/scene-graph'

let directory: string
let file: string

const resultSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    current: v.string(),
    pages: v.array(v.object({ name: v.string(), layers: v.array(v.string()) }))
  })
)

const inspection = `return {
  current: figma.currentPage.name,
  pages: figma.root.children.map(page => ({
    name: page.name,
    layers: page.children.map(layer => layer.name)
  }))
}`

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'open-pencil-eval-pages-'))
  file = join(directory, 'pages.fig')
  const graph = new SceneGraph()
  const [first] = graph.getPages()
  first.name = 'Alpha'
  for (const page of [first, graph.addPage('Beta'), graph.addPage('Gamma, archive')]) {
    graph.createNode('RECTANGLE', page.id, { name: `${page.name} layer`, width: 100, height: 40 })
  }
  const io = new IORegistry(BUILTIN_IO_FORMATS)
  await Bun.write(file, (await io.writeDocument('fig', graph)).data)
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function inspect(options: string[] = [], source = file) {
  const result = await runCLI(['eval', source, ...options, '--code', inspection, '--json'])
  if (result.exitCode !== 0) throw new Error(result.stderr)
  return v.parse(resultSchema, result.stdout)
}

describe('eval page selection', () => {
  test('keeps the default whole-document behavior', async () => {
    expect(await inspect()).toEqual({
      current: 'Alpha',
      pages: [
        { name: 'Alpha', layers: ['Alpha layer'] },
        { name: 'Beta', layers: ['Beta layer'] },
        { name: 'Gamma, archive', layers: ['Gamma, archive layer'] }
      ]
    })
  })

  test('loads only the named page, including skipping the default first page', async () => {
    expect(await inspect(['--page', 'Beta'])).toEqual({
      current: 'Beta',
      pages: [
        { name: 'Alpha', layers: [] },
        { name: 'Beta', layers: ['Beta layer'] },
        { name: 'Gamma, archive', layers: [] }
      ]
    })
  })

  test('accepts repeated exact names and makes the first selected page current', async () => {
    expect(await inspect(['--page', 'Gamma, archive', '--page', 'Beta', '--page', 'Beta'])).toEqual(
      {
        current: 'Gamma, archive',
        pages: [
          { name: 'Alpha', layers: [] },
          { name: 'Beta', layers: ['Beta layer'] },
          { name: 'Gamma, archive', layers: ['Gamma, archive layer'] }
        ]
      }
    )
  })

  test('supports stdin with a selected page', async () => {
    const result = await runCLI(['eval', file, '--page', 'Beta', '--stdin'], {
      stdin: 'return figma.currentPage.name'
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('"Beta"')
  })

  test('reports a missing page and never runs the script', async () => {
    const result = await runCLI([
      'eval',
      file,
      '--page',
      'Beta',
      '--page',
      'Missing',
      '--code',
      'throw new Error("script ran")'
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('Page "Missing" not found')
    expect(result.stderr).toContain('Alpha')
    expect(result.stderr).not.toContain('script ran')
  })

  test('rejects an empty page name', async () => {
    const result = await runCLI(['eval', file, '--page=', '--code', 'return 1'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('--page requires a page name')
  })

  test('rejects --page in app mode before connecting', async () => {
    const result = await runCLI(['eval', '--page', 'Beta', '--code', 'return 1'])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('Use --page-id')
  })

  test('saves selected-page edits while preserving unselected pages', async () => {
    const output = join(directory, 'edited.fig')
    const result = await runCLI([
      'eval',
      file,
      '--page',
      'Beta',
      '--output',
      output,
      '--quiet',
      '--code',
      'figma.currentPage.children[0].name = "Changed"'
    ])
    if (result.exitCode !== 0) throw new Error(result.stderr)
    expect(await inspect([], output)).toEqual({
      current: 'Alpha',
      pages: [
        { name: 'Alpha', layers: ['Alpha layer'] },
        { name: 'Beta', layers: ['Changed'] },
        { name: 'Gamma, archive', layers: ['Gamma, archive layer'] }
      ]
    })
  })
})
