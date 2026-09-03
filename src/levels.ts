import type { Level, LevelSwitch } from "./types.js"

let levelValues: Record<Level, number> = {
    verbose: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
}

export function createLevelSwitch(minimumLevel: Level): LevelSwitch {
    return { minimumLevel }
}

export function isLevelEnabled(level: Level, minimumLevel: Level): boolean {
    return levelValues[level] >= levelValues[minimumLevel]
}

export function resolveMinimumLevel(minimumLevel: Level | LevelSwitch | undefined): Level {
    return minimumLevel && typeof minimumLevel == 'object'
        ? minimumLevel.minimumLevel
        : minimumLevel ?? 'info'
}
