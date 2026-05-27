import path from "path"
import fs from "fs"
import os from "os"

const tmpDir = os.tmpdir()
const etagStoragePath = path.join(tmpDir, "etags.json")

type Etag = {
    tag: string,
    content: string,
    status: number,
    statusText: string,
    headers: Record<string, any>
}

export function cachedFetch(): typeof fetch {
    return async (url, init) => {
        let loadedEtags: Record<string, Etag> = {}
        try {
            const etagData = fs.readFileSync(etagStoragePath, "utf-8")
            loadedEtags = JSON.parse(etagData)
        } catch (error) {
            // Ignore JSON parse errors
        }

        const etag = loadedEtags[`${url}`]
        const headers = init?.headers ?? new Headers
        if (etag) {
            if (headers instanceof Headers) {
                headers.set("If-None-Match", etag.tag)
            } else if (Array.isArray(headers)) {
                headers.push(["If-None-Match", etag.tag])
            } else {
                headers["If-None-Match"] = etag.tag
            }
        }
        const resp = await fetch(url, {
            ...init,
            headers
        })

        if (resp.status === 304) {
            const cachedHeaders = new Headers(etag.headers)

            // Not modified, use cached content
            return new Response(etag.content, {
                status: etag.status,
                statusText: etag.statusText,
                headers: cachedHeaders
            })
        }


        const copy = resp.clone()
        const content = await copy.text()
        const respHeaders = copy.headers


        const respEtag = resp.headers.get("ETag")
        if (respEtag) {
            loadedEtags[`${url}`] = {
                tag: JSON.stringify(respEtag),
                content, status: resp.status,
                statusText: resp.statusText,
                headers: Object.fromEntries(respHeaders)
            }
            fs.writeFileSync(etagStoragePath, JSON.stringify(loadedEtags))
        }

        return resp
    }
}