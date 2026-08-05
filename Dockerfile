# One image for the whole workspace, run many times with different environment.
#
# This is the same property the project already claims elsewhere: a Cell is
# configuration, not code (docs/adr/0001). The image contains every app; which
# one a container runs, and which Cell it belongs to, is decided entirely by
# the command and the environment passed at run time. Building five separate
# images would produce five copies of the same node_modules and invite them to
# drift apart.
#
# Build this on the Linux host, never on Windows. @node-rs/argon2 is a native
# module and an install performed on one platform does not run on another.
# .dockerignore excludes node_modules for the same reason.

FROM node:22-bookworm-slim

# curl is used by the container healthchecks in deploy/*/docker-compose.yml.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

WORKDIR /app

# The whole workspace at once. Splitting the manifests into their own layer to
# cache the install is the usual trick, and it is not worth it here: the image
# is built once per host on the night before the competition, and a partial
# copy of a 20 package workspace is its own source of mistakes.
COPY . .

# Playwright is a devDependency of the e2e suite and of scripts/, and its
# postinstall downloads a headless Chromium of roughly 150MB. Nothing that runs
# in this image drives a browser, so skip it. Worth minutes on a fast
# connection and considerably more on a slow one.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# pnpm's defaults assume a healthy link and give up on a large tarball well
# before a poor one delivers it. next, @next/swc, sharp-libvips and turbo are
# each tens of megabytes and are the ones that fail first. A build that has to
# work on competition day, on whatever network is available, should wait rather
# than abort. Lower concurrency because parallel streams on a saturated link
# make every one of them time out instead of just being slow.
RUN pnpm config set fetch-retries 6 \
	&& pnpm config set fetch-retry-mintimeout 20000 \
	&& pnpm config set fetch-retry-maxtimeout 180000 \
	&& pnpm config set fetch-timeout 600000

RUN pnpm install --frozen-lockfile --network-concurrency 4

# turbo builds every app: tsc to dist for the Nest apps, next build for the
# two Next.js apps. NEXT_PUBLIC_* values are inlined by Next at build time, so
# they must be present here rather than at run time. See deploy/build.sh.
ARG NEXT_PUBLIC_IDENTITY_API_URL
ARG NEXT_PUBLIC_RECOVERY_API_URL
ENV NEXT_PUBLIC_IDENTITY_API_URL=$NEXT_PUBLIC_IDENTITY_API_URL
ENV NEXT_PUBLIC_RECOVERY_API_URL=$NEXT_PUBLIC_RECOVERY_API_URL

RUN pnpm run build

ENV NODE_ENV=production

# No CMD on purpose. Every service in the compose files states its own command,
# so reading the compose file tells you the whole story of what runs where.
