import fs from "fs"
import path from "path"
import * as module from "module"
import { cachedFetch } from "./cached-fetch.ts";
import * as diff from "diff"
import { fileURLToPath } from "url";
import { Router, methods } from "../src/router.ts";

const resp = await cachedFetch()("https://raw.githubusercontent.com/expressjs/express/refs/heads/master/test/Router.js")
const expressRouterTest = resp.ok ? await resp.text() : null
const expressRouterTestToken = "express-router-test"

const currentDir = fileURLToPath(import.meta.url)
const patchDir = path.join(path.dirname(currentDir), "..", "patches")
const patchPath = path.join(patchDir, "Router.js.patch")
const expressRouterTestPatch = fs.readFileSync(patchPath, "utf-8")

Object.assign(globalThis, { Router, methods })

module.registerHooks({
    resolve(specifier, context, next) {
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

        const patched = diff.applyPatch(expressRouterTest, expressRouterTestPatch)
        if (patched === false) {
            throw new Error("Failed to apply patch to express router test", { cause: expressRouterTestPatch })
        }
        return {
            format: "commonjs",
            source: [
                "var { describe, it: _it }  = require('node:test');",
                "it = (name, fn) => _it(name, function (done) { this.timeout = () => void 0; Reflect.apply(fn, this, [done]) });",
                patched,
            ].join('\n'),
            shortCircuit: true,
        }
    }
})