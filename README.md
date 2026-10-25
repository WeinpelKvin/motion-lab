# Motion Lab

A single-page gallery for motion experiments. Sidebar on the left, the running piece fills the rest.

## Run it
    npm install
    npm run dev        # local preview
    npm run build      # static site in dist/

## Add a project
1. Put a component in `src/projects/` (default export, canvas fills its parent, like the existing ones).
2. Add one entry to `src/registry.ts`.

Each project gets its own link, e.g. `index.html#/flocking`. Up/Down arrows (or j/k) step through them.

## Host it
https://weinpelkvin.github.io/motion-lab/#/kinetic-type
