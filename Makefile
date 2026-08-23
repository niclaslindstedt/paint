.PHONY: build test lint fmt fmt-check actionlint release clean docs website website-dev install icons check-seo changelog bump tauri tauri-fast tauri-bundle tauri-install tauri-test tauri-lint tauri-fmt tauri-fmt-check tauri-package tauri-package-debug tauri-clean

build:
	npm run build

test:
	npm test

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

release:
	npm run build

clean:
	rm -rf dist node_modules

install:
	npm install

# Regenerate the PWA install icons, the favicon, and the Open Graph image from
# the app mark. Pure Node — no native image dependencies.
icons:
	npm run icons

actionlint:
	actionlint -color

# The desktop shell (tauri/) — a thin Tauri wrapper around this same app.
#
# It has its own toolchain, so `make test` and `make lint` deliberately stop at
# its edge and these targets are how it is reached instead;
# .github/workflows/desktop-tauri.yml runs the two check targets on every push
# that touches it, so a tree somebody forgot to check is a red PR rather than a
# surprise at release time. Needs a Rust toolchain (https://rustup.rs) plus the
# platform's webview development libraries — see tauri/README.md.

# --- running it ---

# Build the site into tauri/webroot/, compile the shell, and run it. This is
# the one to reach for; the first run compiles the Rust world and takes a few
# minutes, every one after it is seconds.
tauri:
	npm run tauri

# The same, but WITHOUT rebuilding the site — it re-copies whatever dist/
# already holds. Much quicker while iterating on the Rust, and wrong the moment
# you have touched the app, so reach for plain `make tauri` when in doubt.
tauri-fast:
	npm run tauri:fast

# The site, bundled into the shell, without launching anything.
tauri-bundle:
	npm run tauri:bundle

# The shell's own npm tooling (the Tauri CLI). `make tauri` needs none of it —
# only packaging does, and the packaging targets run this for you.
tauri-install:
	npm run tauri:install

# --- checking it ---

# The decision layer. Needs no GUI libraries at all — that is the whole reason
# tauri/shell/ is a separate crate from tauri/src-tauri/.
tauri-test:
	npm run tauri:test

# clippy at zero warnings, BOTH crates (this one does need the libraries).
tauri-lint:
	npm run tauri:lint

tauri-fmt:
	npm run tauri:fmt

tauri-fmt-check:
	npm run tauri:fmt:check

# --- packaging it ---

# The installers for THIS machine's platform, into tauri/target/release/bundle
# — a .exe on Windows, a .dmg on macOS, a .deb and an .AppImage on Linux. The
# release workflow runs exactly this on one runner per platform.
#
# Pass anything `tauri build` takes through ARGS, e.g. cross-compiling on a Mac:
#   make tauri-package ARGS="--target aarch64-apple-darwin"
tauri-package:
	npm run tauri:package -- $(ARGS)

# The same, built with the debug profile. Minutes faster than the release one
# (no LTO, no stripping) and the bundles are much bigger — for answering "does
# this still package on my machine" without waiting for a shipping build.
tauri-package-debug:
	npm run tauri:package:debug -- $(ARGS)

# `cargo clean` — the Rust target directory is gigabytes once it has built a
# release. The bundled webroot is left alone; every build replaces it wholesale.
tauri-clean:
	npm run tauri:clean

docs:
	@echo "see docs/"

# The app IS the website: pages.yml builds it with the Pages base path and
# deploys dist/. These targets mirror that for local inspection.
website:
	VITE_BASE=/paint/ npm run build

website-dev:
	npm run dev

check-seo:
	npm run build && npm run check:seo

# Local preview of what the Release workflow will write to CHANGELOG.md.
# Pass the planned version: `make changelog VERSION=0.2.0`. Consumes the
# fragments in .changes/unreleased/ — run inside a scratch branch or revert
# afterwards if you only wanted a preview.
changelog:
	@test -n "$(VERSION)" || { \
		echo "usage: make changelog VERSION=X.Y.Z"; exit 2; \
	}
	node scripts/release/collate-changelog.mjs $(VERSION)

# Print the semver bump (patch/minor/major) the Release workflow will
# auto-derive from the current .changes/unreleased/ fragments. Read-only.
bump:
	@node scripts/release/compute-bump.mjs
