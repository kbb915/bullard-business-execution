# Two-Minute Execution publishing

Two-Minute Execution uses Markdown source files in `content/two-minute-execution/` and generates public static pages for GitHub Pages.

## Publish a message

1. Copy an existing message file and give it a unique lowercase, hyphenated filename and slug.
2. Complete the JSON front matter and the `Thought`, `Question`, and `Action` sections.
3. Keep `"status": "draft"` while editing.
4. Use the local draft preview when needed:

   ```sh
   node scripts/build-two-minute-execution.mjs --preview-drafts
   ```

5. Change the approved entry to `"status": "published"`.
6. Generate production-safe pages:

   ```sh
   node scripts/build-two-minute-execution.mjs
   ```

7. Validate the output:

   ```sh
   node scripts/validate-two-minute-execution.mjs
   ```

Always run the generator without `--preview-drafts` before committing. Production output includes only published entries.

## Categories

Edit `content/two-minute-execution/categories.json` to add, remove, or rename categories. Every message category must exactly match one of those values. Regenerate the site after changing the category list.

## Optional fields

Source, audio, and video fields may be left as empty strings. Their page sections are generated only when corresponding content exists.

Use `relatedMessages` for manual relationships. The generator fills remaining related slots by category and shared keywords.
