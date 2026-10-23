# Developer and CI entry points. `make help` lists targets.
# CI calls the same targets, so local results match pipeline results.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
# GNU Make 3.81 (the /usr/bin/make on macOS) ignores .SHELLFLAGS, which arrived in 3.82, so recipes there would run without these flags and loops would keep going after a failed command. Make 3.81 does accept a SHELL with arguments, so pass it the same flags and local runs fail exactly when CI's would.
ifeq ($(MAKE_VERSION),3.81)
SHELL := bash $(filter-out -c,$(.SHELLFLAGS))
endif
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

##@ Quality gates (same as CI)

.PHONY: check
check: lint test records-test records-check secrets-scan ## Run everything CI runs

.PHONY: lint
lint: actions-lint scripts-lint ## Run every linter (add the project's linters here)

.PHONY: test
test: ## Run every test suite (replace with the project's test command)
	@echo "::warning::No tests defined yet. Replace the 'test' target in the Makefile."

.PHONY: actions-lint
actions-lint: ## Lint GitHub Actions workflows (uses shellcheck on run: blocks when installed)
	actionlint

.PHONY: scripts-lint
scripts-lint: ## shellcheck every tracked shell script
	@files="$$(git ls-files '*.sh')"; \
	if [[ -n "$${files}" ]]; then shellcheck $${files}; else echo "No shell scripts to check."; fi

##@ Decision and assumption records (ADR-0000)

# CI passes the PR's base commit and head branch. Locally the defaults compare against origin/main.
RECORDS_BASE ?= origin/main
RECORDS_BRANCH ?= $(shell git branch --show-current 2>/dev/null)

.PHONY: records
records: ## Print the ADR and assumption tables built from the record files
	@python3 docs/tools/record_index.py

.PHONY: records-check
records-check: ## Fail on misnamed, duplicate, or incomplete ADR and assumption files
	python3 docs/tools/record_index.py --check
	@if [[ -n "$(RECORDS_BRANCH)" ]]; then \
	  git diff --name-only --diff-filter=AR "$(RECORDS_BASE)...HEAD" \
	    | python3 docs/tools/check_record_ids.py --branch "$(RECORDS_BRANCH)"; \
	else \
	  python3 docs/tools/check_record_ids.py </dev/null; \
	fi

.PHONY: records-test
records-test: ## Unit tests for the record tools (Python 3 standard library only)
	@# -b drops passing tests' output, so the checks' ::warning:: and ::error:: lines do not become CI annotations.
	PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/tools -p 'test_*.py' -b

.PHONY: secrets-scan
secrets-scan: ## Scan the full git history for secrets
	gitleaks git --redact --verbose --exit-code 1 .
