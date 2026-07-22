import { describe, expect, test } from "bun:test"
import { bumpVersion, inferReleaseType, promoteRelease, readReleaseNotes } from "../scripts/version"

describe('inferReleaseType', () => {
    test('uses the highest-impact populated category', () => {
        expect(inferReleaseType('### Breaking\n\n- Removed API\n\n### Added\n\n- New API')).toBe('major')
        expect(inferReleaseType('### Added\n\n- New API\n\n### Fixed\n\n- Bug')).toBe('minor')
        expect(inferReleaseType('### Fixed\n\n- Bug')).toBe('patch')
    })

    test('rejects an empty release', () => {
        expect(() => inferReleaseType('### Fixed\n')).toThrow('Unreleased has no changes')
    })
})

test('bumpVersion applies semantic versioning', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
})

test('promoteRelease leaves a bare Unreleased section and adds a version heading', () => {
	let changelog = '# Changelog\n\n## Unreleased\n\n### Added\n\n- A feature\n'
	expect(promoteRelease(changelog, '0.2.0')).toBe(
		'# Changelog\n\n## Unreleased\n\n## v0.2.0\n\n### Added\n\n- A feature\n',
	)
})

test('readReleaseNotes extracts the requested release', () => {
	let changelog = '# Changelog\n\n## Unreleased\n\n## v1.2.3\n\n### Fixed\n\n- A bug\n\n## v1.2.2\n\n- Earlier'
    expect(readReleaseNotes(changelog, '1.2.3')).toBe('### Fixed\n\n- A bug')
})
