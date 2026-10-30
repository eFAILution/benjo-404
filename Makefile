# Developer entry points. `make help` lists targets.
# There is no CI (ADR-0006). The pre-push hook runs `make verify`, so run it yourself before you push.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
# GNU Make 3.81 (the /usr/bin/make on macOS) ignores .SHELLFLAGS, which arrived in 3.82, so recipes there would run without these flags and loops would keep going after a failed command. Make 3.81 does accept a SHELL with arguments, so pass it the same flags and every make fails the same way.
ifeq ($(MAKE_VERSION),3.81)
SHELL := bash $(filter-out -c,$(.SHELLFLAGS))
endif
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

##@ Quality gates (ADR-0006)

.PHONY: check
check: verify secrets-scan ## Run every check, including the full-history secret scan

.PHONY: verify
verify: lint test records-test records-check ## Run what the pre-push hook runs

.PHONY: lint
lint: scripts-lint ## Run every linter (shellcheck, Biome, tsc --noEmit)
	pnpm run lint

.PHONY: test
test: ## Run every test suite, then build dist/ and check it (budgets, CSP hashes, content)
	@# Node's runner exits 0 when its glob matches nothing, which is how #32 passed on Windows with
	@# no tests run. The summary line is "ℹ tests N" (or "# tests N" from the TAP reporter).
	@log="$$(mktemp)"; trap 'rm -f "$${log}"' EXIT; \
	pnpm run test 2>&1 | tee "$${log}"; \
	if ! grep -Eq '^(ℹ|#) tests [1-9]' "$${log}"; then \
	  echo "::error::the test run found no tests; check the glob in package.json (#53)"; exit 1; \
	fi
	pnpm run build
	pnpm run check

##@ Build

.PHONY: build
build: ## Build dist/404.html, dist/csp.txt and dist/embed/
	pnpm run build

.PHONY: dev
dev: build ## Build and print the file path to open
	@echo "open dist/404.html?game=runner&theme=halloween"

.PHONY: scripts-lint
scripts-lint: ## shellcheck every tracked shell script
	@files="$$(git ls-files '*.sh')"; \
	if [[ -n "$${files}" ]]; then shellcheck $${files}; else echo "No shell scripts to check."; fi

##@ Decision and assumption records (ADR-0000)

# The defaults compare the current branch against origin/main.
RECORDS_BASE ?= origin/main
RECORDS_BRANCH ?= $(shell git branch --show-current 2>/dev/null)
# The recipe reads these from the environment. Make pastes $(VAR) into the shell command as text, and a PR's branch
# name is attacker-controlled: `feat/1-$$(curl${IFS}...)` is a valid git branch name.
export RECORDS_BASE RECORDS_BRANCH

.PHONY: records
records: ## Print the ADR and assumption tables built from the record files
	@python3 docs/tools/record_index.py

.PHONY: records-check
records-check: ## Fail on misnamed, duplicate, or incomplete ADR and assumption files
	python3 docs/tools/record_index.py --check
	@if [[ -n "$${RECORDS_BRANCH}" ]]; then \
	  git diff --name-only --diff-filter=AR "$${RECORDS_BASE}...HEAD" \
	    | python3 docs/tools/check_record_ids.py --branch "$${RECORDS_BRANCH}"; \
	else \
	  python3 docs/tools/check_record_ids.py </dev/null; \
	fi

.PHONY: records-test
records-test: ## Unit tests for the record tools (Python 3 standard library only)
	@# -b drops passing tests' output, so the checks' ::warning:: and ::error:: lines do not clutter the run.
	PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/tools -p 'test_*.py' -b

.PHONY: secrets-scan
secrets-scan: ## Scan the full git history for secrets
	gitleaks git --redact --verbose --exit-code 1 .
