import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface Project {
  /** Used in the URL: yoursite.com/#/flocking */
  id: string
  label: string
  /** Technique or category, shown under the title */
  tag: string
  /** One plain sentence about what you're looking at */
  description: string
  /** Optional, e.g. '2026-10-03'. Shown next to the tag when set. */
  added?: string
  component: LazyExoticComponent<ComponentType>
}

/**
 * ADD A NEW PROJECT:
 *  1. Drop a component file in src/projects/ (default export, fills its parent).
 *  2. Add one entry below. Newest at the bottom.
 */
export const projects: Project[] = [
  {
    id: 'particle-field',
    label: 'Particle Field',
    tag: 'generative',
    description: 'Drifting points that draw a line to any neighbour within range.',
    component: lazy(() => import('./projects/ParticleField')),
  },
  {
    id: 'lissajous',
    label: 'Lissajous',
    tag: 'parametric',
    description: 'A curve traced by two sine waves running at different frequencies.',
    component: lazy(() => import('./projects/Lissajous')),
  },
  {
    id: 'wave-morph',
    label: 'Wave Morph',
    tag: 'oscillation',
    description: 'Layered waves that blend into one another over time.',
    component: lazy(() => import('./projects/WaveMorph')),
  },
  {
    id: 'clifford',
    label: 'Clifford Attractor',
    tag: 'chaos',
    description: 'Hundreds of thousands of points plotted until a chaotic shape appears.',
    component: lazy(() => import('./projects/Attractor')),
  },
  {
    id: 'pulse-grid',
    label: 'Pulse Grid',
    tag: 'rhythm',
    description: 'A grid of cells pulsing in a travelling rhythm.',
    component: lazy(() => import('./projects/PulseGrid')),
  },
  {
    id: 'flocking',
    label: 'Flocking',
    tag: 'boids',
    description: 'Boids that steer by separation, alignment and cohesion. Move the cursor to interact.',
    component: lazy(() => import('./projects/Flocking')),
  },
]
