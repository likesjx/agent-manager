# Team Shared Library

This folder is the shared catalog for team-reusable:

- agents
- hooks
- skills
- plugins
- prompts
- tools

Registry source of truth:

- `library/manifests/team-library.json`

Validation:

- `node scripts/library-check.js`

Recommended onboarding flow for new entries:

1. Add file under the correct library subfolder.
2. Register entry in `library/manifests/team-library.json`.
3. Run `npm run validate`.
