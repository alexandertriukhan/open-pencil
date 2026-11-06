import { printError } from '#cli/format'
import {
  loadDocument,
  measureDocumentText,
  populateDocumentPage,
  populateWholeDocument,
  requirePage
} from '#cli/headless'
import { createHeadlessFigma } from '#cli/tool-data'

/** Prepares a file's selected pages and fonts before its script runs. */
export async function loadEvalDocument(file: string, pageNames?: string | readonly string[]) {
  // Citty returns an array when a string option is repeated.
  const names = typeof pageNames === 'string' ? [pageNames] : pageNames
  if (names?.some((name) => name.length === 0)) {
    printError('--page requires a page name.')
    process.exit(1)
  }
  const graph = await loadDocument(file, { populate: names ? 'none' : 'first-page' })
  // Resolve every name before populating anything, so a typo never runs a partial selection.
  const pages = names?.map((name) => requirePage(graph, name))
  if (pages) {
    for (const page of pages) populateDocumentPage(graph, page.id)
  } else {
    populateWholeDocument(graph)
  }
  await measureDocumentText(
    graph,
    pages?.map((page) => page.id)
  )
  const figma = await createHeadlessFigma(graph)
  if (pages?.[0]) {
    const page = figma.getNodeById(pages[0].id)
    if (page) figma.currentPage = page
  }
  return { graph, figma }
}
