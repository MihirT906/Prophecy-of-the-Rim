# Quick start for participants

You have a working game and a repository of your own. Make it better, in as many different directions as you can. Every commit that lands on `main` is judged by a panel of AI judges and appears on the live map within minutes.

## Setup

1. Accept the GitHub invitation.
2. Clone your team repository, then `npm install` and `npm run dev` (http://localhost:5173).
3. Before every push, `npm run build` and `npx vitest run` must both pass.
4. AI assistants and companions: read `FOR_COMPANIONS.md` first.

## The rules

- **Only commits on `main` are judged.** Work on branches if you like, then merge them into `main`: every commit in the merge is judged on its own, the merge commit itself is not.
- **One improvement per commit.** A commit that bundles three things is judged as one change.
- **Keep `main` green.** If `main` does not build or a test fails, your team turns red and nothing counts until it builds again. Push the fix, or `git revert` the commit that broke it.
- **Never force-push `main`.** Rewritten history is not judged twice. Undo with `git revert`.
- **Push as you go.** A burst of many commits at once is judged with a growing delay.
- **Judges read code**, not commit messages or comments.

## Points, roughly

- A real, observable change earns points. Scaffolding nothing calls, renames, formatting and documentation earn nothing.
- Bigger, better-integrated changes earn more.
- Breadth wins: every distinct category you reach earns extra, and so does moving between categories.
- Opening a new category earns the most. The category list is not fixed.
- Repeating yourself pays less each time. The same change twice pays nothing.

Watch the map. If a commit does not appear after a few minutes, check that `main` builds and its tests pass.
