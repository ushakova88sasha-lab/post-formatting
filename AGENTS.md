# AGENTS.md

## Cursor Cloud specific instructions

- As of this writing, this repository (`post-formatting`) is essentially empty: it contains only `README.md` and no application code.
- There is **no** dependency manifest (no `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, etc.), no services, and no lint/test/build tooling. There is nothing to install, run, or test yet.
- The base VM already provides common runtimes if/when code is added: Node.js 22, npm 10, Python 3.12, and git.
- Once real code and a dependency manifest are added, update the Cloud Agent update script (via the environment setup flow) to install dependencies with the appropriate package manager, and update this section with how to run, lint, test, and build the service(s).
