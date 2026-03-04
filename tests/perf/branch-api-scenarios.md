# Branch API Performance Scenarios

This file defines a lightweight regression envelope for `/api/git/branches` when `excludeSc=true`.

## Scenarios

- `10` chat branches (`sc/*`)
- `30` chat branches (`sc/*`)
- `50` chat branches (`sc/*`)

## Expected Envelope (local dev machine)

- `10`: average API helper time under `140ms`
- `30`: average API helper time under `220ms`
- `50`: average API helper time under `320ms`

The benchmark uses a temporary repository and measures the same bulk `git for-each-ref` + parse path used by the API.

## Run

```bash
pnpm bench:branches
```
