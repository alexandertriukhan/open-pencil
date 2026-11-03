import { fontManager } from '#core/text/font/manager'
import { fontTableView } from '#core/text/font/variation'

const HEAD_UNITS_PER_EM = 18
const OS2_FIRST_VERSION_WITH_CAP_HEIGHT = 2
const OS2_CAP_HEIGHT = 88

const capHeights = new WeakMap<ArrayBuffer, number | null>()

function readCapHeightEms(data: ArrayBuffer): number | null {
  const head = fontTableView(data, 'head')
  const os2 = fontTableView(data, 'OS/2')
  if (!head || head.byteLength < HEAD_UNITS_PER_EM + 2) {
    return null
  }
  if (!os2 || os2.byteLength < OS2_CAP_HEIGHT + 2) {
    return null
  }
  if (os2.getUint16(0) < OS2_FIRST_VERSION_WITH_CAP_HEIGHT) {
    return null
  }
  const unitsPerEm = head.getUint16(HEAD_UNITS_PER_EM)
  const capHeight = os2.getInt16(OS2_CAP_HEIGHT)
  return unitsPerEm > 0 && capHeight > 0 ? capHeight / unitsPerEm : null
}

export function capHeightEms(family: string, style: string): number | null {
  const data = fontManager.loadedData(family, style)
  if (!data) {
    return null
  }
  let capHeight = capHeights.get(data)
  if (capHeight === undefined) {
    capHeight = readCapHeightEms(data)
    capHeights.set(data, capHeight)
  }
  return capHeight
}
