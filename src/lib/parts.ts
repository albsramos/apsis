import { moduleName, segmentName, wingName } from '@/sim/faults'
import type { PartRef } from '@/sim/types'

export function partName(p: PartRef) {
  switch (p.kind) {
    case 'module':
      return `Module ${moduleName(p.index)}`
    case 'radiator':
      return `Radiator ${segmentName(p.index)}`
    case 'wing':
      return `Solar wing ${wingName(p.index)}`
    case 'loop':
      return 'Coolant loop'
    case 'dish':
      return 'Comms & power bus'
  }
}

export const samePart = (a: PartRef | null | undefined, b: PartRef | null | undefined) =>
  !!a && !!b && a.kind === b.kind && ('index' in a ? a.index : -1) === ('index' in b ? b.index : -1)
