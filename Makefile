.PHONY: build test lint fmt fmt-check actionlint release clean docs website website-dev install icons check-seo changelog bump tauri tauri-bundle tauri-test tauri-lint tauri-fmt tauri-package

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

# Build the site into tauri/webroot/, compile the shell, and run it.
tauri:
	npm run tauri

# The site, bundled into the shell, without launching anything.
tauri-bundle:
	npm run tauri:bundle

# The decision layer. Needs no GUI libraries at all — that is the whole reason
# tauri/shell/ is a separate crate from tauri/src-tauri/.
tauri-test:
	npm run tauri:test

# clippy at zero warnings, BOTH crates (this one does need the libraries).
tauri-lint:
	npm run tauri:lint

tauri-fmt:
	npm run tauri:fmt

# The installers for THIS machine's platform, into tauri/target/release/bundle.
# The release workflow runs the same command on one runner per platform.
tauri-package:
	npm run tauri:package

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
