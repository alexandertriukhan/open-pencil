import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'
import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm'

import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'
import { percentLength } from '@open-pencil/scene-graph/text'

import type { TextLayout } from '#core/canvas/text/layout'
import { buildParagraph } from '#core/canvas/text/layout/build'
import { getCanvasKit } from '#core/canvaskit'
import { fontManager } from '#core/text/font/manager'

const INTER_CAP_HEIGHT_EMS = 1490 / 2048
const BADGE_FONT_SIZES = [12, 14, 16, 18, 24, 28, 32]
const SURFACE_SIZE = 200

let ck: CanvasKit
let provider: TypefaceFontProvider

function layOut(props: Partial<SceneNode>): TextLayout {
  const graph = new SceneGraph()
  const node = graph.createNode('TEXT', graph.getPages()[0].id, {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: percentLength(110),
    leadingTrim: 'CAP_HEIGHT',
    textAutoResize: 'WIDTH_AND_HEIGHT',
    width: 100,
    height: 100,
    ...props
  })
  return buildParagraph({ ck, fontProvider: provider, fontsLoaded: true }, node, undefined, {
    halfLeading: true
  })
}

function inkTop(layout: TextLayout): number {
  const surface = expectDefined(ck.MakeSurface(SURFACE_SIZE, SURFACE_SIZE), 'surface')
  try {
    const canvas = surface.getCanvas()
    canvas.clear(ck.WHITE)
    layout.draw(canvas, 0, 0)
    const pixels = expectDefined(
      canvas.readPixels(0, 0, {
        width: SURFACE_SIZE,
        height: SURFACE_SIZE,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB
      }),
      'pixels'
    )
    for (let y = 0; y < SURFACE_SIZE; y++) {
      for (let x = 0; x < SURFACE_SIZE; x++) {
        if (pixels[(y * SURFACE_SIZE + x) * 4] < 128) {
          return y
        }
      }
    }
    return -1
  } finally {
    surface.delete()
  }
}

describe('cap-height leading trim', () => {
  beforeAll(async () => {
    ck = await getCanvasKit()
    provider = ck.TypefaceFontProvider.Make()
    fontManager.attachProvider(ck, provider)
    const inter = expectDefined(
      await fontManager.fetchBundledFont('/InterVariable.ttf'),
      'bundled Inter font'
    )
    provider.registerFont(inter, 'Inter')
    await fontManager.markLoaded('Inter', 'Regular', inter)
  })

  afterAll(() => {
    fontManager.detachProvider(provider)
    provider.delete()
  })

  test('sets a digit of each size from its cap height down to its baseline', () => {
    for (const fontSize of BADGE_FONT_SIZES) {
      const capHeight = INTER_CAP_HEIGHT_EMS * fontSize
      const layout = layOut({ text: '75', fontSize })
      const baseline = expectDefined(layout.getLineMetrics().at(0), 'line').baseline
      expect(baseline).toBeCloseTo(capHeight, 2)
      expect(layout.getHeight()).toBeCloseTo(capHeight, 2)
      expect(inkTop(layout)).toBeLessThanOrEqual(1)
      layout.delete()
    }
  })

  test('trims a text of several lines to its first cap height and last baseline', () => {
    const layout = layOut({ text: '75\n50', fontSize: 20 })
    const lines = layout.getLineMetrics()
    expect(lines).toHaveLength(2)
    const capHeight = INTER_CAP_HEIGHT_EMS * 20
    expect(lines[0].baseline).toBeCloseTo(capHeight, 2)
    expect(layout.getHeight()).toBeCloseTo(lines[1].baseline, 2)
    expect(lines[1].baseline - lines[0].baseline).toBeCloseTo(22, 0)
    layout.delete()
  })

  test('keeps the line box of untrimmed text', () => {
    const layout = layOut({ text: '75', fontSize: 20, leadingTrim: 'NONE' })
    expect(layout.getHeight()).toBeCloseTo(22, 0)
    layout.delete()
  })
})
