---
# Changes should be put under Breaking, Added, Changed, or Fixed headings
---

# Changelog

## Unreleased

## v0.2.0

### Changed

- Require `seq-logging` 3.x for native trace-field support.
- Replace `LogEvent.elapsedMs` with the activity's `startTimestamp`.

### Fixed

- Forward trace identifiers, parent context, and activity timing through the Seq sink.

## v0.1.0

### Added

- Structured logging across six severity levels with typed message templates and error metadata.
- Static and dynamically switchable minimum levels.
- Child loggers with normalized context properties.
- Safe structured-value destructuring with depth, collection, circular-reference, and failure handling.
- Timed activities with trace propagation, ambient async context, and child activity loggers.
- Browser-safe core and console sink, plus an optional Seq sink.
- Sink lifecycle management, internal self-logging, a no-op logger, and message formatting helpers.
