---
# Changes should be put under Breaking, Added, Changed, or Fixed headings
---

# Changelog

## Unreleased

## v0.5.0

### Changed

- The Seq sink now sends CLEF directly to Seq's `/ingest/clef` endpoint and no longer depends on `seq-logging`.
- Add `maxBatchingTime` and `onError` options to the Seq sink.

### Fixed

- Send errors to Seq as text instead of `[object Object]`.
- Activities now appear in Seq as spans, with start time and parent span.
- Honor the Seq sink's `eventBodyLimit` option.

## v0.4.0

### Changed

- Tighten TypeScript checks and use explicit `.js` import specifiers for Node- and browser-compatible ESM.

## v0.3.0

### Changed

- Replace positional message-template values with a properties object whose keys are checked against literal template placeholders.

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
