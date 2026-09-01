import { createLogger } from "../src";

const logger = createLogger();

logger.info("User {UserId}", { UserId: 1 });
logger.info("User {UserId} changed {UserId}", { UserId: 1 });
logger.info("Bad {123} {User Id}");
logger.log("info", "User {UserId}", { UserId: 1 });
logger.log("error", new Error(), "User {UserId}", { UserId: 1 });
logger.startActivity("User {UserId}", { UserId: 1 });
logger.startActivity({ level: "debug" }, "User {UserId}", { UserId: 1 });
logger.startActivity("User {UserId}", { UserId: 1 }).complete("error", new Error());
logger.startActivity("User {UserId}", { UserId: 1 }).set("UserId", 2);
logger.startActivity("User {UserId}", { UserId: 1 }).set({ UserId: 2 });
logger.currentTrace?.traceId;

// @ts-expect-error missing properties for literal template
logger.info("User {UserId}");

// @ts-expect-error missing property from literal template
logger.info("User {UserId} from {IpAddress}", { UserId: 1 });

// @ts-expect-error property is not in literal template
logger.info("User {UserId}", { UserId: 1, IpAddress: "127.0.0.1" });

let extraProperties = { UserId: 1, IpAddress: "127.0.0.1" };
// @ts-expect-error properties variable has a key that is not in the literal template
logger.info("User {UserId}", extraProperties);

// @ts-expect-error invalid placeholders do not define properties
logger.info("Bad {123}", { 123: 1 });

// @ts-expect-error missing properties for literal template
logger.log("info", "User {UserId}");

// @ts-expect-error property is not in literal template
logger.log("info", "User {UserId}", { UserId: 1, Extra: 2 });

// @ts-expect-error missing properties for literal template
logger.startActivity("User {UserId}");

// @ts-expect-error property is not in literal template
logger.startActivity("User {UserId}", { UserId: 1, Extra: 2 });

// @ts-expect-error invalid completion level
logger.startActivity("User").complete("bad");
