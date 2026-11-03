import { compact, uniq } from 'es-toolkit/array'

import type { SceneGraph } from '../graph'
import { instanceMainComponent } from '../instances/main-component'
import type { ComponentPropertyDefinition, SceneNode } from '../types'

/** Variants in reading order on the canvas: top to bottom, then left to right, then by name. */
export function compareCanvasPosition(a: SceneNode, b: SceneNode): number {
  return a.y - b.y || a.x - b.x || a.name.localeCompare(b.name)
}

/**
 * Whether `a` comes before `b` reading the set as Figma does: variants whose rows overlap, edges
 * touching included, read left to right, and others top to bottom.
 */
function readsBefore(a: SceneNode, b: SceneNode): boolean {
  const sameRow = a.y <= b.y + b.height && b.y <= a.y + a.height
  return sameRow ? a.x < b.x || (a.x === b.x && a.y < b.y) : a.y < b.y
}

/**
 * A component set's default variant, the one an instance starts as: the first in reading order,
 * and the first in layer order of those at the same place (measured in Figma desktop 126).
 */
export function defaultVariant(graph: SceneGraph, set: SceneNode): SceneNode | undefined {
  let first: SceneNode | undefined
  for (const child of graph.getChildren(set.id)) {
    if (child.type !== 'COMPONENT') continue
    if (!first || readsBefore(child, first)) first = child
  }
  return first
}

/**
 * The value a variant property starts at: the default variant's, as Figma reads it whatever
 * default the document records, and follows when another variant moves to the top left. The
 * recorded default stands only while the default variant has no value for the property.
 */
export function variantDefaultValue(
  graph: SceneGraph,
  set: SceneNode,
  property: { name: string; defaultValue: string }
): string {
  const value = defaultVariant(graph, set)?.componentPropertyValues[property.name]
  return value || property.defaultValue
}

/**
 * A variant property's values: the ones the document records, then any its variants use that it
 * does not, since older documents record none and a set's page may have loaded only some
 * variants.
 */
export function variantOptions(
  graph: SceneGraph,
  set: SceneNode,
  property: { name: string; variantOptions?: string[] }
): string[] {
  const used = graph
    .getChildren(set.id)
    .map((child) =>
      child.type === 'COMPONENT' ? child.componentPropertyValues[property.name] : ''
    )
  return compact(uniq([...(property.variantOptions ?? []), ...used]))
}

/** A set's definition with a variant property's values and default filled in from its variants. */
export function resolvedVariantDefinition(
  graph: SceneGraph,
  set: SceneNode,
  definition: ComponentPropertyDefinition
): ComponentPropertyDefinition {
  if (definition.type !== 'VARIANT') return definition
  const options = { ...definition, variantOptions: variantOptions(graph, set, definition) }
  return { ...options, defaultValue: variantDefaultValue(graph, set, options) }
}

export type VariantLookup = (
  set: SceneNode,
  values: Readonly<Record<string, string>>
) => SceneNode | undefined

interface IndexedVariants {
  propertyNames: string[]
  byValues: Map<string, SceneNode>
}

function variantValuesKey(
  propertyNames: readonly string[],
  values: Readonly<Partial<Record<string, string>>>
): string | undefined {
  const ordered = propertyNames.map((name) => values[name])
  return ordered.every((value) => value !== undefined) ? JSON.stringify(ordered) : undefined
}

function indexVariants(graph: SceneGraph, set: SceneNode): IndexedVariants {
  const propertyNames = set.componentPropertyDefinitions
    .filter((definition) => definition.type === 'VARIANT')
    .map((definition) => definition.name)
  const byValues = new Map<string, SceneNode>()
  for (const variant of graph.getChildren(set.id)) {
    if (variant.type !== 'COMPONENT') {
      continue
    }
    const key = variantValuesKey(propertyNames, variant.componentPropertyValues)
    if (key === undefined) {
      continue
    }
    const indexed = byValues.get(key)
    if (!indexed || readsBefore(variant, indexed)) {
      byValues.set(key, variant)
    }
  }
  return { propertyNames, byValues }
}

export interface InstanceVariant {
  component: SceneNode
  set: SceneNode
}

export function instanceVariant(
  graph: SceneGraph,
  instance: SceneNode
): InstanceVariant | undefined {
  const component = instanceMainComponent(graph, instance)
  const set = component?.parentId ? graph.getNode(component.parentId) : undefined
  return component && set?.type === 'COMPONENT_SET' ? { component, set } : undefined
}

export function variantPropertyDefinition(
  set: SceneNode,
  key: string
): ComponentPropertyDefinition | undefined {
  const definitions = set.componentPropertyDefinitions
  return (
    definitions.find((definition) => definition.type === 'VARIANT' && definition.id === key) ??
    definitions.find((definition) => definition.type === 'VARIANT' && definition.name === key)
  )
}

export function createVariantLookup(graph: SceneGraph): VariantLookup {
  const sets = new Map<string, IndexedVariants>()
  return (set, values) => {
    let indexed = sets.get(set.id)
    if (!indexed) {
      indexed = indexVariants(graph, set)
      sets.set(set.id, indexed)
    }
    const key = variantValuesKey(indexed.propertyNames, values)
    return key === undefined ? undefined : indexed.byValues.get(key)
  }
}
