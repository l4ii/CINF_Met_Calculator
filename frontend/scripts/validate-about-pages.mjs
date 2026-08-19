import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const sourceRoot = path.join(repoRoot, 'frontend', 'src', 'components', 'shell')
const publicRoot = path.join(repoRoot, 'frontend', 'public', 'about')

const checks = [
  {
    label: 'shared about primitives',
    file: path.join(sourceRoot, 'AboutDesignPrimitives.tsx'),
    includes: ['ABOUT / {index}', 'SECTION / {index}'],
  },
  {
    label: 'department page',
    file: path.join(sourceRoot, 'MiningAboutPage.tsx'),
    includes: ['index="03"', '冶炼事业部'],
  },
  {
    label: 'about page',
    file: path.join(sourceRoot, 'AboutPage.tsx'),
    includes: ['index="01"', 'index="02"', 'aboutDepartment === \'metallurgy\'', '科研创新中心'],
  },
  ...[
    'cinf/chinalco-building.png',
    'cinf/pic1.png',
    'cinf/pic3.jpg',
    'rdc/info1.jpg',
    'rdc/info1-thumb.jpg',
    'rdc/info5.jpg',
    '2/mine-overview.jpeg',
    '2/mine-deep-shaft.jpeg',
    '2/mine-expert-liu-fanglai.jpeg',
  ].map((relativePath) => ({
    label: `asset ${relativePath}`,
    file: path.join(publicRoot, relativePath),
  })),
]

const failures = []
for (const check of checks) {
  if (!fs.existsSync(check.file)) {
    failures.push(`${check.label}: missing ${path.relative(repoRoot, check.file)}`)
    continue
  }
  if (check.includes) {
    const content = fs.readFileSync(check.file, 'utf8')
    for (const expected of check.includes) {
      if (!content.includes(expected)) {
        failures.push(`${check.label}: missing ${JSON.stringify(expected)}`)
      }
    }
  }
}

if (failures.length) {
  console.error('About page contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`About page contract passed (${checks.length} checks).`)
}
