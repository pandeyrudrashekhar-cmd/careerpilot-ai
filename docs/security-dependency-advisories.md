# Backend dependency advisories

The backend lockfile currently reports three high-severity npm audit entries
for one transitive advisory: `deepmerge-ts` GHSA-ggr8-5vv4-36mx. The dependency
path is:

```text
prisma@6.19.3
└─ @prisma/config@6.19.3
   └─ deepmerge-ts@7.1.5
```

The affected `deepmerge-ts` range is `<8.0.0`; its patched release starts at
`8.0.0`. npm currently offers `prisma@7.10.1` as the Prisma-level fix. There
is no patched Prisma 6 release in the audit metadata. `@prisma/config@6.19.3`
pins `deepmerge-ts@7.1.5` exactly, so overriding this internal dependency to
major version 8 would be an unsupported dependency combination. Prisma 7 is a
major upgrade and is not included in this sprint; migrate it separately with
schema/client generation and runtime compatibility tests.

The Prisma CLI is declared as a backend development dependency, while
`prisma`, `@prisma/config`, and `deepmerge-ts` are marked `devOptional` in the
lockfile because Prisma is an optional peer of `@prisma/client`. npm still
reports the three high entries with `npm audit --omit=dev` for this resolved
lock graph. The finding comes from Prisma's configuration/merge path, not a
change to application queries. The three entries refer to the same advisory
at the `deepmerge-ts`, `@prisma/config`, and `prisma` levels; they are not
three independent CVEs. Recheck with `npm audit` after the Prisma migration.

The separate moderate advisory remains at `minimatch@10.2.6`, reached through
`nodemon@3.1.14`. Its patched range starts at `minimatch@11.0.1`, which is
outside the `^10.2.1` range declared by the current nodemon release. A normal
`npm audit fix` made no changes. Do not force an unsupported transitive major
override; update nodemon when it supports a patched minimatch release, or
validate a deliberate toolchain update separately.
