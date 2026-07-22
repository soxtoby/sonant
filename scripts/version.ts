type ReleaseType = 'major' | 'minor' | 'patch'

if (import.meta.main)
	await prepareRelease()

async function prepareRelease(): Promise<void> {
	let changelog = await Bun.file('CHANGELOG.md').text()
	let packageJson = await Bun.file('package.json').json()
	let unreleased = readUnreleased(changelog)
	let version = bumpVersion(packageJson.version, inferReleaseType(unreleased))
	let nextChangelog = promoteRelease(changelog, version)

	packageJson.version = version
	await Bun.write('CHANGELOG.md', nextChangelog)
	await Bun.write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
	console.log(version)
}

export function promoteRelease(changelog: string, version: string): string {
	return changelog.replace(
		/## Unreleased\s*([\s\S]*?)(?=\n## |$)/,
		`## Unreleased\n\n## v${version}\n\n$1`,
	)
}

export function inferReleaseType(unreleased: string): ReleaseType {
	if (hasEntries(unreleased, 'Breaking'))
		return 'major'
	else if (hasEntries(unreleased, 'Added') || hasEntries(unreleased, 'Changed'))
		return 'minor'
	else if (hasEntries(unreleased, 'Fixed'))
		return 'patch'
	else
		throw new Error('Unreleased has no changes')
}

export function bumpVersion(version: string, releaseType: ReleaseType): string {
	let match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
	if (!match)
		throw new Error(`Invalid package version: ${version}`)

	let major = Number(match[1])
	let minor = Number(match[2])
	let patch = Number(match[3])

	if (releaseType == 'major')
		return `${major + 1}.0.0`
	else if (releaseType == 'minor')
		return `${major}.${minor + 1}.0`
	else
		return `${major}.${minor}.${patch + 1}`
}

export function readReleaseNotes(changelog: string, version: string): string {
	let escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	let pattern = new RegExp(`## v${escapedVersion}\\n([\\s\\S]*?)(?=\\n## |$)`)
	let notes = pattern.exec(changelog)?.[1]?.trim()
	if (!notes)
		throw new Error(`CHANGELOG.md has no notes for ${version}`)
	return notes
}

function readUnreleased(changelog: string): string {
	let match = /## Unreleased\s*([\s\S]*?)(?=\n## |$)/.exec(changelog)
	if (!match)
		throw new Error('CHANGELOG.md has no Unreleased section')
	return match[1] ?? ''
}

function hasEntries(unreleased: string, category: string): boolean {
	let pattern = new RegExp(`### ${category}\\s*([\\s\\S]*?)(?=\\n### |$)`)
	let content = pattern.exec(unreleased)?.[1] ?? ''
	return /^\s*[-*]\s+\S/m.test(content)
}
