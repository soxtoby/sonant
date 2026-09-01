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
    enrich(event) {
        event.properties.RequestId = requestContext.requestId
    },
    sinks: [
        new ConsoleSink(),
        new SeqSink({ serverUrl: "http://localhost:5341" })
    ]
})

logger.info("User {UserId} logged in from {IpAddress}", { UserId: userId, IpAddress: ipAddress });

let requestLogger = logger.with({ RequestId: requestId });
requestLogger.warn(error, "Retrying {Operation}", { Operation: operation });

levelSwitch.minimumLevel = "debug";

await logger.flush();
await logger.close();
```

For literal message templates, TypeScript requires the properties object to contain exactly the named placeholders. Repeated placeholders read the same property.
