import { createLogger } from "../src";

const logger = createLogger();

logger.info("User {UserId}", 1);
logger.info("User {UserId} changed {UserId}", 1, 2);
logger.info("Bad {123} {User Id}");
logger.log("info", "User {UserId}", 1);
logger.log("error", new Error(), "User {UserId}", 1);

// @ts-expect-error missing argument for literal template
logger.info("User {UserId}");

// @ts-expect-error extra argument for literal template
logger.info("User {UserId}", 1, 2);

// @ts-expect-error invalid placeholders do not count toward arity
logger.info("Bad {123}", 1);

// @ts-expect-error missing argument for literal template
logger.log("info", "User {UserId}");

// @ts-expect-error extra argument for literal template
logger.log("info", "User {UserId}", 1, 2);
