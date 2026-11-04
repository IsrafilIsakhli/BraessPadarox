# Secrets and configuration

Copy `.env.example` to `.env` for local configuration. Keep the example values
empty for secrets. Supply production secrets through the hosting provider's
environment settings. Never put a provider key in a `VITE_` variable: those
values are included in browser code. `TOMTOM_API_KEY` belongs only on the API.

Environment files and common private-key files are ignored by Git and Docker.
Before committing, run `python scripts/check_secrets.py`. To check all branch
and tag history, run `python scripts/check_secrets.py --all-history`. GitHub
Actions runs the history check on pushes and pull requests. Pattern checks
cannot identify every possible secret and do not prevent a push by themselves.

If a secret is committed, revoke or rotate it immediately with its provider.
Deleting it or rewriting history cannot revoke copies that already exist.
GitHub may retain old commits in caches or pull request references after a
history rewrite; contact GitHub Support for sensitive-data removal as needed.
Collaborators should clone again after a history rewrite, rather than merging
old branches back into the cleaned history.
