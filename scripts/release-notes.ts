import { readReleaseNotes } from "./version"

let version = Bun.argv[2]
if (!version)
  throw new Error('Usage: bun scripts/release-notes.ts <version>')

let changelog = await Bun.file('CHANGELOG.md').text()
console.log(readReleaseNotes(changelog, version))
