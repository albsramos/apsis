import { arc, curve, node, p, segments, type FactoryDef } from './build'

/** A serpentine body line with a bypass siding around Prep and a feeder joining before final assembly. */
const nodes = [
  node('IN', 'entry', 'Load', 80, 140),
  node('ST-01', 'station', 'Framing', 200, 140, '01'),
  node('ST-02', 'station', 'Weld A', 340, 140, '02'),
  node('ST-03', 'station', 'Weld B', 480, 140, '03'),
  node('ST-04', 'station', 'Geometry check', 620, 140, '04'),
  node('ST-05', 'station', 'Sealing', 700, 320, '05'),
  node('J1', 'junction', 'Bypass split', 600, 320),
  node('ST-06', 'station', 'Prep', 440, 320, '06'),
  node('BUF', 'buffer', 'Bypass buffer', 450, 380),
  node('J2', 'junction', 'Bypass merge', 300, 320),
  node('ST-07', 'station', 'Coating', 220, 320, '07'),
  node('ST-08', 'station', 'Cure', 240, 500, '08'),
  node('ST-09', 'station', 'Trim', 400, 500, '09'),
  node('J3', 'junction', 'Feeder merge', 500, 500),
  node('ST-10', 'station', 'Final assembly', 600, 500, '10'),
  node('ST-11', 'station', 'Quality gate', 760, 500, '11'),
  node('OUT', 'exit', 'Unload', 820, 500),
  node('IN2', 'entry', 'Kitting feed', 300, 600),
]

const processSec: Record<string, number> = {
  'ST-01': 5, 'ST-02': 6, 'ST-03': 6, 'ST-04': 4, 'ST-05': 5, 'ST-06': 6, 'ST-07': 6, 'ST-08': 5, 'ST-09': 5, 'ST-10': 6, 'ST-11': 4,
  BUF: 12, OUT: 3,
}

export const austin: FactoryDef = {
  factory: { id: 'us-austin', name: 'Austin', location: 'Texas, US', layoutVersion: 14 },
  layout: {
    factoryId: 'us-austin',
    version: 14,
    width: 900,
    height: 660,
    nodes,
    segments: segments(nodes, processSec, [
      ['S01', 'IN', 'ST-01'],
      ['S02', 'ST-01', 'ST-02'],
      ['S03', 'ST-02', 'ST-03'],
      ['S04', 'ST-03', 'ST-04'],
      ['S05', 'ST-04', 'ST-05', [p(760, 140), ...arc(760, 200, 60, -90, 0), p(820, 260), ...arc(760, 260, 60, 0, 90)]],
      ['S06', 'ST-05', 'J1'],
      ['S07', 'J1', 'ST-06'],
      ['S08', 'ST-06', 'J2'],
      ['S09', 'J1', 'BUF', curve(p(600, 320), p(570, 320), p(570, 380), p(540, 380))],
      ['S10', 'BUF', 'J2', curve(p(360, 380), p(330, 380), p(330, 320), p(300, 320))],
      ['S11', 'J2', 'ST-07'],
      ['S12', 'ST-07', 'ST-08', [p(140, 320), ...arc(140, 380, 60, -90, -180), p(80, 440), ...arc(140, 440, 60, 180, 90)]],
      ['S13', 'ST-08', 'ST-09'],
      ['S14', 'ST-09', 'J3'],
      ['S15', 'J3', 'ST-10'],
      ['S16', 'ST-10', 'ST-11'],
      ['S17', 'ST-11', 'OUT'],
      ['S18', 'IN2', 'J3', [p(420, 600), ...curve(p(420, 600), p(460, 600), p(460, 500), p(500, 500))]],
    ]),
  },
  processSec,
  weight: { S07: 0.86, S09: 0.14, S01: 0.8, S18: 0.2 },
  inspection: ['ST-04', 'ST-11'],
  loads: { IN: ['car_body', 'car_body', 'car_body', 'car_plastics', 'car_plastics'], IN2: ['robot_arm', 'robot_part'] },
  carriers: 26,
  firstFaultSegment: 'S07',
}
