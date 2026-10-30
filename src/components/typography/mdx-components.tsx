import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { JSX } from "react";

// Fumadocs maps `img` to next/image, which requires width/height that
// Obsidian image embeds (`![[Zumbi.png]]`) don't have — every page with an
// embedded image 500s. Vault images are static files under /vault.
function Img(props: JSX.IntrinsicElements["img"]) {
  return <img alt={props.alt} {...props} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: Img,
    ...components,
  };
}
