import { arc, node, p, segments, type FactoryDef } from './build'

/** A ring with a cross through the middle: machining around the outside, assembly on the cross. */
const nodes = [
  node('IN', 'entry', 'Inbound', 20, 330),
  node('W', 'station', 'Receiving', 100, 330, 'R1'),
  node('A1', 'station', 'Machining 1', 250, 130, 'M1'),
  node('T', 'station', 'Machining 2', 450, 130, 'M2'),
  node('A2', 'station', 'Wash', 650, 130, 'W1'),
  node('E', 'station', 'Dispatch check', 800, 330, 'D1'),
  node('B2', 'station', 'Rework', 650, 530, 'RW'),
  node('B', 'station', 'Calibration', 450, 530, 'C1'),
  node('B1', 'station', 'Kitting', 250, 530, 'K1'),
  node('L', 'station', 'Sub-assembly', 275, 330, 'A1'),
  node('C', 'station', 'Main assembly', 450, 330, 'A2'),
  node('R', 'station', 'End-of-line test', 625, 330, 'T1'),
  node('OUT', 'exit', 'Outbound', 880, 330),
]

const processSec: Record<string, number> = { W: 3, A1: 6, T: 5, A2: 5, E: 3, B2: 7, B: 5, B1: 5, L: 6, C: 5, R: 5, OUT: 3 }

export const shanghai: FactoryDef = {
  factory: { id: 'cn-shanghai', name: 'Shanghai', location: 'Lingang, CN', layoutVersion: 6 },
  layout: {
    factoryId: 'cn-shanghai',
    version: 6,
    width: 900,
    height: 660,
    nodes,
    segments: segments(nodes, processSec, [
      ['IN-W', 'IN', 'W'],
      ['W-A1', 'W', 'A1', [p(100, 230), ...arc(200, 230, 100, 180, 270)]],
      ['A1-T', 'A1', 'T'],
      ['T-A2', 'T', 'A2'],
      ['A2-E', 'A2', 'E', [p(700, 130), ...arc(700, 230, 100, 270, 360)]],
      ['E-B2', 'E', 'B2', [p(800, 430), ...arc(700, 430, 100, 0, 90)]],
      ['B2-B', 'B2', 'B'],
      ['B-B1', 'B', 'B1'],
      ['B1-W', 'B1', 'W', [p(200, 530), ...arc(200, 430, 100, 90, 180)]],
      ['W-L', 'W', 'L'],
      ['L-C', 'L', 'C'],
      ['C-R', 'C', 'R'],
      ['R-E', 'R', 'E'],
      ['T-C', 'T', 'C'],
      ['C-B', 'C', 'B'],
      ['E-OUT', 'E', 'OUT'],
    ]),
  },
  processSec,
  weight: { 'W-A1': 0.5, 'W-L': 0.5, 'T-A2': 0.6, 'T-C': 0.4, 'C-R': 0.7, 'C-B': 0.3, 'E-OUT': 0.75, 'E-B2': 0.25 },
  inspection: ['R', 'E'],
  loads: { IN: ['robot_arm', 'robot_arm', 'robot_part', 'robot_part', 'car_plastics'] },
  carriers: 20,
  firstFaultSegment: 'L-C',
}
