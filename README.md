# shader-gallery / shaders

The shader catalog behind [shader.gallery](https://shader.gallery) — a curated
collection of single-pass fragment shaders by **E. T. Carter**.

Each shader lives in its own directory:

```
<slug>/
├── shader.frag    # GLSL fragment shader (single pass)
├── meta.json      # name, family, author, tags, description, params, palette, post
└── poster.webp    # static preview frame
```

`manifest.json` lists every shader slug and the family categories.

## Using these shaders

The catalog is served from a CDN and consumed by the
[`@shader-gallery/runtime`](https://www.npmjs.com/package/@shader-gallery/runtime)
and the `shader-gallery` CLI. You can also read `shader.frag` + `meta.json`
directly — each shader is a self-contained `mainImage`-style pass driven by the
uniforms declared in its `meta.json` `params`.

## License

The shader source and metadata in this repository are licensed
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** —
see [LICENSE](./LICENSE). Attribute **E. T. Carter / shader.gallery** and share
derivatives under the same license.
