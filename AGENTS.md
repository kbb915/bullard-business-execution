# Bullard Business Execution Agent Rules

## Repo path
This repository lives at:
~/Sites/bullard-business-execution

## Purpose
This repo hosts static HTML pages on GitHub Pages.

## Publishing rules
- Store proposals at: proposals/[client-slug]/[MM-YYYY]/
- Store assessments at: assessments/[client-slug]/[MM-YYYY]/
- Keep the original generated HTML filename.
- Also create index.html in the same folder with identical HTML.
- Use lowercase and hyphens for client folder names.
- Use relative asset paths.

## Git workflow
After creating or updating files, run:
git add .
git commit -m "Add proposal for [client name] [MM-YYYY]"
git push origin main

## Done means
- Original HTML file exists in the correct folder
- index.html exists in the same folder with identical content
- Changes are committed
- Changes are pushed to main
- Return the folder path and final GitHub Pages URL
