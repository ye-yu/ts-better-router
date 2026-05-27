import * as module from "module"
import { cachedFetch } from "./cached-fetch.ts";

const resp = await cachedFetch()("https://raw.githubusercontent.com/expressjs/express/refs/heads/master/test/Router.js")
const expressRouterTest = resp.ok ? await resp.text() : null
const expressRouterTestToken = "express-router-test"

module.registerHooks({
    resolve(specifier, context, next) {
        console.log("Loading:", specifier)
        if (specifier === expressRouterTestToken) {
            if (!expressRouterTest) {
                throw new Error("Failed to fetch express router test")
            }
            return {
                format: "commonjs",
                url: expressRouterTestToken,
                shortCircuit: true,
            }
        }
        return next(specifier, context)
    },
    load(url, context, next) {
        if (url != expressRouterTestToken) {
            return next(url, context)
        }
        if (!expressRouterTest) {
            throw new Error("Failed to fetch express router test")

        }
        return {
            format: "commonjs",
            source: [
                "var { describe, it }  = require('node:test')",
                expressRouterTest
            ].join('\n'),
        }
    }
})