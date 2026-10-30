# Serve Hover Previews from a static, per-Note Preview Payload

Hover Previews read a Preview Payload (`{ title, properties, html }`) that is prerendered at build time, one JSON file per Note, and fetched on first hover. The body is a rendered HTML string, and the Properties Panel is rendered on the client from the `properties` data, so its open or closed state can persist. A link to a heading or block uses the same payload: the client slices the section or block out of the cached Note instead of fetching a payload per Subpath.

The template deploys on Vercel's Node runtime, where a Server Action returning JSX would have worked and reused the real server components. We chose static payloads anyway: they are CDN-cacheable and cost no function invocation per hover, and they keep the template deployable to any static host. Fetching an RSC payload directly was rejected because the Next.js docs describe no supported API for it.

## Considered options

- **Server Action returning JSX**: nothing re-implemented, but every hover is an uncacheable POST that needs a running server.
- **One payload per Note and Subpath**: smaller responses, but the file count grows with every distinct reference.
- **Inline a hidden copy of each target in the page**: no fetch, but every page grows with every link it contains.

## Consequences

Anything a Note renders must survive being serialized to an HTML string, so interactive client components inside a Note body are inert in a Hover Preview. Links inside a preview that point at a Note open their own Hover Previews, with no depth limit. This works because the client renders the Preview Payload's body as React elements, not as an injected string, and the payload marks eligible links with their target's Slug.

The body is rendered from the same compiled MDX and remark/rehype pipeline as the page, so Callouts, Highlights, math and Embeds match. It is not rendered with the Fumadocs MDX components, which are client components that cannot be rendered to a string. A Hover Preview therefore has plain headings and code blocks, without the Fumadocs heading anchors or code-block chrome.
