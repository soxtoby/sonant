# Sonant

Give application events a clear, structured voice with message templates, context, tracing, and pluggable sinks.

## Getting started

Add the package to your project with NPM or your preferred package manager:

```bash
npm install sonant
```

## Usage

```ts
import { createLevelSwitch, createLogger } from "sonant"
import { ConsoleSink } from "sonant/sinks/console"
import { SeqSink } from "sonant/sinks/seq"

let levelSwitch = createLevelSwitch("info");

let logger = createLogger({
  minimumLevel: levelSwitch, // Or "info" for a static level
  sinks: [
    new ConsoleSink(),
    new SeqSink({ serverUrl: "http://localhost:5341" })
  ]
})

logger.info("User {UserId} logged in from {IpAddress}", userId, ipAddress);

let requestLogger = logger.with({ RequestId: requestId });
requestLogger.warn(error, "Retrying {Operation}", operation);

levelSwitch.minimumLevel = "debug";

await logger.flush();
await logger.close();
```