# Shared platform utilities

This folder is reserved for reusable demo/playground runtime utilities.

Use `shared/` when at least two app surfaces need the same implementation.

## Planned modules

- runtime config loader/normalizer
- room connection adapter wrapper
- diagnostics event model and UI helpers
- auth/token provider abstractions for local + hosted modes

## Rules

- Keep modules framework-light where possible.
- Keep environment defaults deterministic for local startup.
- Do not embed app-specific route assumptions in shared code.
